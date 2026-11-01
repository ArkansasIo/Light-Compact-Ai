/**
 * Original lyrics and English syllable splitting.
 *
 * Generated lyrics are assembled from line banks written for this project
 * (original text, no quoted songs). Users can also supply their own lyrics.
 */
import { pick, shuffle, type Rng } from "./random.js";

export type LyricKind = "verse" | "chorus" | "bridge";

export interface LyricSection {
  kind: LyricKind;
  lines: string[];
}

export interface GeneratedLyrics {
  title: string;
  theme: string;
  sections: LyricSection[];
}

interface Theme {
  name: string;
  keywords: string[];
  titles: string[];
  /** Verse lines in rhyming couplets. */
  couplets: [string, string][];
  chorus: [string, string, string, string];
  chorusAlt: [string, string];
}

const THEMES: Theme[] = [
  {
    name: "fairytale",
    keywords: [
      "fairy",
      "fairytale",
      "castle",
      "princess",
      "prince",
      "kingdom",
      "story",
      "storybook",
      "magic",
      "once upon",
      "royal",
      "crown",
    ],
    titles: [
      "The Lantern Gate",
      "A Crown of Willow",
      "The Glass Bell Waltz",
      "Once Upon a Morning",
    ],
    couplets: [
      ["Once upon a quiet morning", "Through a gate of silver light"],
      ["There's a castle made of moonbeams", "Where the swallows learn to fly"],
      ["Every lantern softly glowing", "Every window holds a dream"],
      ["Little footsteps on the stairway", "Follow ribbons down the stream"],
      ["In the garden roses whisper", "Of a kingdom far away"],
      ["And the old clock in the tower", "Counts the hours into day"],
    ],
    chorus: [
      "Come and dance where wishes wander",
      "Let the bells of morning ring",
      "Hold the story close and gentle",
      "Till the stars begin to sing",
    ],
    chorusAlt: ["Every page a door to open", "Every heart a place to stay"],
  },
  {
    name: "forest",
    keywords: [
      "forest",
      "elf",
      "elven",
      "tree",
      "trees",
      "woods",
      "willow",
      "leaf",
      "leaves",
      "garden",
      "meadow",
    ],
    titles: [
      "Silver Willow",
      "The Green and Golden Light",
      "Song of the Old Trees",
    ],
    couplets: [
      ["Under boughs of silver willow", "Where the evening shadows play"],
      ["Leaves are falling like a lullaby", "Rivers hum an old refrain"],
      ["Footsteps light upon the mosses", "Starlight caught in morning dew"],
      ["Ancient trees remember kindly", "Every song that wanders through"],
      ["Feathers drifting on the water", "Petals turning in the breeze"],
      ["All the forest keeps a secret", "Written softly on the leaves"],
    ],
    chorus: [
      "Wander with me, wander slowly",
      "Through the green and golden light",
      "Let the forest hold you gently",
      "Till the lanterns fill the night",
    ],
    chorusAlt: [
      "Sing the wind and sing the river",
      "Sing the silver of the sky",
    ],
  },
  {
    name: "sea",
    keywords: [
      "sea",
      "ocean",
      "ship",
      "sail",
      "sailing",
      "wave",
      "waves",
      "harbor",
      "harbour",
      "shore",
      "island",
    ],
    titles: ["Silver Sails", "The Harbor Lights", "Over Waters Wide"],
    couplets: [
      ["Out beyond the harbor lanterns", "Where the gulls are calling low"],
      [
        "There's a ship with silver canvas",
        "Riding where the north winds blow",
      ],
      ["Every wave a word of welcome", "Every tide a gentle sound"],
      ["Salt and starlight on the water", "Bringing home the lost and found"],
      ["Ropes are singing in the rigging", "Clouds are racing to the west"],
      ["And the compass in my pocket", "Knows the way to where we rest"],
    ],
    chorus: [
      "Sail away, my heart, sail away",
      "Over waters wide and blue",
      "Let the moon become our compass",
      "Till the morning brings us through",
    ],
    chorusAlt: ["Every shore a place to wander", "Every dawn a brighter view"],
  },
  {
    name: "night",
    keywords: [
      "night",
      "star",
      "stars",
      "moon",
      "lullaby",
      "sleep",
      "dream",
      "dreams",
      "evening",
      "bedtime",
    ],
    titles: [
      "Silver Lullaby",
      "When the Evening Folds the Hills",
      "A Song for Sleeping Stars",
    ],
    couplets: [
      ["When the evening folds the hillside", "And the candles start to glow"],
      ["Every star becomes a story", "Told in silver, soft and slow"],
      ["Close your eyes and hear the moonlight", "Humming tunes from long ago"],
      ["Dreams are drifting on the river", "Where the quiet breezes go"],
      [
        "Owls are calling from the chimney",
        "Clouds are blankets, white and deep",
      ],
      ["All the world is getting sleepy", "All the little lambs asleep"],
    ],
    chorus: [
      "Sleep now, little light, sleep now",
      "Let the starlight keep you near",
      "All the night is singing softly",
      "Morning light will soon be here",
    ],
    chorusAlt: ["Rest your head upon the evening", "Every worry disappears"],
  },
  {
    name: "adventure",
    keywords: [
      "adventure",
      "quest",
      "journey",
      "hero",
      "heroic",
      "mountain",
      "road",
      "brave",
      "courage",
      "explore",
      "dragon",
    ],
    titles: [
      "The Open Road",
      "Sunrise in Our Eyes",
      "A Compass Full of Courage",
    ],
    couplets: [
      [
        "Pack a map and lace your boot-strings",
        "There's a mountain calling clear",
      ],
      ["Every road a brand new chorus", "Every step a song to hear"],
      ["Over bridges, through the valleys", "Past the towers made of stone"],
      ["With a compass full of courage", "No one ever walks alone"],
      ["Dragons sleeping in the canyon", "Rivers roaring far below"],
      ["Every hill a little higher", "Every heart a brighter glow"],
    ],
    chorus: [
      "Raise your voice and let it carry",
      "Over hills and open skies",
      "We are bold and we are ready",
      "With the sunrise in our eyes",
    ],
    chorusAlt: ["Every mile a little louder", "Every heart begins to rise"],
  },
  {
    name: "friendship",
    keywords: [
      "friend",
      "friends",
      "friendship",
      "together",
      "love",
      "kindness",
      "family",
      "home",
      "heart",
    ],
    titles: ["Hand in Hand", "Every Voice a Color", "Sing Together"],
    couplets: [
      ["When the world feels cold and quiet", "And the rain is on the street"],
      ["There's a melody of kindness", "In the sound of friendly feet"],
      ["Share a story, share a supper", "Share a laugh beneath the sun"],
      ["Every little act of caring", "Makes the many into one"],
      ["When the night is long and lonely", "And the road is hard to find"],
      ["There's a lantern in the window", "Left for anyone behind"],
    ],
    chorus: [
      "Stand together, sing together",
      "Let the music fill the room",
      "Every voice a different color",
      "Every song a flower in bloom",
    ],
    chorusAlt: [
      "Hand in hand we'll keep on singing",
      "Chasing every shade of gloom",
    ],
  },
];

