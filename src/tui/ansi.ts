/** Minimal ANSI helpers for the terminal UI (no dependencies). */

const ESC = "\x1b[";

/** Colors are off when output is not a terminal or NO_COLOR is set. */
const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

function style(open: string, close: string): (text: string) => string {
  return (text) =>
    colorEnabled ? `${ESC}${open}m${text}${ESC}${close}m` : text;
}

export const c = {
  bold: style("1", "22"),
  dim: style("2", "22"),
  italic: style("3", "23"),
  accent: style("38;5;43", "39"),
  gray: style("90", "39"),
  red: style("31", "39"),
  green: style("32", "39"),
  yellow: style("33", "39"),
};

/** Accent colors for each UI theme (256-color codes). */
const THEME_CODES: Record<string, string> = {
  teal: "38;5;43",
  orange: "38;5;209",
  blue: "38;5;75",
  purple: "38;5;141",
  mono: "97",
};

/** Change the accent color used by c.accent. Unknown names fall back to teal. */
export function setTheme(name: string): void {
  c.accent = style(THEME_CODES[name] ?? THEME_CODES.teal!, "39");
}

export const cursor = {
  up: (n: number): string => (n > 0 ? `${ESC}${n}A` : ""),
  /** Move to a 0-based column on the current line. */
  toColumn: (n: number): string => `${ESC}${n + 1}G`,
  clearDown: `${ESC}J`,
  clearScreen: `${ESC}2J${ESC}3J${ESC}H`,
  hide: `${ESC}?25l`,
  show: `${ESC}?25h`,
};

/** Remove ANSI escape sequences. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

/** Number of visible characters (ANSI codes excluded). */
export function visibleLength(text: string): number {
  return [...stripAnsi(text)].length;
}

/** Pad with spaces to a visible width. */
export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

/** Cut plain text to a width, ending with "…" when shortened. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  return text.length <= width
    ? text
    : text.slice(0, Math.max(0, width - 1)) + "…";
}

/** Keep the end of plain text (useful for paths), starting with "…" when shortened. */
export function truncateStart(text: string, width: number): string {
  if (width <= 0) return "";
  return text.length <= width
    ? text
    : "…" + text.slice(text.length - width + 1);
}

/** Wrap plain text to lines no wider than width, breaking long words. */
export function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const rawWord of paragraph.split(/ +/)) {
      let word = rawWord;
      while (word.length > width) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += " " + word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}
