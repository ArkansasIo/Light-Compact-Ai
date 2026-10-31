# Engineering roadmap

## Implemented research components

- Trainable decoder-only transformer baseline and existing Adam training path.
- Encoder-decoder forward/generation reference with source encoder, causal target self-attention and cross-attention.
- Byte-level BPE tokenizer reference and serializable merge state.
- RoPE, RMSNorm with local backward function, SwiGLU with local backward function.
- Grouped-query attention forward primitive.
- Per-layer append-only KV cache and configurable sampling.
- Multidimensional tensor algorithms, seven-role logical scheduler, seeded PRNG, memory estimator and Zipformer-inspired multi-resolution primitive.
- CI workflow and modular primitive tests.

## Priority 1 — correctness and integration

1. Run strict TypeScript build and the full test suite; repair all errors before adding more model features.
2. Integrate BPE vocabulary IDs with model construction and checkpoint save/load.
3. Integrate RoPE into query/key projection and add positional tests across multiple heads.
4. Add RMSNorm and SwiGLU as configurable transformer-block options.
5. Integrate GQA into the causal model and implement/gradient-check its backward pass.
6. Integrate KV cache into incremental one-token decoding and prove cached logits match uncached logits within numerical tolerance.
7. Complete encoder-decoder backpropagation, padding masks, batching and checkpoint support.

## Priority 2 — training quality

1. Add AdamW and compare with existing Adam on identical data/seeds.
2. Add dataset streaming, deterministic shuffling, train/validation splits and manifests.
3. Add gradient accumulation, clipping metrics, learning-rate schedules and checkpoint resume.
4. Track validation cross-entropy/perplexity, tokens/second and gradient norms.
5. Add tokenizer coverage and compression-ratio reports.

## Priority 3 — efficient inference

1. Benchmark matrix multiplication and optimize typed-array CPU kernels.
2. Add Q8 and Q4 offline quantization experiments with quality/perplexity comparisons.
3. Add a block-allocated paged KV cache and request-aware scheduler.
4. Add continuous batching, cancellation, request fairness and cache eviction.
5. Evaluate speculative decoding with a compact draft model.
6. Build a WebGPU backend and compare with CPU reference.

## Priority 4 — advanced research

1. Evaluate Zipformer-inspired multi-resolution features against the standard baseline; do not assume they improve text generation.
2. Evaluate FlashAttention-style tiled attention where the backend can exploit GPU memory hierarchy.
3. Add retrieval-augmented generation as a separately testable document subsystem.
4. Explore mixture-of-experts only after dense-model baselines and routing metrics are stable.
5. Implement true multi-process or multi-device execution only after logical scheduler profiling identifies independent work.

## Acceptance gates

- Every component has unit tests and shape/error-path coverage.
- Training changes pass finite-difference gradient checks on small models.
- Cache and uncached generation produce matching logits within a documented tolerance.
- Performance claims include hardware, model dimensions, context length, batch size, warm-up, repetitions and measured variance.
- Quality claims include held-out data and reproducible evaluation.
- CPU-only operation remains available as a correctness reference.
