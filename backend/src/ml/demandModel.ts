import fs from "fs";
import path from "path";
import { NeuralNetwork, type NetworkWeights } from "./neuralNetwork";

let cachedNet: NeuralNetwork | null = null;

function loadNet(): NeuralNetwork | null {
  if (cachedNet) return cachedNet;
  const modelPath = path.join(__dirname, "models", "demandNet.json");
  if (!fs.existsSync(modelPath)) return null;
  const weights: NetworkWeights = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
  cachedNet = new NeuralNetwork(weights.inputSize, weights.hiddenSize, weights);
  return cachedNet;
}

/**
 * Predicts next month's demand from the last 3 months of real sales
 * history, using the trained feedforward neural network (see
 * trainDemandModel.ts / neuralNetwork.ts). Same ratio-based feature
 * scaling used during training: values are divided by the 3-month mean
 * before being fed to the net, then the net's ratio output is multiplied
 * back by that mean to get a real unit prediction.
 */
export function predictNextMonthML(lastThreeMonths: [number, number, number]): number | null {
  const net = loadNet();
  if (!net) return null;

  const mean = (lastThreeMonths[0] + lastThreeMonths[1] + lastThreeMonths[2]) / 3;
  if (mean < 1e-6) return 0;

  const input: [number, number, number] = [lastThreeMonths[0] / mean, lastThreeMonths[1] / mean, lastThreeMonths[2] / mean];
  const ratioPrediction = net.predict(input);
  return Math.max(0, ratioPrediction * mean);
}