export const THEME_NAMES = THEMES.map((t) => t.name);

export function detectTheme(prompt: string): string {
  const text = prompt.toLowerCase();
  let best = THEMES[0]!;
  let bestScore = 0;
  for (const theme of THEMES) {
    const score = theme.keywords.filter((k) =>
      new RegExp(`\\b${k}\\b`).test(text),
    ).length;
    if (score > bestScore) {
      best = theme;
      bestScore = score;
    }
  }
  return best.name;
}

/** "a song about the northern lights" -> "the northern lights" (at most 4 words). */
export function topicOf(prompt: string): string | undefined {
  const m = /\babout\s+([a-z' -]{2,60})/i.exec(prompt);
  if (!m) return undefined;
  const words = m[1]!
    .replace(/[^a-z' -]/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  return words.length ? words.join(" ").toLowerCase() : undefined;
}

const titleCase = (s: string) =>
  s
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Of|The|And|A|In|On)\b/g, (w, _c, i) =>
      i === 0 ? w : w.toLowerCase(),
    );

/** Original lyrics for a prompt. "short" = verse + chorus; "full" = verse, chorus, verse, chorus. */
export function generateLyrics(
  prompt: string,
  rng: Rng,
  form: "short" | "full" = "short",
): GeneratedLyrics {
  const theme = THEMES.find((t) => t.name === detectTheme(prompt))!;
  const couplets = shuffle(rng, theme.couplets);
  const verse = (a: number, b: number): LyricSection => ({
    kind: "verse",
    lines: [...couplets[a]!, ...couplets[b]!],
  });
  const chorusLines: string[] = [...theme.chorus];
  if (rng() < 0.5) chorusLines.splice(2, 2, ...theme.chorusAlt);
  const topic = topicOf(prompt);
  if (topic) chorusLines[0] = `Sing of ${topic}, sing it softly`;
  const chorus: LyricSection = { kind: "chorus", lines: chorusLines };

  return {
    title: topic ? titleCase(topic) : pick(rng, theme.titles),
    theme: theme.name,
    sections:
      form === "full"
        ? [verse(0, 1), chorus, verse(2, 3), chorus]
        : [verse(0, 1), chorus],
  };
}

/**
 * Parse user lyrics. Sections are separated by blank lines; a first line like
 * "[Chorus]" or "Verse 2:" sets the section type (default: verse).
 */
export function parseLyrics(text: string): LyricSection[] {
  const sections: LyricSection[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let kind: LyricKind = "verse";
    const header = /^\[?\s*(verse|chorus|bridge|refrain)\b[^\]]*\]?:?$/i.exec(
      lines[0] ?? "",
    );
    if (header) {
      const word = header[1]!.toLowerCase();
      kind = word === "refrain" ? "chorus" : (word as LyricKind);
      lines.shift();
    }
    if (lines.length) sections.push({ kind, lines });
  }
  if (sections.length === 0) throw new Error("lyrics are empty");
  return sections;
}

// ---------------------------------------------------------------- syllables

export type Vowel = "a" | "e" | "i" | "o" | "u";

export interface Syllable {
  text: string;
  /** Main vowel sound, used to shape the sung vowel. */
  vowel: Vowel;
  /** Consonants before the vowel, e.g. "str". */
  onset: string;
  /** Last syllable of a word (a good place to hold a note). */
  wordEnd: boolean;
}

const VOWEL_RUN = /[aeiouy]+/g;

/** Split one English word into approximate syllables (heuristic, not a dictionary). */
export function splitWord(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return [];
  const groups: [number, number][] = [];
  for (const m of w.matchAll(VOWEL_RUN)) {
    let start = m.index;
    let text = m[0];
    // "y" at the start of a word is a consonant ("yellow").
    if (start === 0 && text.startsWith("y")) {
      start = 1;
      text = text.slice(1);
      if (!text) continue;
    }
    groups.push([start, start + text.length]);
  }
  // A final silent "e" ("made", "stone") is not a syllable, but "-le" is ("castle").
  const last = groups.at(-1);
  if (
    groups.length > 1 &&
    last &&
    last[0] === w.length - 1 &&
    w.endsWith("e")
  ) {
    const consonantLe =
      w.endsWith("le") && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3]!);
    if (!consonantLe) groups.pop();
  }
  // "-ed" after a consonant other than t/d is silent ("turned", "played").
  const tail = groups.at(-1);
  if (
    groups.length > 1 &&
    tail &&
    w.endsWith("ed") &&
    tail[0] === w.length - 2 &&
    !/[td]ed$/.test(w)
  ) {
    groups.pop();
  }
  if (groups.length <= 1) return [w];

  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < groups.length - 1; i++) {
    const gapStart = groups[i]![1];
    const gapEnd = groups[i + 1]![0];
    const consonants = gapEnd - gapStart;
    // V-CV, VC-CV, VC-CCV
    const split =
      consonants <= 1 ? gapStart : gapEnd - (consonants >= 3 ? 2 : 1);
    parts.push(w.slice(start, split));
    start = split;
  }
  parts.push(w.slice(start));
  return parts.filter(Boolean);
}

export function vowelOf(syllable: string): Vowel {
  const s = syllable.toLowerCase();
  const group = (/[aeiouy]+/.exec(s)?.[0] ?? "a").replace(/^y(?=[aeiou])/, "");
  if (/^(ee|ea|ie|ey)/.test(group) || group === "i" || group === "y")
    return "i";
  if (/^(oo|ew|ue|u)/.test(group)) return "u";
  if (/^(ai|ay|ei|e)/.test(group)) return "e";
  if (/^(o|au|aw)/.test(group) && !group.startsWith("ou")) return "o";
  return "a";
}

export function syllabifyLine(line: string): Syllable[] {
  const out: Syllable[] = [];
  const words = line
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  for (const word of words) {
    const parts = splitWord(word.replace(/'/g, ""));
    parts.forEach((text, i) => {
      out.push({
        text,
        vowel: vowelOf(text),
        onset: /^[^aeiouy]*/.exec(text)?.[0] ?? "",
        wordEnd: i === parts.length - 1,
      });
    });
  }
  return out;
}
