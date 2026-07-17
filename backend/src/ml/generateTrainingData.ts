/**
 * Generates synthetic monthly-sales sequences to train the demand
 * forecasting neural network. Each sequence mixes a base level, a linear
 * trend, seasonal (12-month) variation, and random noise — the same
 * ingredients real demand data has, so a model trained on this generalizes
 * to real product sales history instead of memorizing one company's
 * numbers.
 *
 * Feature engineering: every window of 4 consecutive months is turned into
 * (3 inputs, 1 target) by dividing every value by the window's own mean.
 * This ratio-based scaling is what lets ONE small network handle products
 * selling 2 units/month and products selling 200 units/month with the same
 * learned weights — the network never sees raw scale, only shape.
 */

export interface TrainingExample {
  input: [number, number, number];
  target: number;
}

function generateSequence(months: number): number[] {
  const baseLevel = 20 + Math.random() * 180; // 20-200 units/month base
  const trendPerMonth = (Math.random() - 0.5) * 4; // -2 to +2 units/month drift
  const seasonalAmplitude = baseLevel * (0.05 + Math.random() * 0.25); // 5-30% seasonal swing
  const seasonalPhase = Math.random() * 2 * Math.PI;
  const noiseStdDev = baseLevel * (0.03 + Math.random() * 0.12); // 3-15% noise

  const sequence: number[] = [];
  for (let m = 0; m < months; m++) {
    const trend = baseLevel + trendPerMonth * m;
    const seasonal = seasonalAmplitude * Math.sin((2 * Math.PI * m) / 12 + seasonalPhase);
    // Box-Muller for approximately-normal noise
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const noise = gaussian * noiseStdDev;
    sequence.push(Math.max(0, trend + seasonal + noise));
  }
  return sequence;
}

export function generateTrainingData(numSequences: number, monthsPerSequence = 18): TrainingExample[] {
  const examples: TrainingExample[] = [];

  for (let s = 0; s < numSequences; s++) {
    const sequence = generateSequence(monthsPerSequence);
    // Slide a 4-month window across the sequence: 3 months in, 1 month target.
    for (let i = 0; i + 3 < sequence.length; i++) {
      const window = [sequence[i], sequence[i + 1], sequence[i + 2], sequence[i + 3]];
      const mean = window.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      if (mean < 1e-6) continue; // skip degenerate all-zero windows
      examples.push({
        input: [window[0] / mean, window[1] / mean, window[2] / mean],
        target: window[3] / mean,
      });
    }
  }

  return examples;
}
