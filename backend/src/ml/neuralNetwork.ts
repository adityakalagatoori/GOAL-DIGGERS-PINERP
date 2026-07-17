/**
 * A minimal feedforward neural network with one hidden layer, trained by
 * real backpropagation + gradient descent — no ML library, so it has zero
 * native dependencies (safe on any host) and every line of the actual
 * learning algorithm is visible in this file for inspection.
 *
 * Architecture: inputSize -> hiddenSize (tanh) -> 1 output (linear).
 * This is the same family of model as a scikit-learn MLPRegressor, just
 * hand-rolled instead of imported.
 */
export interface NetworkWeights {
  inputSize: number;
  hiddenSize: number;
  W1: number[][]; // hiddenSize x inputSize
  b1: number[]; // hiddenSize
  W2: number[]; // hiddenSize (single output)
  b2: number; // scalar
}

function tanh(x: number): number {
  return Math.tanh(x);
}
function tanhDerivative(y: number): number {
  // y is already tanh(x); d/dx tanh(x) = 1 - tanh(x)^2
  return 1 - y * y;
}

function randomWeight(): number {
  return (Math.random() * 2 - 1) * 0.5;
}

export class NeuralNetwork {
  inputSize: number;
  hiddenSize: number;
  W1: number[][];
  b1: number[];
  W2: number[];
  b2: number;

  constructor(inputSize: number, hiddenSize: number, weights?: NetworkWeights) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    if (weights) {
      this.W1 = weights.W1;
      this.b1 = weights.b1;
      this.W2 = weights.W2;
      this.b2 = weights.b2;
    } else {
      this.W1 = Array.from({ length: hiddenSize }, () => Array.from({ length: inputSize }, randomWeight));
      this.b1 = Array.from({ length: hiddenSize }, randomWeight);
      this.W2 = Array.from({ length: hiddenSize }, randomWeight);
      this.b2 = randomWeight();
    }
  }

  /** Forward pass. Returns { output, hidden } so backprop can reuse the hidden activations. */
  private forward(input: number[]): { output: number; hidden: number[] } {
    const hidden = this.W1.map((row, i) => {
      const z = row.reduce((sum, w, j) => sum + w * input[j], 0) + this.b1[i];
      return tanh(z);
    });
    const output = hidden.reduce((sum, h, i) => sum + h * this.W2[i], 0) + this.b2;
    return { output, hidden };
  }

  predict(input: number[]): number {
    return this.forward(input).output;
  }

  // Momentum accumulators — persist across calls so trainEpoch can use
  // momentum-based gradient descent (converges substantially faster than
  // plain SGD on this task). Sized to match W1/b1/W2 exactly, so they're
  // (re)initialized whenever the network's shape is set in the constructor.
  private velW1: number[][] = [];
  private velB1: number[] = [];
  private velW2: number[] = [];
  private velB2 = 0;

  /** One epoch of batch gradient descent with momentum over the full training set. Returns mean squared error for this epoch. */
  trainEpoch(inputs: number[][], targets: number[], learningRate: number, momentum = 0.9): number {
    const n = inputs.length;
    if (this.velW1.length === 0) {
      this.velW1 = this.W1.map((row) => row.map(() => 0));
      this.velB1 = this.b1.map(() => 0);
      this.velW2 = this.W2.map(() => 0);
    }

    const gradW1 = this.W1.map((row) => row.map(() => 0));
    const gradB1 = this.b1.map(() => 0);
    const gradW2 = this.W2.map(() => 0);
    let gradB2 = 0;
    let totalLoss = 0;

    for (let k = 0; k < n; k++) {
      const input = inputs[k];
      const target = targets[k];
      const { output, hidden } = this.forward(input);
      const error = output - target;
      totalLoss += error * error;

      // Output layer gradients (linear activation, so d(output)/d(z2) = 1)
      for (let i = 0; i < this.hiddenSize; i++) {
        gradW2[i] += error * hidden[i];
      }
      gradB2 += error;

      // Hidden layer gradients (backprop through tanh)
      for (let i = 0; i < this.hiddenSize; i++) {
        const dHidden = error * this.W2[i] * tanhDerivative(hidden[i]);
        for (let j = 0; j < this.inputSize; j++) {
          gradW1[i][j] += dHidden * input[j];
        }
        gradB1[i] += dHidden;
      }
    }

    // Momentum update: velocity = momentum * velocity - lr * gradient; weight += velocity
    const { velW1, velB1, velW2 } = this;
    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        velW1[i][j] = momentum * velW1[i][j] - (learningRate * gradW1[i][j]) / n;
        this.W1[i][j] += velW1[i][j];
      }
      velB1[i] = momentum * velB1[i] - (learningRate * gradB1[i]) / n;
      this.b1[i] += velB1[i];
      velW2[i] = momentum * velW2[i] - (learningRate * gradW2[i]) / n;
      this.W2[i] += velW2[i];
    }
    this.velB2 = momentum * this.velB2 - (learningRate * gradB2) / n;
    this.b2 += this.velB2;

    return totalLoss / n;
  }

  toJSON(): NetworkWeights {
    return { inputSize: this.inputSize, hiddenSize: this.hiddenSize, W1: this.W1, b1: this.b1, W2: this.W2, b2: this.b2 };
  }
}
