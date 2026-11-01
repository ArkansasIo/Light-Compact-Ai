# Musical Reality & AI Voice Platform
## Product and Technical Design Brief

**Status:** Initial architecture and research specification  
**Primary implementation language:** TypeScript  
**Target platforms:** Windows, macOS, and Linux; desktop and server deployments  
**Operating modes:** Cloud-backed, locally hosted, and hybrid

---

## 1. Project vision

Build a modular AI platform that can converse, speak in configurable original voices, sing, compose music, play or synthesize instruments, and generate synchronized musical performances.

The experience is inspired by the musical storytelling of *Buffy the Vampire Slayer: Once More, with Feeling* and *Star Trek: Strange New Worlds: Subspace Rhapsody*. The intended capability is a **Musical Reality** mode: the AI can deliberately transition from conversation into a song or musical performance, with accompaniment and multiple voices. This is a creative interaction mode, not a claim that real-world physics changes.

## 2. Product principles

1. **Original voices by default.** Create new voices from broad acoustic and artistic traits rather than cloning a specific actor, singer, or copyrighted character performance.
2. **Provider independence.** Keep provider integrations behind stable TypeScript interfaces.
3. **Local and cloud options.** Support hosted APIs and locally run models where practical.
4. **Speech and singing are separate tasks.** They may share a character identity and style profile, but use task-appropriate synthesis models.
5. **Music is structured.** Use MIDI, notation, tempo, meter, harmony, and arrangement data where possible; use generated audio when appropriate.
6. **Rights-aware content.** Use original, public-domain, or properly licensed lyrics, compositions, recordings, datasets, and voice models.
7. **Cross-platform design.** Avoid making GPU hardware mandatory; detect capabilities and select suitable backends.

## 3. Main subsystems

### 3.1 Conversation and orchestration
- Receive text and speech input.
- Manage dialogue state, memory, and personality.
- Decide whether a response should be spoken, sung, or accompanied by music.
- Coordinate speech, music, and playback jobs.
- Support interruption, cancellation, turn-taking, and user-controlled musical transitions.

### 3.2 Speech engine
- Speech-to-text (STT), text-to-speech (TTS), and streaming audio output.
- Voice selection, pronunciation dictionaries, speaking-rate, pitch, and prosody controls where supported.
- Provider fallback and local-provider selection.
- Separate capability reporting for each language and model.

### 3.3 Voice profile system
A voice profile describes an original voice identity and its presentation settings. Parameters include:
- Vocal register and comfortable pitch range.
- Pitch distribution and variation.
- Timbre, spectral character, resonance, and formant-related qualities.
- Breathiness and vocal texture.
- Articulation, diction, accent, and pronunciation.
- Speaking rate, prosody, emotional delivery, and intensity.

Pitch, timbre, resonance, articulation, and prosody are distinct dimensions. Singing range also differs from comfortable speaking pitch. Avoid defining a voice with one pitch number alone.

### 3.4 Singing synthesis engine
- Singing from lyrics, melody, MIDI, or note-event input.
- Pitch and timing control, vibrato, note transitions, dynamics, and expression.
- Breath and phrase planning; pronunciation and phoneme alignment.
- Backing vocals, harmonies, duets, and choir arrangements.
- Export vocal stems and complete mixes.

Singing synthesis is not simply TTS at a higher pitch. It requires musical note timing, phoneme-to-note alignment, sustained vowels, transitions, and expressive control.

### 3.5 Music composition engine
- Melody and motif generation; chord progressions; rhythm and percussion.
- Key, tempo, meter, song form, and arrangement.
- Instrument selection, orchestration, and mood/energy controls.
- Intro, verse, chorus, bridge, and outro structures.
- MIDI and MusicXML export where supported.

### 3.6 Instrument and sound engine
Instrument families:
- Keyboard: acoustic/electric piano, organ, harpsichord.
- Strings: violin, viola, cello, double bass, harp.
- Woodwinds: flute, piccolo, clarinet, oboe, bassoon.
- Brass: trumpet, French horn, trombone, tuba.
- Percussion: drums, timpani, cymbals, bells, mallet instruments.
- Plucked strings: acoustic/electric guitar, mandolin, lute.
- Synthesizers: subtractive, FM, wavetable, and sampled instruments.
- Choir and vocal ensemble parts.

Implementation approaches include MIDI sequencing, SoundFont/sample playback, physical or mathematical synthesis, virtual instrument hosting, and AI-generated audio. MIDI is a control/event format; it does not itself contain instrument sound. A synthesizer, SoundFont, sample library, or virtual instrument must render notes into audio.

