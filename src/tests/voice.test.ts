import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSpeechRequest,
  describeVoice,
  loadVoiceConfig,
  prepareSpeechText,
  synthesize,
} from "../voice/voice.js";
import { playerCommands } from "../voice/player.js";

const KEYS = {
  ELEVENLABS_API_KEY: "el-test",
  PLAYHT_API_KEY: "ph-test",
  PLAYHT_USER_ID: "user-1",
};

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fake fetch that records calls and answers per host. */
function fakeFetch(status: Record<string, number>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: (init.headers as Record<string, string>)["content-type"]?.includes(
        "json",
      )
        ? JSON.parse(init.body as string)
        : { raw: init.body },
    });
    const host = new URL(url).host;
    const code = status[host] ?? 200;
    return code === 200
      ? new Response(new Uint8Array([0xff, 0xfb, 1, 2]), { status: 200 })
      : new Response("quota exceeded", { status: code });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

test("aurora preset loads with keys from the environment only", () => {
  const config = loadVoiceConfig(KEYS, {});
  assert.equal(config.preset, "aurora");
  assert.equal(config.provider, "elevenlabs");
  assert.equal(config.fallback, true);
  assert.equal(config.elevenlabs.apiKey, "el-test");
  assert.equal(config.playht.userId, "user-1");
  assert.ok(config.elevenlabs.settings.stability < 0.5, "aurora is expressive");

  const status = describeVoice(config);
  assert.equal(status.providers.elevenlabs.ready, true);
  assert.ok(!JSON.stringify(status).includes("el-test"), "status hides keys");
});

test("environment overrides the config file; bad values are rejected", () => {
  const config = loadVoiceConfig(
    {
      LCAI_VOICE_PROVIDER: "playht",
      PLAYHT_VOICE_ID: "s3://mine",
      LCAI_VOICE_FALLBACK: "off",
    },
    { provider: "elevenlabs", elevenlabs: { settings: { style: 0.1 } } },
  );
  assert.equal(config.provider, "playht");
  assert.equal(config.playht.voiceId, "s3://mine");
  assert.equal(config.fallback, false);
  assert.equal(config.elevenlabs.settings.style, 0.1);
  assert.equal(
    config.elevenlabs.settings.stability,
    0.35,
    "other preset values kept",
  );

  assert.throws(
    () => loadVoiceConfig({ LCAI_VOICE_PROVIDER: "nope" }, {}),
    /provider/,
  );
  assert.throws(
    () => loadVoiceConfig({ LCAI_VOICE_PRESET: "nope" }, {}),
    /preset/,
  );
  assert.throws(
    () => loadVoiceConfig({}, { elevenlabs: { settings: { stability: 3 } } }),
    /stability/,
  );
});

test("requests match each provider's API", () => {
  const config = loadVoiceConfig(KEYS, {});
  const el = buildSpeechRequest(config, "elevenlabs", "hi");
  assert.match(
    el.url,
    /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/[\w-]+\?output_format=mp3/,
  );
  assert.equal(el.headers["xi-api-key"], "el-test");
  const elBody = JSON.parse(el.body);
  assert.equal(elBody.text, "hi");
  assert.equal(elBody.model_id, "eleven_multilingual_v2");
  assert.equal(elBody.voice_settings.style, 0.4);

  const ph = buildSpeechRequest(config, "playht", "hi");
  assert.equal(ph.url, "https://api.play.ht/api/v2/tts/stream");
  assert.equal(ph.headers.AUTHORIZATION, "ph-test");
  assert.equal(ph.headers["X-USER-ID"], "user-1");
  const phBody = JSON.parse(ph.body);
  assert.match(phBody.voice, /^s3:\/\/.*manifest\.json$/);
  assert.equal(phBody.output_format, "mp3");
});

test("OpenAI and Azure requests match their APIs", () => {
  const config = loadVoiceConfig(
    {
      OPENAI_API_KEY: "sk-test",
      AZURE_SPEECH_KEY: "az-test",
      AZURE_SPEECH_REGION: "eastus",
    },
    {},
  );
  const oa = buildSpeechRequest(config, "openai", "hi");
  assert.equal(oa.url, "https://api.openai.com/v1/audio/speech");
  assert.equal(oa.headers.authorization, "Bearer sk-test");
  const oaBody = JSON.parse(oa.body);
  assert.equal(oaBody.input, "hi");
  assert.equal(oaBody.voice, "shimmer");
  assert.equal(oaBody.response_format, "mp3");
  assert.match(oaBody.instructions, /soft/i);

  const az = buildSpeechRequest(config, "azure", `Tom & "Jerry" <3`);
  assert.equal(
    az.url,
    "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
  );
  assert.equal(az.headers["Ocp-Apim-Subscription-Key"], "az-test");
  assert.equal(az.headers["content-type"], "application/ssml+xml");
  assert.match(az.headers["X-Microsoft-OutputFormat"]!, /mp3/);
  assert.match(az.body, /xml:lang="en-US"/);
  assert.match(az.body, /<voice name="en-US-AvaNeural">/);
  assert.match(az.body, /<prosody rate="-8%" pitch="\+2%">/);
  assert.match(
    az.body,
    /Tom &amp; &quot;Jerry&quot; &lt;3/,
    "text is XML-escaped",
  );

  assert.throws(
    () => loadVoiceConfig({ AZURE_SPEECH_REGION: "evil.com/x" }, {}),
    /AZURE_SPEECH_REGION/,
  );
  assert.throws(
    () => loadVoiceConfig({}, { azure: { rate: "fast" } }),
    /azure\.rate/,
  );
});

