import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transport } from "../audio/transport.js";
import { encodeWav } from "../audio/wav.js";
import { mixTracks } from "../audio/mixer.js";
import {
  degreeToMidi,
  diatonicChord,
  keyName,
  parseKey,
} from "../music/theory.js";
import {
  parseLyrics,
  splitWord,
  syllabifyLine,
  topicOf,
  vowelOf,
} from "../music/lyrics.js";
import {
  createSong,
  describeSong,
  detectMood,
  detectStyle,
  loadSong,
  renderSong,
  saveSong,
  songToMidi,
} from "../musical-mode/song.js";
import {
  applyVoiceProfile,
  BUILTIN_VOICE_PROFILES,
  findVoiceProfile,
  loadVoiceProfiles,
  validateVoiceProfile,
} from "../profiles/voices.js";
import { loadVoiceConfig } from "../voice/voice.js";

test("keys, scales and diatonic chords", () => {
  assert.deepEqual(parseKey("D major"), { tonic: 2, mode: "major" });
  assert.deepEqual(parseKey("Am"), { tonic: 9, mode: "minor" });
  assert.deepEqual(parseKey("Bb dorian"), { tonic: 10, mode: "dorian" });
  assert.equal(keyName(parseKey("f# minor")), "F# minor");
  assert.throws(() => parseKey("H major"), /could not read key/);

  const c = parseKey("C major");
  assert.equal(degreeToMidi(c, 0), 60);
  assert.equal(degreeToMidi(c, 7), 72);
  assert.equal(degreeToMidi(c, -1), 59);
  assert.equal(diatonicChord(c, 2).name, "Dm");
  assert.equal(diatonicChord(c, 7).name, "Bdim");
  assert.equal(diatonicChord(c, 5, true).name, "G7");
  assert.equal(diatonicChord(c, 1, true).name, "Cmaj7");
  assert.equal(diatonicChord(parseKey("A minor"), 5).name, "Em");
});

test("transport maps beats to samples and ticks", () => {
  const t = new Transport(120, 48000);
  assert.equal(t.secondsPerBeat, 0.5);
  assert.equal(t.beatsToSamples(1), 24000);
  assert.equal(t.samplesToBeats(48000), 2);
  assert.equal(t.barsToBeats(2), 8);
  assert.equal(t.beatsToTicks(1.5), 720);
  assert.throws(() => new Transport(5, 48000), /tempo/);
});

test("English syllables, vowels and lyric parsing", () => {
  assert.deepEqual(splitWord("beautiful"), ["beau", "ti", "ful"]);
  assert.deepEqual(splitWord("morning"), ["mor", "ning"]);
  assert.deepEqual(splitWord("castle"), ["cas", "tle"]);
  assert.deepEqual(splitWord("made"), ["made"]);
  assert.deepEqual(splitWord("yellow"), ["yel", "low"]);
  assert.deepEqual(splitWord("fly"), ["fly"]);
  assert.equal(vowelOf("sing"), "i");
  assert.equal(vowelOf("moon"), "u");
  assert.equal(vowelOf("day"), "e");
  const line = syllabifyLine("Hold the story close");
  assert.deepEqual(
    line.map((s) => s.text),
    ["hold", "the", "sto", "ry", "close"],
  );
  assert.equal(line[2]!.wordEnd, false);
  assert.equal(line[3]!.wordEnd, true);

  const sections = parseLyrics(
    "[Verse]\nOne two\nThree four\n\nChorus:\nLa la la\n\nfive six",
  );
  assert.deepEqual(
    sections.map((s) => s.kind),
    ["verse", "chorus", "verse"],
  );
  assert.deepEqual(sections[1]!.lines, ["La la la"]);
  assert.throws(() => parseLyrics("  \n\n "), /empty/);
  assert.equal(
    topicOf("write a song about the northern lights"),
    "the northern lights",
  );
});

test("style and mood come from the prompt", () => {
  assert.equal(
    detectStyle("Create a gentle, original fairytale song."),
    "fairytale",
  );
  assert.equal(detectStyle("a jazzy tune"), "jazz");
  assert.equal(detectStyle("an elven folk song"), "celtic");
  assert.equal(detectStyle("something new"), "fairytale");
  assert.equal(detectMood("a sad farewell"), "sad");
  assert.equal(detectMood("an epic battle hymn"), "epic");
});

