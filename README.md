# Light Compact AI

A compact TypeScript transformer research engine with a trainable decoder-only baseline and an explicit encoder-decoder sequence-to-sequence forward path.

## Features

- Recursive module/class/subclass/type/subtype/structure/substructure/branch/subtree registry.
- Float32 tensor primitives and multidimensional quick, merge, heap and insertion sorts.
- Tensor-axis sorting, argsort, reductions and top-K ranking.
- Seeded deterministic initialization and reproducible experiment streams.
- Trainable decoder-only transformer: embeddings, multi-head self-attention, residuals, layer normalization and GELU feed-forward blocks.
- Reverse-mode gradients, cross-entropy, Adam optimization, gradient clipping and greedy decoding for the decoder-only baseline.
- Encoder-decoder architecture with bidirectional source encoding, causal target self-attention and cross-attention over encoder memory.
- Seven logical compute roles with dependency-aware task scheduling.
- Zipformer-inspired multi-resolution temporal feature-pyramid primitives.
- Parameter/KV-cache memory estimator and context-budget recommendation.
- JSON checkpoints and unit tests.

## Install and verify

```sh
npm install
npm run build
npm test
npm run example
```

## Decoder-only training quick start

```ts
import { TransformerModel, Trainer, VocabularyTokenizer } from "./src/index.js";

const tokenizer = new VocabularyTokenizer();
tokenizer.fit(["the small model learns", "the model reads text"]);
const model = new TransformerModel({
  vocabSize: tokenizer.vocabSize,
  maxSequenceLength: 32,
  dModel: 32,
  numHeads: 4,
  dFeedForward: 64,
  numLayers: 2,
  seed: 7
});
const trainer = new Trainer(model, { learningRate: 1e-3 });
const ids = tokenizer.encode("the small model learns");
console.log(trainer.trainBatch([ids.slice(0, -1)], [ids.slice(1)]));
console.log(tokenizer.decode(model.generate(ids.slice(0, -1), 12)));
```

## Encoder-decoder forward pass

```ts
import { EncoderDecoderTransformer } from "./src/index.js";

const model = new EncoderDecoderTransformer({
  vocabSize: 256, maxSourceLength: 512, maxTargetLength: 512,
  dModel: 128, numHeads: 4, dFeedForward: 512,
  encoderLayers: 4, decoderLayers: 4, seed: 7
});
const logits = model.forward([1, 8, 9], [1, 12]);
```

The encoder processes the source sequence bidirectionally. The decoder uses causal self-attention and cross-attends to the encoder memory. See [encoder-decoder architecture](docs/ENCODER-DECODER-ARCHITECTURE.md).

## Seven-node logical scheduler

The seven roles are tokenizer, embedding, attention, feed-forward, sampling, memory and coordinator. They are logical workers scheduled within one process; this does not create seven physical machines or guarantee parallel speedup. Transformer layer dependencies remain sequential.

## Zipformer-inspired multi-resolution path

The temporal feature pyramid accepts `[batch, sequence, channels]` tensors and performs weighted downsampling, upsampling and gated residual merging. It is an experimental feature-processing primitive, not a complete Zipformer and not currently integrated into causal token decoding. See the implementation notes in the source and tests.

## Important limitations

The decoder-only `TransformerModel` is the trainable baseline. The new encoder-decoder class currently provides a forward-pass/generation reference and is **not yet connected to the existing Trainer's gradient pipeline**. The Zipformer-inspired path is not yet trained or integrated into either transformer. The project is CPU Float32 research code: it does not yet provide GPU kernels, mixed-precision execution, production BPE/unigram tokenization, distributed multi-host execution, or a production dataset pipeline.

A randomly initialized model is not a pretrained assistant. Useful language modeling requires appropriately licensed training data, complete training/evaluation pipelines and measured quality/performance benchmarks. Memory estimates are planning estimates, not measured resident-memory guarantees.
