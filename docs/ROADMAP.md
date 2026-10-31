# Engineering roadmap

## Landed in 0.2.0

- Existing trainable decoder-only transformer retained as the baseline.
- Added Float32 multidimensional tensor storage and axis algorithms.
- Added seven-role logical task scheduler with dependency graph execution.
- Added seeded deterministic PRNG utilities.
- Added model weight/KV-cache memory estimator and context-budget recommendation.
- Added Zipformer-inspired multi-resolution temporal feature primitive.
- Added an explicit encoder-decoder forward/generation reference with source encoder, causal target self-attention and encoder cross-attention.
- Added tests for new algorithms, scheduler, memory estimator, multi-resolution shape handling and encoder-decoder output shapes.
- Added GitHub Actions build/test workflow.

## Next engineering milestones

1. Run CI and fix any compile/test regressions.
2. Add padding masks and batched source/target inputs to encoder-decoder.
3. Implement and gradient-check encoder, cross-attention and decoder backpropagation; connect the result to Trainer and checkpoint APIs.
4. Add causal/streaming-safe multi-resolution blocks and train them against the decoder-only baseline.
5. Add optimized top-K/top-P selection and benchmark tensor kernels.
6. Add tokenizer training (BPE or unigram), dataset streaming, validation splits and reproducible training manifests.
7. Add KV-cache integration and incremental decoding.
8. Benchmark CPU memory, tokens/second, latency, perplexity and model quality on fixed datasets before setting hardware claims.
9. Design a real multi-process/distributed backend only after the logical scheduler has measurable workload benefits.
