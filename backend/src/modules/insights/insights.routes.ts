import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { getForecast } from "../../engines/forecastingEngine";
import { getParetoAnalysis } from "../../engines/paretoEngine";
import { getBatchPurchaseSuggestions } from "../../engines/batchPurchaseOptimizer";
import { runProcurementOptimization, applyOptimizationRecommendation, getVendorComparisonForProduct } from "../../engines/procurementOptimizationAgent";
import { predictNextMonthML } from "../../ml/demandModel";

// Read-only analytics — any authenticated user can view Insights (it never
// writes anything), so no per-field grid entry is needed for this module.
export const insightsRouter = Router();
insightsRouter.use(authMiddleware);

insightsRouter.get("/forecast/:productId", async (req, res) => res.json(await getForecast(Number(req.params.productId))));
insightsRouter.get("/pareto", async (req, res) => res.json(await getParetoAnalysis()));
insightsRouter.get("/batch-purchase-suggestions", async (req, res) => res.json(await getBatchPurchaseSuggestions()));
insightsRouter.get("/optimize-procurement", async (req, res) => {
  const { priceWeight, speedWeight, reliabilityWeight } = req.query;
  const weights =
    priceWeight || speedWeight || reliabilityWeight
      ? { price: Number(priceWeight) || 0, speed: Number(speedWeight) || 0, reliability: Number(reliabilityWeight) || 0 }
      : undefined;
  res.json(await runProcurementOptimization(weights));
});
insightsRouter.post("/optimize-procurement/:productId/apply", async (req, res) =>
  res.json(await applyOptimizationRecommendation(Number(req.params.productId), req.user!.userId, req.body?.weights))
);

// Manual lookup — compare vendors for ANY product the user picks, not just
// ones currently short. Same scoring math as the automatic scan.
insightsRouter.get("/vendor-comparison/:productId", async (req, res) => {
  const { priceWeight, speedWeight, reliabilityWeight } = req.query;
  const weights =
    priceWeight || speedWeight || reliabilityWeight
      ? { price: Number(priceWeight) || 0, speed: Number(speedWeight) || 0, reliability: Number(reliabilityWeight) || 0 }
      : undefined;
  res.json(await getVendorComparisonForProduct(Number(req.params.productId), weights));
});

// Live inference against the trained neural network for ANY 3 numbers the
// caller supplies — powers the What-If Simulator's ML side so the network
// visibly responds to arbitrary user input, not just the seeded dataset.
insightsRouter.post("/ml-predict", async (req, res) => {
  const { m1, m2, m3 } = req.body;
  if (typeof m1 !== "number" || typeof m2 !== "number" || typeof m3 !== "number") {
    return res.status(400).json({ error: "m1, m2, m3 must be numbers" });
  }
  const prediction = predictNextMonthML([m1, m2, m3]);
  res.json({ prediction: prediction !== null ? Math.round(prediction) : null });
});

// TEMPORARY one-off seeding trigger for the optimization agent's vendor
// offers/quality-incident demo data — admin-only, safe to call repeatedly
// (skipDuplicates on offers; incidents are cheap sample rows). Remove after
// production has been seeded once.
insightsRouter.post("/seed-optimization-demo-data", async (req, res) => {
  if (!req.user!.isAdmin) return res.status(403).json({ error: "Admin only" });
  const { seedOptimizationDemoData } = await import("../../prisma/addOptimizationSeedData");
  await seedOptimizationDemoData();
  res.json({ ok: true });
});
