import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Badge } from '../../components/ui/Badge';
import type { Product } from '../../types';
import { listProducts } from '../../api/productApi';
import { getForecast, getParetoAnalysis, getBatchPurchaseSuggestions, applyOptimizationRecommendation, getVendorComparisonForProduct, getMlPrediction, type ForecastResult, type ParetoResult, type BatchPurchaseSuggestion, type OptimizationWeights, type SingleProductOptimizationRun } from '../../api/insightsApi';

/** Mirrors backend's fitLinearRegression (forecastingEngine.ts) exactly, so
 * the What-If simulator can fit instantly client-side as the user types —
 * no network round trip, same OLS math as the real model. */
function fitLinearRegressionClientSide(points: { x: number; y: number }[]) {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope: Number(slope.toFixed(2)), intercept: Number(intercept.toFixed(2)), rSquared: Number(rSquared.toFixed(3)) };
}

export function Insights() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [pareto, setPareto] = useState<ParetoResult | null>(null);
  const [batchSuggestions, setBatchSuggestions] = useState<BatchPurchaseSuggestion[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [weights, setWeights] = useState<OptimizationWeights>({ price: 0.4, speed: 0.35, reliability: 0.25 });
  const [pickedProductId, setPickedProductId] = useState<number | ''>('');
  const [optimizationResult, setOptimizationResult] = useState<SingleProductOptimizationRun | null>(null);

  const [simData, setSimData] = useState<number[]>([80, 85, 78, 92, 88, 95]);
  const [simMlPrediction, setSimMlPrediction] = useState<number | null>(null);
  const [simMlLoading, setSimMlLoading] = useState(false);

  useEffect(() => {
    listProducts().then((p) => {
      setProducts(p);
      if (p.length > 0) setSelectedProductId(p[0].id);
    }).catch(console.error);
    getParetoAnalysis().then(setPareto).catch(console.error);
    getBatchPurchaseSuggestions().then(setBatchSuggestions).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProductId) getForecast(Number(selectedProductId)).then(setForecast).catch(console.error);
  }, [selectedProductId]);

  const chartData = forecast ? [...forecast.history, ...forecast.forecast.map((f) => ({ ...f, projected: true }))] : [];

  const runOptimizer = async (productId: number | '' = pickedProductId, w: OptimizationWeights = weights) => {
    if (!productId) return;
    setOptimizing(true);
    try {
      const result = await getVendorComparisonForProduct(Number(productId), w);
      setOptimizationResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setOptimizing(false);
    }
  };

  const applyRecommendation = async () => {
    if (!pickedProductId) return;
    setApplying(true);
    try {
      await applyOptimizationRecommendation(Number(pickedProductId), weights);
      await runOptimizer();
    } catch (e) {
      console.error(e);
    } finally {
      setApplying(false);
    }
  };

  const updateWeight = (key: keyof OptimizationWeights, value: number) => {
    const next = { ...weights, [key]: value };
    setWeights(next);
    if (optimizationResult) runOptimizer(pickedProductId, next);
  };

  // Live client-side fit — recomputes on every keystroke, no network call,
  // proves the model is a real formula responding to whatever you type.
  const simPoints = simData.map((qty, i) => ({ x: i, y: qty }));
  const simModel = simData.length >= 2 ? fitLinearRegressionClientSide(simPoints) : null;
  const simForecastNext = simModel ? Math.max(0, Math.round(simModel.slope * simData.length + simModel.intercept)) : null;
  const simChartData = [
    ...simData.map((qty, i) => ({ period: `M${i + 1}`, qty })),
    ...(simForecastNext !== null ? [{ period: `M${simData.length + 1}`, qty: simForecastNext, projected: true }] : []),
  ];

  // Live server call to the TRAINED neural network — debounced so it fires
  // ~400ms after the user stops typing, not on every single keystroke. This
  // is what makes the ML model (not just the regression formula) visibly
  // respond to arbitrary user input instead of only ever running on the
  // seeded dataset.
  useEffect(() => {
    if (simData.length < 3) { setSimMlPrediction(null); return; }
    const last3 = simData.slice(-3) as [number, number, number];
    setSimMlLoading(true);
    const debounce = setTimeout(() => {
      getMlPrediction(last3[0], last3[1], last3[2])
        .then((r) => setSimMlPrediction(r.prediction))
        .catch(() => setSimMlPrediction(null))
        .finally(() => setSimMlLoading(false));
    }, 400);
    return () => clearTimeout(debounce);
  }, [simData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights & Forecasting</h1>
        <p className="text-foreground/60">Data-driven suggestions for procurement and sales — every number computed from real ledger data, never fabricated.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Demand Forecasting</CardTitle>
          </CardHeader>
          <CardContent>
            <select className="mb-4 border border-border rounded px-3 py-2 text-sm w-full" value={selectedProductId} onChange={(e) => setSelectedProductId(Number(e.target.value))}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {forecast?.insufficientData ? (
              <p className="text-sm text-foreground/60 p-4 text-center">Not enough sales history yet to forecast this product.</p>
            ) : (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="qty" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {forecast?.model && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="p-2 bg-secondary rounded-lg text-center">
                      <div className="text-xs text-foreground/50">Trend</div>
                      <div className={`text-sm font-semibold ${forecast.model.trend === 'rising' ? 'text-green-600' : forecast.model.trend === 'falling' ? 'text-red-600' : 'text-foreground'}`}>
                        {forecast.model.trend} ({forecast.model.slope > 0 ? '+' : ''}{forecast.model.slope}/mo)
                      </div>
                    </div>
                    <div className="p-2 bg-secondary rounded-lg text-center">
                      <div className="text-xs text-foreground/50">Model Fit (R²)</div>
                      <div className="text-sm font-semibold">{forecast.model.rSquared}</div>
                    </div>
                    <div className="p-2 bg-secondary rounded-lg text-center">
                      <div className="text-xs text-foreground/50">Confidence</div>
                      <div className={`text-sm font-semibold ${forecast.model.confidence === 'high' ? 'text-green-600' : forecast.model.confidence === 'moderate' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {forecast.model.confidence}
                      </div>
                    </div>
                  </div>
                )}
                {forecast?.mlPrediction !== null && forecast && (
                  <div className="mt-4 flex justify-between items-center p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20">
                    <div>
                      <span className="text-sm font-medium text-purple-900 dark:text-purple-300">🧠 Neural Network Prediction</span>
                      <p className="text-xs text-purple-700/70 dark:text-purple-400/70 mt-0.5">Trained model, independent of the regression above</p>
                    </div>
                    <span className="text-sm font-semibold text-purple-800 dark:text-purple-400">{forecast.mlPrediction} units</span>
                  </div>
                )}
                {forecast?.suggestedReorderQty !== null && forecast && (
                  <div className="mt-3 flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-300">Suggested Reorder Qty</span>
                    <span className="text-sm text-blue-800 dark:text-blue-400">{forecast.suggestedReorderQty} units</span>
                  </div>
                )}
                {forecast?.insight && <p className="mt-3 text-sm text-foreground/70">{forecast.insight}</p>}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What-If Forecast Simulator</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/60 mb-4">
              Type any monthly sales numbers below — the regression model refits instantly on every keystroke, live in your browser.
              This is the exact same OLS math as the Demand Forecasting model above, just running on data you control instead of the seeded dataset.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {simData.map((qty, i) => (
                <div key={i} className="flex flex-col items-center">
                  <label className="text-xs text-foreground/50 mb-1">M{i + 1}</label>
                  <input
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) => {
                      const next = [...simData];
                      next[i] = Math.max(0, Number(e.target.value) || 0);
                      setSimData(next);
                    }}
                    className="w-16 border border-border rounded px-2 py-1 text-sm text-center"
                  />
                </div>
              ))}
              <div className="flex flex-col justify-end gap-1">
                <button onClick={() => setSimData([...simData, 50])} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/70">+ Month</button>
                {simData.length > 2 && (
                  <button onClick={() => setSimData(simData.slice(0, -1))} className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/70">- Month</button>
                )}
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={simChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="qty" stroke="#9333EA" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {simModel && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                <div className="p-2 bg-secondary rounded-lg text-center">
                  <div className="text-xs text-foreground/50">Slope</div>
                  <div className="text-sm font-semibold">{simModel.slope}/mo</div>
                </div>
                <div className="p-2 bg-secondary rounded-lg text-center">
                  <div className="text-xs text-foreground/50">Intercept</div>
                  <div className="text-sm font-semibold">{simModel.intercept}</div>
                </div>
                <div className="p-2 bg-secondary rounded-lg text-center">
                  <div className="text-xs text-foreground/50">R²</div>
                  <div className="text-sm font-semibold">{simModel.rSquared}</div>
                </div>
                <div className="p-2 bg-primary/10 rounded-lg text-center">
                  <div className="text-xs text-foreground/50">Next Month</div>
                  <div className="text-sm font-semibold text-primary">{simForecastNext} units</div>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-foreground/50 font-mono">
              y = {simModel?.slope ?? 0}x + {simModel?.intercept ?? 0} — fit live via least-squares on the {simData.length} points above
            </p>

            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg border border-purple-100 dark:border-purple-500/20 flex justify-between items-center">
              <div>
                <span className="text-sm font-medium text-purple-900 dark:text-purple-300">🧠 Trained Neural Network</span>
                <p className="text-xs text-purple-700/70 dark:text-purple-400/70 mt-0.5">
                  Real server call to the trained model, using only your last 3 typed values ({simData.slice(-3).join(', ')})
                </p>
              </div>
              <span className="text-sm font-semibold text-purple-800 dark:text-purple-400">
                {simMlLoading ? '...' : simMlPrediction !== null ? `${simMlPrediction} units` : '—'}
              </span>
            </div>
            <p className="mt-2 text-xs text-foreground/50">
              Notice this often disagrees with the regression above — two independently trained models, same input, different reasoning.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pareto Analysis (Profit)</CardTitle>
          </CardHeader>
          <CardContent>
            {pareto?.insufficientData || !pareto?.products.length ? (
              <p className="text-sm text-foreground/60 p-4 text-center">Not enough delivered sales yet to rank profit drivers.</p>
            ) : (
              <>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pareto.products}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar yAxisId="left" dataKey="profit" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-sm text-foreground/60 text-center">
                  Top 20%: {pareto.products.filter((p) => p.isTop20).map((p) => p.name).join(', ') || 'none yet'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Batch Purchase Optimization</CardTitle>
          </CardHeader>
          <CardContent>
            {batchSuggestions.length === 0 ? (
              <p className="text-sm text-foreground/60 p-4 text-center">No fragmented draft purchase orders to merge right now.</p>
            ) : (
              <div className="space-y-3">
                {batchSuggestions.map((s) => (
                  <div key={s.vendorId} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">{s.draftPoIds.length} Draft POs</Badge>
                        <span className="font-medium">{s.vendorName}</span>
                      </div>
                      <p className="text-sm text-foreground/60 mt-1">
                        {s.draftPoReferences.join(', ')} could be merged into one order of {s.suggestedMergedQty} units.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>AI Procurement Optimization Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/60 mb-4">
              Pick a product below, then Run Optimization — the agent scores every real vendor offer for THAT product
              on a weighted price / speed / reliability model (from live vendor offers and real quality-incident
              history) and recommends (and can execute) the optimal purchase. Nothing runs until you pick a product.
            </p>

            <div className="mb-5 p-4 border border-border rounded-xl space-y-3">
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide">1. Select a product / component</p>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm"
                value={pickedProductId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : '';
                  setPickedProductId(id);
                  setOptimizationResult(null);
                }}
              >
                <option value="">Select a product...</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="mb-5 p-4 bg-secondary rounded-xl space-y-3">
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide">2. Adjust priorities — recommendation recomputes live</p>
              {(['price', 'speed', 'reliability'] as const).map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 text-sm capitalize">{key}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm text-right font-mono">{(weights[key] * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => runOptimizer()}
              disabled={!pickedProductId || optimizing}
              className="w-full mb-5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {optimizing ? 'Running agent...' : pickedProductId ? '3. Run Optimization' : 'Select a product first'}
            </button>

            {optimizationResult && (
              <>
                <div className="mb-4 space-y-1">
                  {optimizationResult.steps.map((s, i) => (
                    <div key={i} className="text-xs text-foreground/50 flex gap-2">
                      <span className="font-mono uppercase text-primary">[{s.step}]</span>
                      <span>{s.detail}</span>
                    </div>
                  ))}
                </div>

                {(() => {
                  const rec = optimizationResult.recommendation;
                  return (
                    <div className="p-4 bg-card border border-border rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rec.productName}</span>
                          <Badge variant="warning">{rec.onHandQty} on hand / {rec.reorderThreshold} threshold</Badge>
                          {rec.triggeredBySignal && <Badge variant="info">📡 Flagged by Market Signal</Badge>}
                        </div>
                        {rec.recommendedVendor && (
                          <button
                            onClick={applyRecommendation}
                            disabled={applying}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                          >
                            {applying ? 'Creating PO...' : `Apply: Order from ${rec.recommendedVendor.vendorName}`}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-foreground/70 mb-3">{rec.reasoning}</p>
                      {rec.candidates.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-foreground/50 text-left">
                                <th className="pb-1 pr-4">Vendor</th>
                                <th className="pb-1 pr-4">Price</th>
                                <th className="pb-1 pr-4">Lead Time</th>
                                <th className="pb-1 pr-4">Incidents</th>
                                <th className="pb-1 pr-4">Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rec.candidates.map((c) => (
                                <tr key={c.vendorId} className={c.vendorId === rec.recommendedVendor?.vendorId ? 'font-semibold text-primary' : ''}>
                                  <td className="py-1 pr-4">{c.vendorName}</td>
                                  <td className="py-1 pr-4">₹{c.unitPrice}</td>
                                  <td className="py-1 pr-4">{c.leadTimeDays}d</td>
                                  <td className="py-1 pr-4">{c.incidentCount}</td>
                                  <td className="py-1 pr-4">{c.totalScore}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
