# Light Compact AI

A compact TypeScript language-model research engine with a trainable decoder-only baseline, an experimental encoder-decoder path, and modular modern transformer/inference primitives.

## Features

- Recursive architecture registry and seeded initialization.
- Float32 multidimensional tensors, sorting, argsort, reductions and top-K.
- Trainable decoder-only transformer with multi-head self-attention, LayerNorm, GELU, reverse-mode gradients, Adam and greedy decoding.
- Encoder-decoder forward/generation reference with bidirectional source encoding, causal target self-attention and cross-attention.
- Byte-level BPE tokenizer reference with UTF-8 round-trip support.
- RoPE positional encoding, RMSNorm and SwiGLU primitives.
- Grouped-query attention forward primitive.
- Per-layer append-only KV cache and temperature/top-K/top-P/repetition-penalty sampling.
- Seven logical compute roles with dependency-aware scheduling.
- Zipformer-inspired multi-resolution temporal feature-pyramid operations.
- Weight/KV memory estimator, context-budget recommendation and JSON checkpoint baseline.

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
  vocabSize: tokenizer.vocabSize, maxSequenceLength: 32,
  dModel: 32, numHeads: 4, dFeedForward: 64, numLayers: 2, seed: 7
});
const trainer = new Trainer(model, { learningRate: 1e-3 });
const ids = tokenizer.encode("the small model learns");
console.log(trainer.trainBatch([ids.slice(0, -1)], [ids.slice(1)]));
console.log(tokenizer.decode(model.generate(ids.slice(0, -1), 12)));
```

## BPE tokenizer reference

```ts
import { BpeTokenizer } from "./src/index.js";
const tokenizer = new BpeTokenizer(512).train(["small language models", "language model training"]);
const tokens = tokenizer.encode("language models", true, true);
console.log(tokenizer.decode(tokens));
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

## Architecture and implementation status

The decoder-only `TransformerModel` remains the trainable baseline. The encoder-decoder class currently provides forward inference and greedy generation, but is not yet connected to the existing Trainer's complete backpropagation pipeline.

The new BPE, RoPE, RMSNorm, SwiGLU, grouped-query attention and KV-cache modules are exposed as reusable primitives. They are not all integrated into the main model yet; the current GQA implementation is forward-only. The BPE trainer is a correctness-first in-memory reference, not a production-scale corpus trainer.

The seven-node scheduler represents logical roles in one process, not seven physical machines. The Zipformer-inspired temporal pyramid is not a complete Zipformer and is not yet trained or connected to causal decoding.

## Engineering limits

This is CPU Float32 research code. It does not yet provide production BPE performance, GPU kernels, mixed precision, quantized model execution, paged KV allocation, distributed multi-host training, continuous batching or speculative decoding. A randomly initialized model is not a pretrained assistant. Claims about speed, memory or quality require reproducible benchmarks on named hardware and datasets.

See [feature research and trade-offs](docs/FEATURE-RESEARCH-AND-TRADEOFFS.md), [roadmap](docs/ROADMAP.md), and [encoder-decoder architecture](docs/ENCODER-DECODER-ARCHITECTURE.md).