### 3.7 Audio engine
- Audio device discovery and selection.
- Sample-rate and buffer configuration.
- Mixing, gain staging, reverb, delay, compression, and equalization.
- Stem routing, recording, streaming, playback, and export.
- Latency monitoring and synchronization.

### 3.8 Musical mode controller
- User explicitly asks the AI to sing, or enables optional spontaneous musical transitions.
- Transform conversation into original lyrics.
- Create a short motif, full song, duet, or ensemble.
- Generate instrumental accompaniment synchronized to singer tempo and key.
- Provide clear controls to enter, exit, interrupt, and disable musical mode.

Spontaneous singing should be opt-in or governed by a clear preference. It should not unexpectedly interrupt important conversation.

## 4. Voice and style profiles

Use broad artistic archetypes as starting points for original designs.

| Profile | Intended qualities |
|---|---|
| Fairytale Soprano | Light, lyrical, graceful, clear |
| Classic Storybook Voice | Warm, gentle, elegant |
| Adventurous Musical Voice | Bright, animated, expressive |
| Royal / Regal Voice | Composed, resonant, confident |
| Ethereal Elven Voice | Airy, flowing, delicate, atmospheric |
| Dramatic Stage Voice | Strong projection and dynamic range |
| Warm Contralto | Lower register, rich and grounded |
| Contemporary Pop Voice | Direct, rhythmic, modern delivery |
| Ethereal Elven Princess | Graceful musical-theatre phrasing, clear diction, airy resonance, original identity |

Profiles must be adjustable and saveable. Do not hard-code assumptions that every voice in a gender category has the same pitch or timbre. The design may evoke broad fairytale or fantasy aesthetics, but must not replicate a named performer or protected character voice.

## 5. Singing styles

Selectable and blendable styles:
- Classical and opera.
- Musical theatre and Broadway.
- Fairytale / storybook orchestral.
- Celtic and folk fantasy.
- Pop, rock, and jazz.
- Choral and ensemble.
- Cinematic soundtrack.
- Ambient and electronic.

Style should influence arrangement, phrasing, dynamics, articulation, and production—not merely pitch.

## 6. Music and instrument modes

### Mode A — Music Player
Play local audio files and supported streams; manage playlists and queues; play MIDI through a selected sound source; control volume, seeking, and playback.

### Mode B — AI Musician
Compose melodies and harmonies; generate instrument parts; arrange piano, strings, harp, winds, brass, and percussion; export MIDI, notation, and audio where supported.

### Mode C — AI Singer
Sing original lyrics; follow a supplied melody or MIDI arrangement; generate harmonies and backing vocals; render vocal-only or mixed performances.

### Mode D — Musical Reality
Coordinate dialogue, lyrics, vocals, instruments, and transitions. Generate an original musical number from a prompt or conversation. Support solo, duet, choir, and ensemble arrangements on a shared timeline.

## 7. High-level architecture

```text
AI APPLICATION
|
+-- Conversation Orchestrator
|   +-- Dialogue / Reasoning
|   +-- Memory and Personality
|   +-- Musical Mode Decision
|
+-- Voice Engine
|   +-- Speech Recognition (STT)
|   +-- Text-to-Speech (TTS)
|   +-- Voice Profiles
|   +-- Pronunciation / Prosody
|
+-- Singing Engine
|   +-- Lyrics and Phoneme Alignment
|   +-- Melody / Note Events
|   +-- Singing Synthesis
|   +-- Vibrato / Dynamics / Expression
|   +-- Harmony / Duet / Choir
|
+-- Music Engine
|   +-- Composition / Chords / Rhythm / Form
|   +-- Arrangement / Orchestration
|   +-- MIDI / MusicXML
|
+-- Instrument Engine
|   +-- MIDI Sequencer
|   +-- SoundFont / Sample Playback
|   +-- Synthesizers / Virtual Instrument Adapters
|
+-- Audio Engine
    +-- Mixer / Effects / Routing
    +-- Clock / Synchronization
    +-- Streaming / Playback / Recording / Export
```

## 8. Suggested TypeScript package layout

```text
packages/
  voice-engine/src/{core,profiles,analysis,speech,providers}/
  singing-engine/src/{lyrics,alignment,synthesis,expression,harmony,providers}/
  music-engine/src/{composition,theory,arrangement,orchestration,midi,notation}/
  instrument-engine/src/{sequencer,soundfonts,samples,synthesis,plugins}/
  audio-engine/src/{devices,mixer,effects,clock,playback,recording,export}/
  musical-mode/src/{controller,transitions,scenes,timeline}/
  personality-system/src/{profiles,traits,selection,memory}/
  language-system/src/{detection,locales,pronunciation,capabilities}/
  provider-sdk/src/
apps/
  desktop/
  server/
  cli/
```

