import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Multi-criteria procurement optimization agent.
 *
 * For every product currently short of stock, this runs an autonomous
 * decision pipeline over live data — not a hardcoded "always use the
 * default vendor" rule:
 *
 *   1. PERCEIVE  — detect which products are below their reorder threshold
 *   2. GATHER    — pull every vendor's live offer for that product (price,
 *                  lead time) plus that vendor's real quality-incident
 *                  history from the audit trail
 *   3. SCORE     — weighted multi-criteria scoring (price, speed,
 *                  reliability) — classic operations-research optimization,
 *                  the same family of technique behind vendor-selection AI
 *   4. DECIDE    — rank vendors, pick the highest-scoring one, and produce
 *                  a human-readable justification for the decision
 *
 * Every step is returned in the response so the reasoning is fully
 * auditable — this is not a black box.
 */

const DEFAULT_WEIGHTS = { price: 0.4, speed: 0.35, reliability: 0.25 };

export interface OptimizationWeights {
  price: number;
  speed: number;
  reliability: number;
}

interface VendorScore {
  vendorId: number;
  vendorName: string;
  unitPrice: number;
  leadTimeDays: number;
  incidentCount: number;
  priceScore: number;
  speedScore: number;
  reliabilityScore: number;
  totalScore: number;
}

interface ProductRecommendation {
  productId: number;
  productName: string;
  onHandQty: number;
  reorderThreshold: number;
  shortfall: number;
  candidates: VendorScore[];
  recommendedVendor: VendorScore | null;
  reasoning: string;
  triggeredBySignal: boolean;
}

export interface OptimizationRun {
  steps: { step: string; detail: string }[];
  recommendations: ProductRecommendation[];
}