test("createSong: the brief's milestone prompt gives a complete, singable arrangement", () => {
  const song = createSong({
    prompt: "Create a gentle, original fairytale song.",
  });
  assert.equal(song.style, "fairytale");
  assert.equal(song.provenance.lyrics, "generated-original");
  assert.deepEqual(
    song.sections.map((s) => s.kind),
    ["intro", "verse", "chorus", "outro"],
  );
  assert.ok(
    song.tracks.some((t) => t.instrument === "piano"),
    "has piano accompaniment",
  );

  const lead = song.tracks.find((t) => t.role === "lead")!;
  const voice = findVoiceProfile(lead.voiceProfileId!)!;
  // One note per syllable, inside the singer's range, never overlapping.
  const syllables = song.lyrics
    .flatMap((s) => s.lines)
    .flatMap((l) => syllabifyLine(l));
  assert.equal(lead.notes.length, syllables.length);
  assert.deepEqual(
    lead.notes.map((n) => n.lyricSyllable),
    syllables.map((s) => s.text),
  );
  for (const n of lead.notes) {
    assert.ok(
      n.pitch >= voice.singingRange.low && n.pitch <= voice.singingRange.high,
      `pitch ${n.pitch} in range`,
    );
  }
  const sorted = [...lead.notes].sort((a, b) => a.startBeats - b.startBeats);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(
      sorted[i]!.startBeats >=
        sorted[i - 1]!.startBeats + sorted[i - 1]!.durationBeats - 1e-9,
      "no overlap",
    );
  }
  // The song ends on the tonic.
  const lastNote = sorted.at(-1)!;
  assert.equal(
    (((lastNote.pitch - parseKey(song.key).tonic) % 12) + 12) % 12,
    0,
  );
  // Every note starts inside the song.
  for (const t of song.tracks)
    for (const n of t.notes) assert.ok(n.startBeats < song.lengthBeats);

  // Deterministic for the same prompt.
  const again = createSong({
    prompt: "Create a gentle, original fairytale song.",
  });
  assert.deepEqual(again.tracks, song.tracks);
  assert.ok(describeSong(song)[0]!.includes(song.key));
});

test("createSong options: duet, waltz time, user lyrics, validation", () => {
  const duet = createSong({
    prompt: "an epic duet",
    voices: ["bright-tenor", "fairytale-soprano"],
    meter: 3,
    key: "D minor",
    tempo: 90,
  });
  assert.equal(duet.meter, 3);
  assert.equal(duet.key, "D minor");
  const verses = duet.sections.filter((s) => s.kind === "verse");
  assert.equal(verses.length, 2, "duets default to the full form");
  assert.deepEqual(
    verses.map((s) => s.singer),
    ["bright-tenor", "fairytale-soprano"],
  );
  assert.ok(duet.tracks.some((t) => t.id === "harmony-fairytale-soprano"));

  const mine = createSong({
    prompt: "a ballad",
    lyrics: "Morning comes\nSoftly now\n\n[Chorus]\nSing with me",
  });
  assert.equal(mine.provenance.lyrics, "user-supplied");
  assert.equal(mine.title, "Morning comes");

  assert.throws(() => createSong({ prompt: "" }), /describe the song/);
  assert.throws(
    () => createSong({ prompt: "x", style: "polka" }),
    /unknown style/,
  );
  assert.throws(
    () => createSong({ prompt: "x", voices: ["nobody"] }),
    /unknown voice profile/,
  );
  assert.throws(() => createSong({ prompt: "x", meter: 5 }), /meter/);
});

test("MIDI export has a header, one track per part plus tempo, and lyrics", () => {
  const song = createSong({ prompt: "a short pop song", seed: 3 });
  const midi = songToMidi(song);
  assert.equal(midi.subarray(0, 4).toString("ascii"), "MThd");
  assert.equal(midi.readUInt16BE(8), 1, "format 1");
  assert.equal(midi.readUInt16BE(10), song.tracks.length + 1);
  assert.equal(midi.readUInt16BE(12), 480);
  assert.ok(midi.includes(Buffer.from([0xff, 0x51, 0x03])), "tempo event");
  const firstSyllable = song.tracks.find((t) => t.role === "lead")!.notes[0]!
    .lyricSyllable!;
  assert.ok(midi.includes(Buffer.from(firstSyllable)), "lyric text present");
});

