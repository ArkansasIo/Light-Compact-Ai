# Feature research, trade-offs and implementation plan

## Architecture choices

### Decoder-only versus encoder–decoder
**Decoder-only:** the recommended default for conversational generation and autoregressive completion. It has one main transformer stack and a simpler inference/training path. Its causal attention does not directly encode a separate source sequence.

**Encoder–decoder:** useful for translation, summarization and structured source-to-target transformation. The encoder can read the full input and the decoder can cross-attend to it. It adds encoder parameters, cross-attention, separate source/target handling and more complex training. Keep both configurations available rather than forcing every workload into one topology.

### Attention
**Multi-head attention (MHA):** simplest reference design, but each query head has its own K/V projections and cache.

**Grouped-query attention (GQA):** several query heads share each K/V head. This reduces K/V projection size and KV-cache storage. It requires query-head count to be divisible by KV-head count. The new TypeScript implementation is a forward primitive; it is not yet wired into the trained TransformerModel or its backward pass.

**FlashAttention-style kernels:** exact attention computed with IO-aware tiling and online softmax. The research shows that reducing data movement between GPU memory levels can improve memory efficiency without approximating the attention result. The major trade-off is low-level kernel engineering and hardware-specific optimization. The current pure-TypeScript CPU implementation cannot reproduce GPU FlashAttention performance.

**Paged KV cache:** divides cache storage into blocks allocated on demand. This can reduce fragmentation and enable cache sharing and higher serving batch sizes. The cost is a page table, allocator, eviction/refcount logic and more complex kernels. Start with a correct contiguous KV cache; implement paging after benchmarks show memory fragmentation or batching is a real bottleneck.

### Positional encoding and normalization
**RoPE:** rotates query/key feature pairs by token position and is widely used in modern decoder architectures. It avoids a learned absolute position embedding table, but context extension requires careful frequency/scaling validation. The new implementation currently supplies the rotary transform primitive.

**RMSNorm:** computes root-mean-square normalization without subtracting the mean. It is simpler than LayerNorm and has a smaller operation count, but must be trained and evaluated in the model stack before replacing the baseline.

### Feed-forward network
**SwiGLU:** uses a gated SiLU activation and two input projections. It is a strong modern FFN choice, but has different parameter/compute costs from GELU. The new code provides the activation and its local gradients; projection integration and end-to-end gradient tests remain.

## Tokenization

The current word/punctuation tokenizer can produce long sequences and has poor coverage of unseen words. A byte-level BPE tokenizer can represent arbitrary UTF-8 input and learn frequent subword units. Advantages include compact sequences and robust out-of-vocabulary handling. Costs include tokenizer training time, merge-table storage and careful special-token handling. The new BPE module is a correctness-oriented in-memory reference; optimize pair counting and stream large corpora before production use.

SentencePiece is a useful reference for BPE/unigram design and training from raw text: https://google.github.io/sentencepiece/

## Inference and serving

- **KV cache:** reuse prior keys/values during autoregressive decoding. It improves decode efficiency but consumes memory proportional to layers, tokens, KV heads and head dimension.
- **Sampling:** temperature, top-K, top-P and repetition penalty improve generation control. These are policy choices, not guaranteed quality improvements; greedy decoding remains useful for deterministic tests.
- **Speculative decoding:** use a smaller draft model to propose tokens and a target model to verify them. It can reduce serial target-model steps, but requires draft-model memory, acceptance logic and careful distribution-preserving verification.
- **Continuous batching:** schedule requests at token-step boundaries to keep compute units busy. It increases serving throughput but needs cancellation, fairness, per-request cache accounting and latency controls.
- **Retrieval-augmented generation:** retrieve relevant documents at inference time. It reduces the need to memorize changing private facts in model weights, but retrieval introduces indexing, relevance, citation and data-security requirements.

## Training and model quality

Add next-token validation loss, perplexity, gradient-norm tracking, learning-rate schedules, checkpoint/resume, deterministic data manifests, gradient accumulation and clipping. Training quality must be measured on held-out data; a falling training loss alone does not establish generalization.

Use AdamW as the next optimizer comparison: decoupled weight decay can regularize large transformer training more cleanly than adding L2 directly to the gradient. Benchmark it against current Adam on identical seeds, batches and data splits.

## Hardware strategy

Keep a portable CPU reference backend for correctness. Add optimized backends separately:
1. CPU typed-array baseline and optimized matrix multiplication.
2. Worker-thread or native-addon CPU parallelism for independent matrix/tensor tasks.
3. WebGPU backend for supported GPUs, with CPU fallback.
4. Native GPU kernels only after profiling demonstrates the need.

The seven-node scheduler currently represents logical roles inside one process; it is not distributed compute. Avoid describing it as seven physical compute nodes until real worker processes, message passing, failure recovery and device ownership exist.

## Pros and cons summary

| Direction | Main benefit | Main cost/risk | Decision |
|---|---|---|---|
| BPE tokenizer | Better token efficiency and Unicode coverage | More tokenizer complexity | Implement now; optimize later |
| RoPE | Modern position representation | Context scaling details | Integrate after unit tests |
| RMSNorm | Leaner normalization | Model must be retrained | Compare experimentally |
| SwiGLU | Gated FFN expressiveness | Extra projection/compute | Add as configurable FFN |
| GQA | Smaller KV cache | More complex attention/backprop | High priority |
| KV cache | Faster autoregressive decoding | Context memory | Integrate next |
| Quantization | Lower memory footprint | Accuracy and kernel complexity | Start with offline Q8/Q4 experiments |
| FlashAttention | Lower GPU memory traffic | Specialized kernel work | Later GPU backend |
| Paged cache | Better multi-request memory use | Allocator/scheduler complexity | After contiguous cache benchmarks |
| Speculative decoding | Potential decode speedup | Draft model overhead | Later |
| RAG | External knowledge grounding | Retrieval/security complexity | Separate subsystem |
| MoE | Sparse activation of large capacity | Routing/load balance | Research only for now |

## Recommended sequence

1. Fix and continuously run strict build/tests for every extension.
2. Integrate BPE tokenizer with tokenizer-state checkpointing.
3. Integrate RoPE, RMSNorm, SwiGLU and GQA as selectable model components.
4. Finish KV cache and incremental one-token decoding.
5. Implement encoder-decoder backpropagation and training.
6. Add AdamW, data streaming, validation and reproducible experiments.
7. Add quantization and benchmark memory/quality trade-offs.
8. Build CPU and WebGPU backends, then evaluate FlashAttention-like tiling.
9. Add paged cache, continuous batching and speculative decoding.
10. Add RAG as an optional document subsystem.

## Research references

- FlashAttention, NeurIPS 2022: https://arxiv.org/abs/2205.14135
- PagedAttention / vLLM, SOSP 2023: https://arxiv.org/abs/2309.06180
- SentencePiece documentation: https://google.github.io/sentencepiece/

Published speedups are results from their authors' tested hardware, models and workloads. They are not forecasts for this TypeScript engine. Every optimization needs a local baseline and a repeatable benchmark.