test("synthesize falls back through providers in order", async () => {
  const config = loadVoiceConfig(
    {
      ...KEYS,
      OPENAI_API_KEY: "sk",
      AZURE_SPEECH_KEY: "az",
      AZURE_SPEECH_REGION: "eastus",
    },
    {},
  );
  const { calls, impl } = fakeFetch({
    "api.elevenlabs.io": 401,
    "api.openai.com": 429,
  });
  const result = await synthesize("hello there", config, { fetchImpl: impl });
  assert.equal(result.provider, "azure");
  assert.equal(result.contentType, "audio/mpeg");
  assert.equal(result.audio.length, 4);
  assert.deepEqual(
    calls.map((c) => new URL(c.url).host),
    ["api.elevenlabs.io", "api.openai.com", "eastus.tts.speech.microsoft.com"],
  );

  // A chosen first provider goes first; the rest keep their order.
  const second = fakeFetch({ "eastus.tts.speech.microsoft.com": 500 });
  const r2 = await synthesize("hi", config, {
    provider: "azure",
    fetchImpl: second.impl,
  });
  assert.equal(r2.provider, "elevenlabs");
});

test("synthesize skips providers without keys and reports every failure", async () => {
  const config = loadVoiceConfig(
    { PLAYHT_API_KEY: "k", PLAYHT_USER_ID: "u" },
    {},
  );
  const ok = fakeFetch({});
  const result = await synthesize("hi", config, { fetchImpl: ok.impl });
  assert.equal(result.provider, "playht");
  assert.equal(ok.calls.length, 1, "ElevenLabs was not called without a key");

  const failing = fakeFetch({ "api.play.ht": 500 });
  await assert.rejects(
    synthesize("hi", config, { fetchImpl: failing.impl }),
    /ElevenLabs: ELEVENLABS_API_KEY is not set; OpenAI: OPENAI_API_KEY is not set; Azure: AZURE_SPEECH_KEY and AZURE_SPEECH_REGION not set; Play\.ht: HTTP 500: quota exceeded/,
  );

  const noFallback = loadVoiceConfig(
    { ...KEYS, LCAI_VOICE_FALLBACK: "false" },
    {},
  );
  const bad = fakeFetch({ "api.elevenlabs.io": 401 });
  await assert.rejects(
    synthesize("hi", noFallback, { fetchImpl: bad.impl }),
    /ElevenLabs: HTTP 401/,
  );
  assert.equal(bad.calls.length, 1);

  await assert.rejects(
    synthesize("   ", config, { fetchImpl: ok.impl }),
    /empty/,
  );
});

test("speech text is cleaned and cut at a sentence or word", () => {
  assert.equal(prepareSpeechText("  a \n b  ", 100), "a b");
  assert.equal(
    prepareSpeechText("Hello world. Three four five", 20),
    "Hello world.",
  );
  assert.equal(prepareSpeechText("alpha beta gamma", 12), "alpha beta");
});

test("player picks a command per platform and honors LCAI_AUDIO_PLAYER", () => {
  assert.equal(playerCommands("a.mp3", "win32", {})[0]![0], "powershell.exe");
  assert.deepEqual(playerCommands("a.mp3", "darwin", {}), [
    ["afplay", ["a.mp3"]],
  ]);
  assert.equal(playerCommands("a.mp3", "linux", {})[0]![0], "ffplay");
  assert.deepEqual(
    playerCommands("a.mp3", "linux", {
      LCAI_AUDIO_PLAYER: "vlc --play-and-exit",
    }),
    [["vlc", ["--play-and-exit", "a.mp3"]]],
  );
  const quoted = playerCommands("C:\\it's\\a.mp3", "win32", {})[0]![1].at(-1)!;
  assert.ok(
    quoted.includes("'C:\\it''s\\a.mp3'"),
    "single quotes are escaped for PowerShell",
  );
});
