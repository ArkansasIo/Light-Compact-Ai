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

## Compact AI: train, chat, serve

```sh
npm run train   # train on data/corpus.txt, save models/compact.checkpoint.json
npm run chat    # terminal chat UI (type /help inside)
npm start       # HTTP server on port 3000
```

Teach it new things by adding lines to `data/corpus.txt` (one sample per line, `#` for comments) and running `npm run train` again.

Server API:

```sh
curl localhost:3000/health
curl localhost:3000/generate -d '{"prompt":"the dog","maxTokens":10}'
# {"prompt":"the dog","maxTokens":10,"output":"slept by the door."}
```

### Configuration

Settings are read from `compact.config.json`, then overridden by environment variables (all listed in `.env.example`):

| Setting | Config key | Env var | Default |
|---|---|---|---|
| Hidden size | `model.dModel` | | 32 |
| Attention heads | `model.numHeads` | | 4 |
| Feed-forward size | `model.dFeedForward` | | 64 |
| Layers | `model.numLayers` | | 2 |
| Context length | `model.maxSequenceLength` | | 32 |
| Corpus file | `training.corpus` | `CORPUS` | `data/corpus.txt` |
| Training epochs | `training.epochs` | `EPOCHS` | 40 |
| Learning rate | `training.learningRate` | `LCAI_LEARNING_RATE` | 0.003 |
| Model file | `training.output` | `MODEL_PATH` | `models/compact.checkpoint.json` |
| Reply length | `generation.maxTokens` | `LCAI_MAX_TOKENS` | 24 |
| Server port | `server.port` | `PORT` | 3000 |
| Startup epochs (no saved model) | `server.startupEpochs` | `LCAI_STARTUP_EPOCHS` | 15 |

Use a different config file with `LCAI_CONFIG=path/to/file.json`. To load a `.env` file: `node --env-file=.env dist/server.js`.

### Settings and options

Type `/settings` (or `/config`) in `npm run chat` to open the settings panel: ↑↓ to select, ←→ to change, `r` to reset, Esc to close. Changes apply immediately and are saved to `.lcai/settings.json` (override with `LCAI_SETTINGS`). You can also set one value directly, e.g. `/settings temperature 0.8`.

| Setting | Key | Range | Default | Effect |
|---|---|---|---|---|
| Temperature | `temperature` | 0–2 | 0 | 0 always picks the most likely word; higher is more random |
| Top-k | `topK` | 0–100 | 0 (off) | Choose only among the k most likely words |
| Top-p | `topP` | 0.05–1 | 1 (off) | Choose among the top words reaching this total probability |
| Repetition penalty | `repetitionPenalty` | 1–2 | 1 (off) | Discourage recently used words |
| Max reply length | `maxTokens` | 1–256 | 24 | Most words per reply |
| Streaming speed | `streamDelayMs` | 0–200 | 30 | Pause between streamed words (0 = instant) |
| Show reply stats | `showStats` | on/off | on | Token count and time under replies |
| Theme | `theme` | teal, orange, blue, purple, mono | teal | Accent color |

Top-k, top-p and repetition penalty only matter when temperature is above 0. The HTTP API accepts the same generation options:

```sh
curl localhost:3000/generate -d '{"prompt":"the dog","temperature":0.8,"topK":10}'
```

### Docker

```sh
docker build -t light-compact-ai .
docker run -p 3000:3000 light-compact-ai
```

The image trains the model during the build, so the container starts serving immediately.

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
