# Light Compact AI

A compact, dependency-free TypeScript Transformer reference engine with recursive architecture metadata and a trainable CPU model.

## Features
- Recursive module/class/subclass/type/subtype/structure/substructure/branch/subtree registry.
- Float32 tensor utilities, seeded initialization, tokenizer and vocabulary.
- Token and positional embeddings.
- Multi-head self-attention (Q/K/V/output weights), optional causal mask.
- Residual connections, layer normalization, GELU feed-forward network.
- Explicit reverse-mode gradients for embeddings, attention, normalization, and MLP.
- Cross-entropy loss, Adam optimizer, gradient clipping, greedy generation.
- JSON checkpoints and unit tests.

## Install
```sh
npm install
npm run build
npm test
npm run example
```

## Quick start
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
const metrics = trainer.trainBatch([ids.slice(0, -1)], [ids.slice(1)]);
console.log(metrics);
console.log(tokenizer.decode(model.generate(ids.slice(0, -1), 12)));
```

## Model topology
```text
TransformerModel
├── Token + Position Embeddings
└── TransformerBlock × N
    ├── LayerNorm
    ├── MultiHeadSelfAttention
    │   ├── Wq / Wk / Wv / Wo (trainable matrices)
    │   └── scaled dot-product attention
    ├── Residual
    ├── LayerNorm
    └── FeedForward (W1, b1, W2, b2)
        └── GELU
```

This is a randomly initialized reference model, not a pretrained assistant. Useful language modeling requires a large, appropriately licensed corpus, careful training, evaluation and tuning. The tokenizer is deliberately simple and should be replaced by BPE/unigram for production.

## Limits
CPU-only Float32 implementation; no GPU kernels, distributed training, mixed precision, production tokenizer, caching, or production-grade dataset pipeline.