Keep packages independently testable. Use adapters so providers can be changed without rewriting orchestration logic.

## 9. Provider interfaces and core data contracts

Illustrative interfaces:

```ts
export interface SpeechRequest {
  text: string;
  voiceProfileId: string;
  locale: string;
  speakingRate?: number;
  emotion?: string;
}

export interface SpeechProvider {
  readonly id: string;
  synthesize(request: SpeechRequest, signal?: AbortSignal): Promise<AudioResult>;
}

export interface SingingRequest {
  lyrics: string;
  locale: string;
  voiceProfileId: string;
  notes?: NoteEvent[];
  style?: string;
}

export interface SingingProvider {
  readonly id: string;
  synthesize(request: SingingRequest, signal?: AbortSignal): Promise<AudioResult>;
}

export interface NoteEvent {
  pitch: number;
  startBeats: number;
  durationBeats: number;
  velocity?: number;
  lyricSyllable?: string;
}

export interface AudioResult {
  format: string;
  sampleRate: number;
  channels: number;
  durationMs: number;
  data: Uint8Array;
}
```

Treat these as starting contracts. Production implementations should stream large audio payloads, expose cancellation and progress, and avoid loading entire long performances into memory unnecessarily.

## 10. Personality profile index and multiple personalities

The personality system should support multiple selectable profiles, each with its own conversational behavior and optional linked speech/singing identity. Personality is not the same as voice: a personality can use different voices, and one voice can be used by several personalities.

A profile may define:
- Stable profile ID, display name, description, and version.
- Communication style: formal, casual, concise, detailed, playful, analytical, poetic, or supportive.
- Initiative and verbosity.
- Humor, curiosity, warmth, directness, and emotional expressiveness.
- Boundaries, safety behavior, and disclosure rules.
- Preferred voice profile and singing style.
- Preferred language, locale, and pronunciation dictionary.
- Music genres, instrument preferences, and arrangement tendencies.
- Memory namespace and user-editable preferences.

Suggested built-in personality archetypes:
1. **Analyst** — precise, structured, evidence-oriented.
2. **Creative** — imaginative, exploratory, expressive.
3. **Companion** — warm, conversational, attentive.
4. **Performer** — theatrical, musical, expressive.
5. **Scholar** — explanatory, patient, research-oriented.
6. **Composer** — focused on harmony, melody, arrangement, and musical craft.
7. **Director** — coordinates scenes, voices, instruments, and performance timing.

Users can create, duplicate, rename, export, import, and delete profiles. Make the active profile visible and allow per-conversation overrides. Do not let a persona override system safety rules or misrepresent itself as a human.

```ts
export interface PersonalityProfile {
  id: string;
  name: string;
  description?: string;
  version: number;
  communication: {
    tone: string[];
    verbosity: "low" | "medium" | "high";
    initiative: "reactive" | "balanced" | "proactive";
    humor: number;       // normalized 0..1
    warmth: number;      // normalized 0..1
    expressiveness: number; // normalized 0..1
  };
  voiceProfileId?: string;
  singingStyleIds?: string[];
  preferredLocales: string[];
  musicPreferences?: {
    genres?: string[];
    instruments?: string[];
    arrangementStyle?: string;
  };
  memoryNamespace?: string;
}
```

## 11. Synchronization and real-time performance

Use a shared musical transport clock for note events, vocal rendering, accompaniment, and visual cues. Represent musical time in beats/ticks and map it to audio sample positions using tempo and sample rate. Do not synchronize independent components by repeatedly comparing wall-clock timestamps.

Required controls:
- Tempo and time signature.
- Count-in and quantization.
- Start, pause, seek, stop, and resync.
- Per-track latency compensation.
- Buffer size and audio-device selection.
- Cancellation and graceful recovery from provider failure.

Real-time low-latency performance and high-quality offline rendering are different operating targets. Support both modes explicitly instead of promising identical latency and quality from every backend.

## 12. Settings model

Organize settings into clear sections:
- **General:** application behavior, startup, update channel.
- **Personality:** active profile, profile editor, memory scope.
- **Voice:** provider, voice profile, pitch/range controls where supported, rate, emotion, pronunciation.
- **Languages:** conversation locale, speech locale, singing locale, auto-detection, code-switching, translation.
- **Music:** genre, key, tempo, meter, song structure, arrangement complexity.
- **Instruments:** sound library, MIDI output, plugin configuration.
- **Audio:** device, sample rate, buffer size, output routing, effects.
- **Models and providers:** cloud/local selection, model path, resource limits, fallback.
- **Privacy and rights:** data retention, consent, licensed assets and model provenance.
- **Advanced:** diagnostics, logs, cache, performance profile.

