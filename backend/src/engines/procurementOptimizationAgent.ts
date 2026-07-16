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

const WEIGHTS = { price: 0.4, speed: 0.35, reliability: 0.25 };

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
}

export interface OptimizationRun {
  steps: { step: string; detail: string }[];
  recommendations: ProductRecommendation[];
}

export async function runProcurementOptimization(): Promise<OptimizationRun> {
  const steps: OptimizationRun["steps"] = [];

  // STEP 1 — PERCEIVE: find products below their reorder threshold
  const products = await prisma.product.findMany({
    where: { lowStockThreshold: { not: null } },
  });
  const shortProducts = products.filter((p) => Number(p.onHandQty) < Number(p.lowStockThreshold));
  steps.push({
    step: "perceive",
    detail: `Scanned ${products.length} products with a reorder threshold set. Found ${shortProducts.length} below threshold.`,
  });

  if (shortProducts.length === 0) {
    return { steps, recommendations: [] };
  }

  const recommendations: ProductRecommendation[] = [];

  for (const product of shortProducts) {
    // STEP 2 — GATHER: live vendor offers + real incident history
    const offers = await prisma.vendorOffer.findMany({
      where: { productId: product.id },
      include: { vendor: true },
    });

    if (offers.length === 0) {
      recommendations.push({
        productId: product.id,
        productName: product.name,
        onHandQty: Number(product.onHandQty),
        reorderThreshold: Number(product.lowStockThreshold),
        shortfall: Number(product.lowStockThreshold) - Number(product.onHandQty),
        candidates: [],
        recommendedVendor: null,
        reasoning: "No vendor offers exist for this product — cannot recommend a purchase.",
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
    const shortfall = Number(product.lowStockThreshold) - Number(product.onHandQty);

    const reasoning =
      candidates.length === 1
        ? `Only one vendor (${winner.vendorName}) offers this product — selected by default at ₹${winner.unitPrice}/unit, ${winner.leadTimeDays}-day lead time.`
        : `${winner.vendorName} scored highest (${winner.totalScore}/1.0) among ${candidates.length} vendors — ` +
          `₹${winner.unitPrice}/unit (price score ${winner.priceScore}), ${winner.leadTimeDays}-day lead time (speed score ${winner.speedScore}), ` +
          `${winner.incidentCount} quality incidents on record (reliability score ${winner.reliabilityScore}). ` +
          `Runner-up: ${candidates[1].vendorName} at ${candidates[1].totalScore}/1.0.`;

    recommendations.push({
      productId: product.id,
      productName: product.name,
      onHandQty: Number(product.onHandQty),
      reorderThreshold: Number(product.lowStockThreshold),
      shortfall,
      candidates,
      recommendedVendor: winner,
      reasoning,
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
export async function applyOptimizationRecommendation(productId: number, userId: number) {
  const run = await runProcurementOptimization();
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
      newValue: rec.reasoning,
      userId,
    },
  });

  return { po, reasoning: rec.reasoning };
}