test("WAV encoding and mixing", () => {
  const wav = encodeWav([new Float32Array([0, 1, -1, 2])], 8000);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.readUInt32LE(24), 8000);
  assert.equal(wav.length, 44 + 8);
  assert.equal(wav.readInt16LE(46), 32767);
  assert.equal(wav.readInt16LE(50), 32767, "clipped");

  const [l, r] = mixTracks(
    [
      {
        name: "a",
        audio: new Float32Array([0.5, -0.25]),
        gain: 1,
        pan: -1,
        reverb: 0,
      },
    ],
    8000,
    { reverbLevel: 0 },
  );
  assert.ok(Math.abs(l[0]!) > 0.8 && Math.abs(r[0]!) < 1e-6, "hard-left pan");
});

test("renderSong produces finite, synchronized audio and saves every file", async () => {
  const song = createSong({ prompt: "a gentle fairytale song", seed: 11 });
  const rendered = await renderSong(song, { sampleRate: 8000 });
  const transport = new Transport(song.tempo, 8000);
  const expected = transport.beatsToSamples(song.lengthBeats) + 3 * 8000;
  for (const channel of [
    ...rendered.mix,
    ...rendered.vocals,
    ...rendered.accompaniment,
  ]) {
    assert.equal(channel.length, expected);
    let peak = 0;
    for (const v of channel) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak > 0.1 && peak <= 0.9, `peak ${peak}`);
  }
  // The lead vocal is silent until its first note's beat, then sounds.
  const lead = rendered.stems.find((s) => s.id.startsWith("lead-"))!;
  const first = transport.beatsToSamples(
    song.tracks.find((t) => t.role === "lead")!.notes[0]!.startBeats,
  );
  const loudest = (a: Float32Array) =>
    a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.equal(
    loudest(lead.audio.subarray(0, first)),
    0,
    "silent before the first sung note",
  );
  assert.ok(
    loudest(lead.audio.subarray(first, first + 2000)) > 0.05,
    "sound after it",
  );

  const dir = mkdtempSync(join(tmpdir(), "lcai-song-"));
  try {
    const saved = saveSong(song, rendered, dir, { stems: true });
    assert.equal(
      readFileSync(saved.mix).subarray(0, 4).toString("ascii"),
      "RIFF",
    );
    assert.equal(saved.stems.length, song.tracks.length);
    const loaded = loadSong(saved.json);
    assert.deepEqual(loaded.tracks, song.tracks);
    writeFileSync(join(dir, "bad.json"), "{}");
    assert.throws(
      () => loadSong(join(dir, "bad.json")),
      /not a Light Compact AI song/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("voice profiles: built-ins are valid, user files extend them, speech settings follow", () => {
  for (const p of BUILTIN_VOICE_PROFILES) validateVoiceProfile(p);
  assert.ok(findVoiceProfile("ethereal-elven-princess"));

  const dir = mkdtempSync(join(tmpdir(), "lcai-voices-"));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "mine.json"),
      JSON.stringify({
        id: "my-voice",
        name: "Mine",
        extends: "aurora",
        timbre: { breathiness: 0.9 },
      }),
    );
    const profiles = loadVoiceProfiles(dir);
    const mine = findVoiceProfile("my-voice", profiles)!;
    assert.equal(mine.timbre.breathiness, 0.9);
    assert.equal(
      mine.timbre.brightness,
      findVoiceProfile("aurora")!.timbre.brightness,
    );
    writeFileSync(
      join(dir, "z-bad.json"),
      JSON.stringify({
        id: "bad",
        name: "Bad",
        extends: "aurora",
        timbre: { breathiness: 3 },
      }),
    );
    assert.throws(() => loadVoiceProfiles(dir), /breathiness/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const base = loadVoiceConfig({}, {});
  const baritone = applyVoiceProfile(
    base,
    findVoiceProfile("gentle-baritone")!,
  );
  assert.equal(baritone.openai.voiceId, "onyx");
  assert.match(baritone.openai.instructions, /warm/);
  assert.match(baritone.azure.rate, /^[+-]\d+%$/);
  const elven = applyVoiceProfile(base, findVoiceProfile("ethereal-elven")!);
  assert.equal(
    elven.openai.voiceId,
    base.openai.voiceId,
    "higher voices keep the configured voice",
  );
  assert.match(elven.openai.instructions, /breathy/);
});
