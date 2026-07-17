import { apiFetch } from './client';

export interface ForecastResult {
  history: { period: string; qty: number }[];
  forecast: { period: string; qty: number }[];
  suggestedReorderQty: number | null;
  insufficientData: boolean;
  insight?: string;
  model: { slope: number; intercept: number; rSquared: number; trend: string; confidence: string } | null;
  mlPrediction: number | null;
}

export interface ParetoResult {
  products: { productId: number; name: string; profit: number; cumulativePct: number; isTop20: boolean }[];
  insufficientData: boolean;
}

export interface BatchPurchaseSuggestion {
  vendorId: number;
  vendorName: string;
  draftPoIds: number[];
  draftPoReferences: string[];
  suggestedMergedQty: number;
}

export function getForecast(productId: number) {
  return apiFetch<ForecastResult>(`/api/insights/forecast/${productId}`);
}

export function getParetoAnalysis() {
  return apiFetch<ParetoResult>('/api/insights/pareto');
}

export function getBatchPurchaseSuggestions() {
  return apiFetch<BatchPurchaseSuggestion[]>('/api/insights/batch-purchase-suggestions');
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

export interface ProcurementRecommendation {
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
  recommendations: ProcurementRecommendation[];
}

export interface OptimizationWeights {
  price: number;
  speed: number;
  reliability: number;
}

export function runProcurementOptimization(weights?: OptimizationWeights) {
  const qs = weights ? `?priceWeight=${weights.price}&speedWeight=${weights.speed}&reliabilityWeight=${weights.reliability}` : '';
  return apiFetch<OptimizationRun>(`/api/insights/optimize-procurement${qs}`);
}

export function applyOptimizationRecommendation(productId: number, weights?: OptimizationWeights) {
  return apiFetch(`/api/insights/optimize-procurement/${productId}/apply`, { method: 'POST', body: { weights } });
}

export interface SingleProductOptimizationRun {
  steps: { step: string; detail: string }[];
  recommendation: ProcurementRecommendation;
}

export function getVendorComparisonForProduct(productId: number, weights?: OptimizationWeights) {
  const qs = weights ? `?priceWeight=${weights.price}&speedWeight=${weights.speed}&reliabilityWeight=${weights.reliability}` : '';
  return apiFetch<SingleProductOptimizationRun>(`/api/insights/vendor-comparison/${productId}${qs}`);
}

export function getMlPrediction(m1: number, m2: number, m3: number) {
  return apiFetch<{ prediction: number | null }>('/api/insights/ml-predict', { method: 'POST', body: { m1, m2, m3 } });
}