## 13. Cross-platform and hardware strategy

Target Windows, macOS, and Linux on desktop and server. Support CPU-only execution and optional GPU acceleration. At startup, detect operating system, CPU features, RAM, GPU/runtime availability, audio devices, and supported codecs. Select a compatible backend and explain any reduced capability.

Keep hardware-specific code behind adapters. Make resource budgets configurable: maximum memory, CPU worker count, GPU memory budget, model concurrency, audio buffer size, and cache size. Do not assume a GPU is present or that all GPUs support the same runtime.

## 14. Rights, licensing, and provenance

- Use original lyrics and compositions, public-domain works, or properly licensed material.
- Use voice datasets and models only when their terms and consent requirements permit the intended use.
- Do not clone a named actor, singer, or copyrighted character voice without the necessary authorization.
- Track model, dataset, sample-library, and plugin licenses.
- Preserve attribution and license notices where required.
- Treat a purchased recording or VHS/DVD copy as distinct from permission to extract training data or clone a performance.

## 15. Development roadmap

### Phase 1 — Foundations
Establish monorepo and TypeScript build; define shared request, response, and audio types; build provider interfaces and configuration; add basic audio playback.

### Phase 2 — Conversational voice
Add STT and TTS providers; implement voice profiles; add streaming, cancellation, and device settings.

### Phase 3 — Music playback and instruments
Add MIDI parsing and sequencing; integrate a licensed SoundFont or sample library; add piano and basic instrument playback; implement tempo and transport controls.

### Phase 4 — Composition
Add key, meter, tempo, chords, melody, and arrangement structures; export MIDI and, if supported, MusicXML; build an original-music workflow.

### Phase 5 — Singing
Integrate a licensed singing-synthesis backend; align lyrics and phonemes to notes; add expression, vibrato, dynamics, and harmonies.

### Phase 6 — Musical Reality
Coordinate dialogue, lyrics, singing, and accompaniment; add solo, duet, and ensemble arrangements; implement opt-in musical transitions.

### Phase 7 — Local and advanced operation
Add local model adapters; add resource-aware model selection; improve offline workflows and cross-platform packaging; evaluate quality, latency, and stability.

## 16. Testing and quality metrics

**Speech:** intelligibility, naturalness, response latency, pronunciation accuracy.  
**Singing:** pitch accuracy, timing accuracy, phoneme alignment, phrase continuity, expression, consistency.  
**Music:** harmonic coherence, rhythmic stability, arrangement quality, MIDI correctness, instrument rendering quality.  
**Audio:** dropouts, underruns, end-to-end latency, sample-rate correctness, synchronization drift, CPU and memory use.  
**Platform:** Windows/macOS/Linux compatibility, CPU-only operation, GPU backend compatibility, provider-failure recovery, offline behavior.

## 17. Initial milestone: a working vertical slice

1. Accept a prompt such as “Create a gentle, original fairytale song.”
2. Generate original lyrics and a simple melody.
3. Produce a chord progression and piano accompaniment.
4. Send melody and lyrics to a compatible singing provider.
5. Render piano through a MIDI instrument or sound library.
6. Synchronize and mix vocal and accompaniment.
7. Play the result in the application.
8. Save the arrangement and selected voice/music settings.

This proves the end-to-end architecture before investing in custom model training.

## 18. Decisions still to make

- Desktop framework and packaging approach.
- Audio backend for each operating system.
- Initial STT, TTS, and singing providers.
- MIDI and SoundFont rendering library.
- Local model formats and hardware backends.
- Whether the first release prioritizes real-time performance or higher-quality offline rendering.

## 19. Multilingual support — top 25 languages

Use the 2025 Ethnologue-based ranking by total speakers (first- and second-language speakers combined) as an initial prioritization reference. This is not a guarantee that each provider supports every language equally; estimates and rankings vary with language grouping.