export async function runProcurementOptimization(customWeights?: Partial<OptimizationWeights>): Promise<OptimizationRun> {
  // Normalize so caller-supplied weights (e.g. from UI sliders) always sum
  // to 1 even if the three inputs don't add up cleanly — the scoring math
  // assumes a normalized weight vector.
  const raw = { ...DEFAULT_WEIGHTS, ...customWeights };
  const sum = raw.price + raw.speed + raw.reliability;
  const WEIGHTS = sum > 0 ? { price: raw.price / sum, speed: raw.speed / sum, reliability: raw.reliability / sum } : DEFAULT_WEIGHTS;

  const steps: OptimizationRun["steps"] = [];
  steps.push({
    step: "configure",
    detail: `Using weights — price: ${(WEIGHTS.price * 100).toFixed(0)}%, speed: ${(WEIGHTS.speed * 100).toFixed(0)}%, reliability: ${(WEIGHTS.reliability * 100).toFixed(0)}%.`,
  });

  // STEP 1 — PERCEIVE: two independent triggers feed the same pipeline —
  //   (a) numeric shortage: onHandQty below the configured reorder threshold
  //   (b) field intelligence: an active (non-expired) shortage/availability
  //       Market Signal reported against a product, even if its on-hand
  //       count technically still clears the threshold — a human on the
  //       ground flagging a problem is itself a valid reason to evaluate
  //       a purchase, not something the agent should ignore just because
  //       a number hasn't crossed a line yet.
  // Fetch ALL products, not just ones with a threshold set — a Market
  // Signal can flag a product that has no numeric threshold configured at
  // all (e.g. Glass Panel), and that product must still be reachable here.
  const allProducts = await prisma.product.findMany();
  const withThreshold = allProducts.filter((p) => p.lowStockThreshold !== null);
  const belowThreshold = withThreshold.filter((p) => Number(p.onHandQty) < Number(p.lowStockThreshold));

  const activeSignals = await prisma.marketSignal.findMany({
    where: {
      productId: { not: null },
      signalType: { in: ["shortage", "availability"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  const signaledProductIds = new Set(activeSignals.map((s) => s.productId));
  const signaledProducts = allProducts.filter((p) => signaledProductIds.has(p.id) && !belowThreshold.some((bp) => bp.id === p.id));

  const shortProducts = [...belowThreshold, ...signaledProducts];
  steps.push({
    step: "perceive",
    detail:
      `Scanned ${withThreshold.length} products with a reorder threshold set (${belowThreshold.length} below it), and ${activeSignals.length} active Market Signal(s)` +
      (signaledProducts.length > 0 ? ` — ${signaledProducts.length} additional product(s) flagged by field intelligence despite being above their numeric threshold.` : "."),
  });

  if (shortProducts.length === 0) {
    return { steps, recommendations: [] };
  }

  const recommendations: ProductRecommendation[] = [];

  for (const product of shortProducts) {
    const triggeredBySignal = !belowThreshold.some((bp) => bp.id === product.id);
    const effectiveThreshold = product.lowStockThreshold ? Number(product.lowStockThreshold) : Number(product.onHandQty);
    // STEP 2 — GATHER: live vendor offers + real incident history
    const offers = await prisma.vendorOffer.findMany({
      where: { productId: product.id },
      include: { vendor: true },
    });

    // A signal-triggered product may already be at/above its numeric
    // threshold — there's no real "shortfall" to compute a purchase qty
    // from, so fall back to a precautionary top-up (minOrderQty if the
    // product defines one, otherwise the threshold itself).
    const signalShortfall = Number(product.minOrderQty ?? product.lowStockThreshold ?? 10);
    const numericShortfall = effectiveThreshold - Number(product.onHandQty);
    const shortfallQty = triggeredBySignal && numericShortfall <= 0 ? signalShortfall : numericShortfall;

    if (offers.length === 0) {
      recommendations.push({
        productId: product.id,
        productName: product.name,
        onHandQty: Number(product.onHandQty),
        reorderThreshold: effectiveThreshold,
        shortfall: shortfallQty,
        candidates: [],
        recommendedVendor: null,
        reasoning: "No vendor offers exist for this product — cannot recommend a purchase.",
        triggeredBySignal,
      });
      continue;
    }

    const incidentCounts = await Promise.all(
      offers.map((o) => prisma.vendorQualityIncident.count({ where: { vendorId: o.vendorId } }))
    );

    // STEP 3 — SCORE: normalize each criterion to 0-1, weight, and sum
    const prices = offers.map((o) => Number(o.unitPrice));
    const leadTimes = offers.map((o) => o.leadTimeDays);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minLead = Math.min(...leadTimes);
    const maxLead = Math.max(...leadTimes);
    const maxIncidents = Math.max(...incidentCounts, 1);

    const candidates: VendorScore[] = offers.map((offer, i) => {
      const price = Number(offer.unitPrice);
      const leadTimeDays = offer.leadTimeDays;
      const incidentCount = incidentCounts[i];

      // Lower price/lead-time/incidents is better — invert so higher score = better.
      const priceScore = maxPrice === minPrice ? 1 : 1 - (price - minPrice) / (maxPrice - minPrice);
      const speedScore = maxLead === minLead ? 1 : 1 - (leadTimeDays - minLead) / (maxLead - minLead);
      const reliabilityScore = 1 - incidentCount / maxIncidents;

      const totalScore =
        priceScore * WEIGHTS.price + speedScore * WEIGHTS.speed + reliabilityScore * WEIGHTS.reliability;

      return {
        vendorId: offer.vendorId,
        vendorName: offer.vendor.name,
        unitPrice: price,
        leadTimeDays,
        incidentCount,
        priceScore: Number(priceScore.toFixed(3)),
        speedScore: Number(speedScore.toFixed(3)),
        reliabilityScore: Number(reliabilityScore.toFixed(3)),
        totalScore: Number(totalScore.toFixed(3)),
      };
    });

    candidates.sort((a, b) => b.totalScore - a.totalScore);
    const winner = candidates[0];

    const signalPrefix = triggeredBySignal ? `Field intelligence flagged this product (Market Signal) even though it's still above its reorder threshold. ` : "";
    const reasoning =
      signalPrefix +
      (candidates.length === 1
        ? `Only one vendor (${winner.vendorName}) offers this product — selected by default at ₹${winner.unitPrice}/unit, ${winner.leadTimeDays}-day lead time.`
        : `${winner.vendorName} scored highest (${winner.totalScore}/1.0) among ${candidates.length} vendors — ` +
          `₹${winner.unitPrice}/unit (price score ${winner.priceScore}), ${winner.leadTimeDays}-day lead time (speed score ${winner.speedScore}), ` +
          `${winner.incidentCount} quality incidents on record (reliability score ${winner.reliabilityScore}). ` +
          `Runner-up: ${candidates[1].vendorName} at ${candidates[1].totalScore}/1.0.`);

    recommendations.push({
      productId: product.id,
      productName: product.name,
      onHandQty: Number(product.onHandQty),
      reorderThreshold: effectiveThreshold,
      shortfall: shortfallQty,
      candidates,
      recommendedVendor: winner,
      reasoning,
      triggeredBySignal,
    });
  }

  steps.push({
    step: "gather_and_score",
    detail: `Pulled live vendor offers and quality-incident history for each short product, then scored every candidate vendor on a weighted price (${WEIGHTS.price}) / speed (${WEIGHTS.speed}) / reliability (${WEIGHTS.reliability}) model.`,
  });
  steps.push({
    step: "decide",
    detail: `Selected the highest-scoring vendor for each product with at least one offer.`,
  });

  return { steps, recommendations };
}

/** Executes the agent's recommendation for one product — actually creates the PO, not just a suggestion. */
export async function applyOptimizationRecommendation(productId: number, userId: number, customWeights?: Partial<OptimizationWeights>) {
  const run = await runProcurementOptimization(customWeights);
  const rec = run.recommendations.find((r) => r.productId === productId);
  if (!rec || !rec.recommendedVendor) {
    throw new Error("No recommendation available for this product");
  }

  const { createPurchaseOrder } = await import("../modules/purchase/purchase.service");
  const po = await createPurchaseOrder(
    {
      vendorId: rec.recommendedVendor.vendorId,
      lines: [{ productId, orderedQty: rec.shortfall, costUnitPrice: rec.recommendedVendor.unitPrice }],
    },
    userId
  );

  await prisma.auditLog.create({
    data: {
      module: "purchase",
      entity: "PurchaseOrder",
      recordId: po.id,
      recordRef: po.reference,
      action: "created",
      fieldChanged: "AI Optimization Agent",
      // AuditLog.newValue is a plain VARCHAR(191) — the full reasoning
      // (still returned in full in the API response) is truncated here so
      // a verbose multi-vendor comparison sentence can't overflow the
      // column and fail the whole PO creation with a P2000.
      newValue: rec.reasoning.length > 191 ? rec.reasoning.slice(0, 188) + "..." : rec.reasoning,
      userId,
    },
  });

  return { po, reasoning: rec.reasoning };
}
