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

### Voice (Aurora)

Replies can be spoken with the **Aurora** preset: a soft, airy, calm voice built from
stock provider voices and expressive settings (it is a style, not a copy of any real
person's voice). Providers are tried in order **ElevenLabs → OpenAI → Azure Speech → Play.ht**,
skipping any without keys (Play.ht's API host stopped resolving in 2025, so it is last).

| Provider | `.env` keys | Aurora voice |
| --- | --- | --- |
| ElevenLabs | `ELEVENLABS_API_KEY` | stock "Lily", expressive settings |
| OpenAI | `OPENAI_API_KEY` | `shimmer` on `gpt-4o-mini-tts` with a soft, airy style prompt |
| Azure Speech | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | `en-US-AvaNeural`, slightly slower and higher |
| Play.ht | `PLAYHT_API_KEY`, `PLAYHT_USER_ID` | stock "Jennifer" |

1. Copy `.env.example` to `.env` and set the keys for at least one provider.
2. In `npm run chat`: `/voice` shows status, `/voice on` speaks every reply, `/voice test` plays a sample, Esc stops speech. `/settings` has "Speak replies" and "Voice provider".
3. On the server: `GET /voice` for status, `POST /speak` for MP3 audio:

```sh
curl localhost:3000/speak -d '{"text":"Hello, I am Aurora."}' -o hello.mp3
curl localhost:3000/speak -d '{"prompt":"hello"}' -o reply.mp3   # answer, then speak
```

Tune the voice in the `voice` section of `compact.config.json`, or set `ELEVENLABS_VOICE_ID`,
`OPENAI_TTS_VOICE`, `AZURE_SPEECH_VOICE` or `PLAYHT_VOICE_ID` to another voice. Playback uses PowerShell on Windows, `afplay` on
macOS, and ffplay/mpg123/mpv on Linux (or `LCAI_AUDIO_PLAYER`).

### Musical mode: compose and sing

Turn a prompt into an original song: lyrics, melody, chords, harmonies and accompaniment,
rendered on one shared beat clock, mixed, saved and played.

```sh
npm run sing -- "Create a gentle, original fairytale song."
npm run sing -- "a happy celtic duet about the sea" --voice ethereal-elven-princess,gentle-baritone
npm run sing -- "a jazz ballad" --lyrics my-lyrics.txt --key "Bb major" --tempo 84
npm run sing -- --load songs/<name>/song.json     # re-render a saved arrangement
npm run sing -- --list                            # styles and voice profiles
```

In chat: `/sing a lullaby about the moon` (uses the "Voice profile" from `/settings`). Server:
`POST /compose` returns the arrangement as JSON; `POST /sing` returns the mixed WAV.

Each song is saved to `songs/<title>-<seed>/`: `song.json` (the full arrangement, re-renderable),
`song.mid` (MIDI with lyrics, for any DAW/SoundFont), `mix.wav`, `vocals.wav`, `accompaniment.wav`
(`--stems` adds one WAV per track). The same prompt and seed always give the same song.

| Part | What it does |
| --- | --- |
| Styles | fairytale, musical-theatre, classical, celtic (3/4), pop, jazz (swing, 7th chords), choral, cinematic, ambient, picked from the prompt or `--style` |
| Voices | 12 original profiles (`src/profiles/voices.ts`): Aurora, Fairytale Soprano, Ethereal Elven Princess, Warm Contralto, Bright Tenor, ... with separate singing range, speaking pitch, timbre, vibrato and articulation. Add your own in `.lcai/voices/*.json` (`"extends": "aurora"`). |
| Instruments | piano, harp, strings, bass, bells, synth pad, drums and choir, all synthesized in code (no sample libraries or licensing) |
| Vocals | the built-in **formant guide vocal** sings the right notes, vowels and timing, but it sounds clearly synthetic. It sits behind a `SingingProvider` interface (`src/singing/formant.ts`) so a licensed singing-synthesis engine can be plugged in |

Lyrics are generated from original line banks written for this project, or supplied by you;
`song.json` records their provenance.

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
