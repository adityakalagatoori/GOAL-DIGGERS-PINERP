import { PrismaClient, Product } from "@prisma/client";
import { AppError } from "../middleware/errorHandler";

const prisma = new PrismaClient();

/**
 * Multi-criteria procurement optimization agent.
 *
 * For every product currently short of stock, this runs an autonomous
 * decision pipeline over live data — not a hardcoded "always use the
 * default vendor" rule:
 *
 *   1. PERCEIVE  — detect which products are below their reorder threshold
 *                  (or flagged by an active Market Signal)
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

export interface VendorScore {
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

export interface ProductRecommendation {
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

function normalizeWeights(customWeights?: Partial<OptimizationWeights>): OptimizationWeights {
  const raw = { ...DEFAULT_WEIGHTS, ...customWeights };
  const sum = raw.price + raw.speed + raw.reliability;
  return sum > 0 ? { price: raw.price / sum, speed: raw.speed / sum, reliability: raw.reliability / sum } : DEFAULT_WEIGHTS;
}

/**
 * The shared GATHER + SCORE step — given one product and a normalized
 * weight vector, pulls every vendor's live offer plus their real
 * quality-incident history and returns a ranked, fully-scored candidate
 * list. Used both by the automatic shortage scan below AND by the manual
 * "pick any product" lookup, so a user manually checking Screws sees the
 * exact same math as the agent's own automatic recommendations.
 */
async function scoreVendorsForProduct(
  product: Product,
  weights: OptimizationWeights
): Promise<{ candidates: VendorScore[]; reasoning: string; winner: VendorScore | null }> {
  const offers = await prisma.vendorOffer.findMany({
    where: { productId: product.id },
    include: { vendor: true },
  });

  if (offers.length === 0) {
    return { candidates: [], winner: null, reasoning: "No vendor offers exist for this product — cannot recommend a purchase." };
  }

  const incidentCounts = await Promise.all(
    offers.map((o) => prisma.vendorQualityIncident.count({ where: { vendorId: o.vendorId } }))
  );

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

    const totalScore = priceScore * weights.price + speedScore * weights.speed + reliabilityScore * weights.reliability;

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

  const reasoning =
    candidates.length === 1
      ? `Only one vendor (${winner.vendorName}) offers this product — selected by default at ₹${winner.unitPrice}/unit, ${winner.leadTimeDays}-day lead time.`
      : `${winner.vendorName} scored highest (${winner.totalScore}/1.0) among ${candidates.length} vendors — ` +
        `₹${winner.unitPrice}/unit (price score ${winner.priceScore}), ${winner.leadTimeDays}-day lead time (speed score ${winner.speedScore}), ` +
        `${winner.incidentCount} quality incidents on record (reliability score ${winner.reliabilityScore}). ` +
        `Runner-up: ${candidates[1].vendorName} at ${candidates[1].totalScore}/1.0.`;

  return { candidates, winner, reasoning };
}

export async function runProcurementOptimization(customWeights?: Partial<OptimizationWeights>): Promise<OptimizationRun> {
  const WEIGHTS = normalizeWeights(customWeights);

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
  // all, and that product must still be reachable here.
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

    // A signal-triggered product may already be at/above its numeric
    // threshold — there's no real "shortfall" to compute a purchase qty
    // from, so fall back to a precautionary top-up (minOrderQty if the
    // product defines one, otherwise the threshold itself).
    const signalShortfall = Number(product.minOrderQty ?? product.lowStockThreshold ?? 10);
    const numericShortfall = effectiveThreshold - Number(product.onHandQty);
    const shortfallQty = triggeredBySignal && numericShortfall <= 0 ? signalShortfall : numericShortfall;

    const { candidates, winner, reasoning } = await scoreVendorsForProduct(product, WEIGHTS);

    const signalPrefix = triggeredBySignal ? `Field intelligence flagged this product (Market Signal) even though it's still above its reorder threshold. ` : "";

    recommendations.push({
      productId: product.id,
      productName: product.name,
      onHandQty: Number(product.onHandQty),
      reorderThreshold: effectiveThreshold,
      shortfall: shortfallQty,
      candidates,
      recommendedVendor: winner,
      reasoning: signalPrefix + reasoning,
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

export interface SingleProductOptimizationRun {
  steps: { step: string; detail: string }[];
  recommendation: ProductRecommendation;
}

/**
 * Manual lookup: score every vendor for ONE chosen product, regardless of
 * whether it's currently short — lets a user pick "Screws" or "Frame
 * Clips" from a dropdown and see the same vendor comparison the automatic
 * agent would produce if that product ever went short, without waiting
 * for a real shortage. Runs the identical PERCEIVE/GATHER/SCORE/DECIDE
 * pipeline as the full-catalog scan, just scoped to one product instead
 * of scanning everything.
 */
export async function getVendorComparisonForProduct(productId: number, customWeights?: Partial<OptimizationWeights>): Promise<SingleProductOptimizationRun> {
  const WEIGHTS = normalizeWeights(customWeights);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError(404, "Product not found");

  const steps: SingleProductOptimizationRun["steps"] = [
    { step: "configure", detail: `Using weights — price: ${(WEIGHTS.price * 100).toFixed(0)}%, speed: ${(WEIGHTS.speed * 100).toFixed(0)}%, reliability: ${(WEIGHTS.reliability * 100).toFixed(0)}%.` },
    { step: "perceive", detail: `Target locked to "${product.name}" only — on hand: ${Number(product.onHandQty)}, reorder threshold: ${product.lowStockThreshold ?? "not set"}.` },
  ];

  const { candidates, winner, reasoning } = await scoreVendorsForProduct(product, WEIGHTS);
  const effectiveThreshold = product.lowStockThreshold ? Number(product.lowStockThreshold) : Number(product.onHandQty);
  const shortfall = Math.max(0, effectiveThreshold - Number(product.onHandQty));

  steps.push({
    step: "gather_and_score",
    detail:
      candidates.length > 0
        ? `Pulled ${candidates.length} live vendor offer(s) and quality-incident history, scored each on the weighted price/speed/reliability model.`
        : `No vendor offers exist for "${product.name}" — nothing to score.`,
  });
  steps.push({
    step: "decide",
    detail: winner ? `Selected ${winner.vendorName} as the highest-scoring vendor.` : "No recommendation possible — add a vendor offer for this product first.",
  });

  return {
    steps,
    recommendation: {
      productId: product.id,
      productName: product.name,
      onHandQty: Number(product.onHandQty),
      reorderThreshold: effectiveThreshold,
      shortfall: shortfall || Number(product.minOrderQty ?? 10),
      candidates,
      recommendedVendor: winner,
      reasoning,
      triggeredBySignal: false,
    },
  };
}

/** Executes the agent's recommendation for one product — actually creates the PO, not just a suggestion. */
export async function applyOptimizationRecommendation(productId: number, userId: number, customWeights?: Partial<OptimizationWeights>) {
  const { recommendation: rec } = await getVendorComparisonForProduct(productId, customWeights);
  if (!rec.recommendedVendor) {
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