| Priority | Language | Implementation notes |
|---:|---|---|
| 1 | English | Regional varieties including Canadian, US, UK, and Australian accents. |
| 2 | Mandarin Chinese | Simplified and Traditional text workflows; distinguish Mandarin from other Chinese varieties. |
| 3 | Hindi | Devanagari input/output and pronunciation. |
| 4 | Spanish | Regional pronunciation and vocabulary. |
| 5 | Standard Arabic | Right-to-left handling; distinguish MSA from spoken dialects. |
| 6 | French | Canadian French and European French. |
| 7 | Bengali | Bengali script and pronunciation. |
| 8 | Portuguese | Brazilian and European Portuguese. |
| 9 | Russian | Cyrillic text and pronunciation. |
| 10 | Indonesian | Pronunciation and text normalization. |
| 11 | Urdu | Urdu script, right-to-left layout, pronunciation. |
| 12 | Standard German | Regional pronunciation and compound words. |
| 13 | Japanese | Kana, kanji, reading normalization, prosody. |
| 14 | Nigerian Pidgin | Treat as a distinct variety; verify provider and dataset coverage. |
| 15 | Egyptian Arabic | Treat separately from Standard Arabic and other dialects. |
| 16 | Marathi | Devanagari text and pronunciation. |
| 17 | Vietnamese | Tone-aware pronunciation and diacritics. |
| 18 | Telugu | Telugu script and pronunciation. |
| 19 | Hausa | Verify speech and singing data availability. |
| 20 | Turkish | Turkish characters and pronunciation. |
| 21 | Western Punjabi | Specify script and regional variety; commonly Shahmukhi in Pakistan. |
| 22 | Swahili | Specify the variety where relevant. |
| 23 | Tagalog | Document the chosen Tagalog/Filipino label. |
| 24 | Tamil | Tamil script and pronunciation. |
| 25 | Yue Chinese (including Cantonese varieties) | Treat separately from Mandarin; specify target variety. |

**Ranking caveat:** This ordering follows the 2025 Ethnologue-based total-speaker list reproduced by JetPunk and Visual Capitalist. Counts combine first- and second-language speakers and are not exact current population measurements. Arabic and Chinese varieties may be grouped differently across datasets. Sources: [Visual Capitalist — 2025 ranking based on Ethnologue](https://www.visualcapitalist.com/ranked-the-worlds-most-spoken-languages-in-2025/) and [Ethnologue 2025 list reproduced by JetPunk](https://www.jetpunk.com/user-quizzes/2026529/top-200-languages-ethnologue-2025).

### Multilingual engineering requirements

- Use BCP 47 tags (for example, `en-CA`, `fr-CA`, `es-ES`, `pt-BR`, `zh-CN`, `zh-TW`, `ar-EG`, and `yue-HK`).
- Store language, locale, script, and voice identity separately.
- Detect input language where possible, but allow user override.
- Support code-switching within a single conversation.
- Maintain separate capability matrices for STT, TTS, singing synthesis, and lyric translation. TTS support does not imply STT or singing support.
- Do not translate song lyrics unless requested.
- For singing, evaluate phoneme coverage, syllable timing, tone or pitch-accent requirements, consonant clusters, and vowel sustain per language.
- Use native-speaker review for pronunciation, naturalness, dialect, and lyric phrasing.
- If a provider lacks a locale, report the limitation and offer a compatible provider or clearly labeled fallback.

### Suggested multilingual settings

- Preferred conversation language.
- Automatic language detection.
- Supported input languages.
- Preferred speaking language.
- Voice locale and accent.
- Multilingual/code-switching mode.
- Singing language.
- Lyric translation preference.
- Fallback behavior when a provider lacks the selected language.

### Suggested implementation data model

```ts
export interface LanguageProfile {
  /** BCP 47 tag, e.g. "en-CA" or "pt-BR". */
  locale: string;
  languageName: string;
  script?: string;
  variety?: string;
}

export interface LanguageCapabilities {
  locale: string;
  speechRecognition: boolean;
  textToSpeech: boolean;
  singingSynthesis: boolean;
  lyricAlignment: boolean;
  voiceCloningAuthorized?: boolean;
}

export interface MultilingualSettings {
  conversationLocale: string;
  autoDetectInputLanguage: boolean;
  allowCodeSwitching: boolean;
  preferredSpeechLocale: string;
  preferredSingingLocale: string;
  translateLyrics: boolean;
}
```

Treat capability flags as provider-specific runtime data, not hard-coded guarantees. Validate them against the selected provider and model version.

---

## Summary

The intended product is a modular TypeScript AI platform with independent but coordinated conversation, speech, singing, composition, instrument, and audio systems. It should support original fairytale and elven-inspired voices, multiple personalities, multiple languages, singing styles, piano and orchestral accompaniment, and an opt-in Musical Reality mode that can turn a conversation into an original musical performance.

The recommended first milestone is a small end-to-end prototype using provider adapters and existing licensed synthesis components. Custom voice and music models can be explored later, once interfaces, evaluation processes, and rights-cleared training data are established.
