# Model memory estimation

`estimateModelMemory` estimates weight storage from parameter count and selected representation (F32, F16, Q8, Q6, Q5, Q4, Q3 or Q2), plus a KV-cache estimate and configurable runtime/workspace allowances.

The KV-cache estimate is:

`2 × layers × contextTokens × kvHeads × headDimension × bytesPerElement`

The factor of two represents keys and values. The default cache element size is two bytes. The quantized weight estimate adds an approximate 8% metadata allowance.

`recommendContext` uses binary search to find the largest requested context length whose estimated total fits the supplied memory budget.

These are planning estimates, not measured resident-memory guarantees. Actual allocation depends on tensor packing, quantization metadata, mixed tensor types, graph buffers, allocator fragmentation, batching, runtime and operating system. Benchmark actual peak RSS/VRAM before making deployment claims.
