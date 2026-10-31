# Seven-node scheduler and multidimensional algorithms

## Logical worker roles

| Node | Role | Intended responsibility |
|---:|---|---|
| 0 | Tokenizer | Text normalization, token IDs and token buffers |
| 1 | Embedding | Token and position embedding lookup |
| 2 | Attention | Attention projections, attention and KV-cache work |
| 3 | Feed-forward | MLP/FFN work and residual operations |
| 4 | Sampling | Logits processing, top-K/top-P and token choice |
| 5 | Memory | Context, retrieval, cache and checkpoint work |
| 6 | Coordinator | Dependency graph, scheduling, cancellation and metrics |

`SevenNodeSystem` is a seven-role logical scheduler within one process. Its concurrency setting controls the number of simultaneously scheduled tasks, up to seven. It does not provision seven computers, processes, GPUs, or network workers. Map tasks to physical devices only after a transport and ownership model are implemented.

Transformer layers still have sequential dependencies. Parallelize independent requests, batch elements, or independent sub-operations; do not assume the entire attention/FFN stack can be executed concurrently.

## Multidimensional operations

The tensor algorithm module provides quick sort, merge sort, heap sort and insertion sort, plus axis-wise sorting, argsort, sum/mean/min/max reductions, and top-K ranking. The tensor storage is contiguous row-major Float32.

Use:
- quick sort for a general in-memory sort;
- merge sort when stable ordering is required;
- heap sort when bounded auxiliary memory matters;
- insertion sort for small or nearly sorted lanes;
- top-K for ranking candidates without changing the source tensor.

The current top-K implementation sorts all candidates; it is a correctness-first reference, not an optimized selection kernel.

## Zipformer-inspired multi-resolution primitive

The module accepts `[batch, sequence, channels]`, applies weighted temporal downsampling, restores the original sequence length, and merges the coarse representation with a residual path. It is a multi-resolution feature primitive inspired by multi-rate encoder designs, not a complete Zipformer implementation.

It is not currently connected to the causal decoder. A causal language-model integration requires causal pooling, position alignment, attention-mask alignment, correct streaming behavior, gradient propagation and quality/performance experiments.

## Validation priorities

Measure algorithm throughput on representative tensor sizes, scheduler overhead, memory use, tokens/second, prefill latency, decode latency and perplexity. Keep an optimization only when repeatable measurements show a benefit without unacceptable quality regression.
