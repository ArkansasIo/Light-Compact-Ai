/**
 * Full-screen-style terminal chat UI for the compact AI.
 *
 * Layout (bottom of the terminal, redrawn in place):
 *
 *   ● streaming reply…            <- only while generating
 *   ⠹ Thinking… (2s · esc to interrupt)
 *
 *   ╭──────────────────────────────────╮
 *   │ > your prompt here               │
 *   ╰──────────────────────────────────╯
 *     ? for shortcuts         vocab 76 · max 24 tokens
 *
 * Finished messages are printed above this "live region" and scroll normally.
 */
import { emitKeypressEvents } from "node:readline";
import { readFileSync } from "node:fs";
import {
  c,
  cursor,
  padEnd,
  setTheme,
  truncate,
  truncateStart,
  wordWrap,
} from "./ansi.js";
import {
  DEFAULT_SETTINGS,
  SETTING_DEFS,
  adjustSetting,
  formatSetting,
  normalizeSettings,
  saveSettings,
  toSamplingOptions,
  type UserSettings,
} from "../settings/user-settings.js";
import { LineEditor } from "./line-editor.js";
import {
  COMMANDS,
  SHORTCUTS,
  matchCommands,
  parseCommand,
  type SlashCommand,
} from "./commands.js";
import {
  prepareTraining,
  readCorpus,
  saveBundle,
  streamReply,
  type CompactBundle,
} from "../compact/bundle.js";
import type { CompactConfig } from "../config/compact-config.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const CTRL_C_WINDOW_MS = 2000;
const MAX_REPLY_TOKENS = 256;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface ChatAppOptions {
  config: CompactConfig;
  /** Where the model is loaded from and where /train saves it. */
  modelPath: string;
  /** The loaded model, or undefined if none has been trained yet. */
  bundle: CompactBundle | undefined;
  /** Generation and UI settings (changed with /settings). */
  settings: UserSettings;
  /** Where /settings saves changes. */
  settingsPath: string;
}

export class ChatApp {
  private readonly out = process.stdout;
  private readonly editor = new LineEditor();
  private bundle: CompactBundle | undefined;
  private settings: UserSettings;

  // Settings panel state.
  private settingsOpen = false;
  private settingsIndex = 0;
  private settingsChanged = false;

  // Busy state (generating or training).
  private busy = false;
  private aborted = false;
  private spinnerText = "";
  private spinnerFrame = 0;
  private busySince = 0;
  private spinnerTimer: NodeJS.Timeout | undefined;
  /** Lines shown above the spinner while busy (the streaming reply). */
  private pendingLines: string[] = [];

  // Input helpers.
  private suggestionIndex = 0;
  private showShortcuts = false;
  private ctrlCArmedAt = 0;

  // Live-region bookkeeping: which row of the region the cursor is on.
  private cursorRow = 0;
  private drawn = false;

  constructor(private readonly options: ChatAppOptions) {
    this.bundle = options.bundle;
    this.settings = options.settings;
    setTheme(this.settings.theme);
  }

  private get maxTokens(): number {
    return this.settings.maxTokens;
  }

  /** Usable width; one less than the terminal to avoid auto-wrap. */
  private get width(): number {
    return Math.max(24, (this.out.columns ?? 80) - 1);
  }

  start(): void {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on(
      "keypress",
      (str: string | undefined, key: Key | undefined) => {
        this.onKey(str, key ?? {});
      },
    );
    this.out.on("resize", () => this.refresh());
    process.on("exit", () => this.out.write(cursor.show));

    this.printBanner();
    if (!this.bundle) {
      this.print(
        c.yellow(
          `  No model at ${this.options.modelPath}. Type /train to train one from ${this.options.config.training.corpus}.\n`,
        ),
      );
    }
  }

  // ---------------------------------------------------------------- drawing

  /** Print finished output above the live region. */
  private print(text: string): void {
    this.clearLive();
    this.out.write(text.endsWith("\n") ? text : text + "\n");
    this.renderLive();
  }

  /** Redraw the live region in place. */
  private refresh(): void {
    this.clearLive();
    this.renderLive();
  }

  private clearLive(): void {
    if (!this.drawn) return;
    this.out.write(cursor.up(this.cursorRow) + "\r" + cursor.clearDown);
    this.drawn = false;
  }

  /** Draw the live region starting at the current cursor row. */
  private renderLive(): void {
    const width = this.width;

    if (this.settingsOpen) {
      // The panel replaces the input box; the cursor rests on its last line.
      const panel = this.settingsPanelLines(width);
      this.out.write("\r" + cursor.clearDown + panel.join("\n") + cursor.hide);
      this.cursorRow = panel.length - 1;
      this.drawn = true;
      return;
    }

    const lines: string[] = [];

    if (this.busy) {
      // Keep the region shorter than the terminal so cursor math stays valid.
      const maxPending = Math.max(1, (this.out.rows ?? 24) - 10);
      lines.push(...this.pendingLines.slice(-maxPending));
      const seconds = Math.floor((Date.now() - this.busySince) / 1000);
      const frame = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length]!;
      lines.push(
        `${c.accent(frame)} ${this.spinnerText} ${c.gray(`(${seconds}s · esc to interrupt)`)}`,
      );
      lines.push("");
    }

    // Input box.
    const inner = width - 6; // "│ > " + " │"
    const { text, cursor: position } = this.editor;
    const scroll = position > inner - 1 ? position - inner + 1 : 0;
    const visible = text
      ? text.slice(scroll, scroll + inner)
      : this.busy
        ? ""
        : c.dim(truncate('Try "hello", or type / for commands', inner));

    lines.push(c.gray("╭" + "─".repeat(width - 2) + "╮"));
    const inputRow = lines.length;
    lines.push(
      `${c.gray("│")} ${c.accent(">")} ${padEnd(visible, inner)} ${c.gray("│")}`,
    );
    lines.push(c.gray("╰" + "─".repeat(width - 2) + "╯"));
    lines.push(...this.footerLines(width));

    const rowsBelowInput = lines.length - 1 - inputRow;
    this.out.write(
      "\r" +
        cursor.clearDown +
        lines.join("\n") +
        cursor.up(rowsBelowInput) +
        cursor.toColumn(4 + position - scroll) +
        (this.busy ? cursor.hide : cursor.show),
    );
    this.cursorRow = inputRow;
    this.drawn = true;
  }

  private footerLines(width: number): string[] {
    const suggestions = this.suggestions();
    if (suggestions.length > 0) {
      return suggestions.map((command, i) => {
        const label = padEnd(
          `/${command.name}${command.args ? " " + command.args : ""}`,
          16,
        );
        const line = truncate(`  ${label} ${command.description}`, width);
        return i === this.suggestionIndex ? c.accent(line) : c.gray(line);
      });
    }

    if (Date.now() - this.ctrlCArmedAt < CTRL_C_WINDOW_MS) {
      return [c.yellow("  Press Ctrl-C again to exit")];
    }

    if (this.showShortcuts) {
      const half = Math.ceil(SHORTCUTS.length / 2);
      const rows: string[] = [];
      for (let i = 0; i < half; i++) {
        const left = SHORTCUTS[i]!;
        const right = SHORTCUTS[i + half];
        const cell = (s: [string, string]) =>
          padEnd(`${s[0]}  ${c.gray(s[1])}`, 30);
        rows.push("  " + cell(left) + (right ? cell(right) : ""));
      }
      return rows;
    }

    const left = "  ? for shortcuts";
    const right = this.bundle
      ? `vocab ${this.bundle.tokenizer.vocabSize} · ${this.bundle.model.config.numLayers} layers · max ${this.maxTokens} tokens`
      : "no model loaded";
    const gap = Math.max(1, width - left.length - right.length);
    return [c.gray(truncate(left + " ".repeat(gap) + right, width))];
  }

  /** The /settings panel: one row per setting, the selected one editable with ← →. */
  private settingsPanelLines(width: number): string[] {
    const inner = width - 4; // "│ " + " │"
    const labelWidth = 22;
    const title = " Settings ";
    const lines = [
      c.gray("╭─") +
        c.bold(c.accent(title)) +
        c.gray("─".repeat(Math.max(0, width - 3 - title.length)) + "╮"),
      `${c.gray("│")} ${" ".repeat(inner)} ${c.gray("│")}`,
    ];

    SETTING_DEFS.forEach((def, i) => {
      const selected = i === this.settingsIndex;
      const value = formatSetting(this.settings, def);
      const isDefault = this.settings[def.key] === DEFAULT_SETTINGS[def.key];
      const marker = selected ? c.accent("›") : " ";
      const label = selected
        ? c.bold(padEnd(def.label, labelWidth))
        : padEnd(def.label, labelWidth);
      const shown = selected
        ? c.accent(`◂ ${value} ▸`)
        : isDefault
          ? c.gray(value)
          : value;
      lines.push(
        `${c.gray("│")} ${padEnd(`${marker} ${label} ${shown}`, inner)} ${c.gray("│")}`,
      );
    });

    lines.push(`${c.gray("│")} ${" ".repeat(inner)} ${c.gray("│")}`);
    lines.push(c.gray("╰" + "─".repeat(width - 2) + "╯"));

    const def = SETTING_DEFS[this.settingsIndex]!;
    lines.push(
      ...wordWrap(def.description, width - 2).map((line) => "  " + line),
    );
    lines.push(
      c.gray(
        truncate(
          `  ↑↓ select · ←→ change · r reset · esc close · saved to ${this.options.settingsPath}`,
          width,
        ),
      ),
    );
    return lines;
  }

  private onSettingsKey(str: string | undefined, key: Key): void {
    const count = SETTING_DEFS.length;
    const def = SETTING_DEFS[this.settingsIndex]!;
    let next: UserSettings | undefined;

    switch (key.name) {
      case "up":
        this.settingsIndex = (this.settingsIndex - 1 + count) % count;
        break;
      case "down":
      case "tab":
        this.settingsIndex = (this.settingsIndex + 1) % count;
        break;
      case "left":
        next = adjustSetting(this.settings, def.key, -1);
        break;
      case "right":
      case "return":
      case "enter":
      case "space":
        next = adjustSetting(this.settings, def.key, 1);
        break;
      case "escape":
      case "q":
        this.closeSettings();
        return;
      case "r":
        next = {
          ...this.settings,
          [def.key]: DEFAULT_SETTINGS[def.key],
        } as UserSettings;
        break;
      default:
        if (str === " ") next = adjustSetting(this.settings, def.key, 1);
        else return;
    }

    if (next) this.applySettings(next);
    this.refresh();
  }

  /** Use new settings now and save them to disk. */
  private applySettings(next: UserSettings): void {
    const themeChanged = next.theme !== this.settings.theme;
    this.settings = next;
    this.settingsChanged = true;
    if (themeChanged) setTheme(next.theme);
    try {
      saveSettings(next, this.options.settingsPath);
    } catch (err) {
      this.print(
        c.red(
          `  Could not save settings: ${err instanceof Error ? err.message : String(err)}\n`,
        ),
      );
    }
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsChanged = false;
    this.showShortcuts = false;
    this.refresh();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.print(
      this.settingsChanged
        ? c.green(`  Settings saved to ${this.options.settingsPath}.\n`)
        : c.gray("  Settings unchanged.\n"),
    );
  }

  /** "/settings <name> <value>": change one setting without opening the panel. */
  private setFromCommand(name: string, value: string | undefined): void {
    const wanted = name.toLowerCase().replace(/[^a-z]/g, "");
    const def = SETTING_DEFS.find(
      (d) =>
        d.key.toLowerCase() === wanted ||
        d.label.toLowerCase().replace(/[^a-z]/g, "") === wanted,
    );
    if (!def || value === undefined) {
      this.print(
        c.red(
          `  Usage: /settings <name> <value>. Names: ${SETTING_DEFS.map((d) => d.key).join(", ")}\n`,
        ),
      );
      return;
    }
    const next = normalizeSettings({ [def.key]: value }, this.settings);
    if (
      next[def.key] === this.settings[def.key] &&
      String(this.settings[def.key]) !== value
    ) {
      this.print(
        c.red(`  "${value}" is not a valid value for ${def.label}.\n`),
      );
      return;
    }
    this.applySettings(next);
    this.print(c.green(`  ${def.label} set to ${formatSetting(next, def)}.\n`));
  }

  private suggestions(): SlashCommand[] {
    return this.busy ? [] : matchCommands(this.editor.text);
  }

  private printBanner(): void {
    const width = Math.min(this.width, 64);
    const inner = width - 4;
    const row = (content: string) =>
      `${c.gray("│")} ${padEnd(content, inner)} ${c.gray("│")}`;
    const label = (name: string) => c.gray(name.padEnd(7));
    const model = this.bundle?.model.config;

    this.print(
      [
        c.gray("╭" + "─".repeat(width - 2) + "╮"),
        row(`${c.accent("✦")} ${c.bold("Light Compact AI")}`),
        row(""),
        row(
          `  ${label("model")}${truncateStart(this.options.modelPath, inner - 9)}`,
        ),
        row(
          `  ${label("size")}${
            model
              ? truncate(
                  `vocab ${model.vocabSize} · ${model.numLayers} layers · d=${model.dModel}`,
                  inner - 9,
                )
              : "not trained yet"
          }`,
        ),
        row(`  ${label("cwd")}${truncateStart(process.cwd(), inner - 9)}`),
        c.gray("╰" + "─".repeat(width - 2) + "╯"),
        "",
        c.gray(" Tips:"),
        c.gray("  1. Start a sentence and the model continues it"),
        c.gray(
          `  2. Edit ${this.options.config.training.corpus}, then /train to teach it`,
        ),
        c.gray("  3. /help for commands, ? for shortcuts"),
        "",
      ].join("\n"),
    );
  }

  /** Format reply text with a bullet and wrapped, indented lines. */
  private formatReply(text: string, bullet = c.accent("●")): string[] {
    return wordWrap(text, this.width - 2).map((line, i) =>
      i === 0 ? `${bullet} ${line}` : `  ${line}`,
    );
  }

  // ---------------------------------------------------------------- input

  private onKey(str: string | undefined, key: Key): void {
    if (this.settingsOpen && !(key.ctrl && key.name === "d")) {
      if (key.ctrl && key.name === "c") this.closeSettings();
      else this.onSettingsKey(str, key);
      return;
    }

    // Ctrl+C: interrupt, clear input, or (pressed twice) exit.
    if (key.ctrl && key.name === "c") {
      if (this.busy) {
        this.aborted = true;
        return;
      }
      if (this.editor.text) {
        this.editor.clear();
        this.refresh();
        return;
      }
      if (Date.now() - this.ctrlCArmedAt < CTRL_C_WINDOW_MS) {
        this.exit();
        return;
      }
      this.ctrlCArmedAt = Date.now();
      this.refresh();
      setTimeout(() => this.refresh(), CTRL_C_WINDOW_MS + 50);
      return;
    }

    if (key.ctrl && key.name === "d" && !this.editor.text) {
      this.exit();
      return;
    }

    if (this.busy) {
      if (key.name === "escape") this.aborted = true;
      return;
    }

    const suggestions = this.suggestions();
    const selected =
      suggestions[Math.min(this.suggestionIndex, suggestions.length - 1)];

    if (key.ctrl) {
      switch (key.name) {
        case "a":
          this.editor.home();
          break;
        case "e":
          this.editor.end();
          break;
        case "u":
          this.editor.deleteToStart();
          break;
        case "w":
          this.editor.deleteWordBack();
          break;
        case "l":
          this.out.write(cursor.clearScreen);
          this.drawn = false;
          this.renderLive();
          return;
        default:
          return;
      }
      this.refresh();
      return;
    }

    switch (key.name) {
      case "return":
      case "enter":
        if (selected) {
          if (selected.args) {
            // Commands with arguments are completed, not run, so the user can type them.
            this.editor.setText(`/${selected.name} `);
            this.refresh();
            return;
          }
          this.editor.setText(`/${selected.name}`);
        }
        void this.submit();
        return;
      case "tab":
        if (selected)
          this.editor.setText(`/${selected.name}${selected.args ? " " : ""}`);
        break;
      case "up":
        if (suggestions.length)
          this.suggestionIndex =
            (this.suggestionIndex - 1 + suggestions.length) %
            suggestions.length;
        else this.editor.historyPrev();
        break;
      case "down":
        if (suggestions.length)
          this.suggestionIndex =
            (this.suggestionIndex + 1) % suggestions.length;
        else this.editor.historyNext();
        break;
      case "left":
        this.editor.left();
        break;
      case "right":
        this.editor.right();
        break;
      case "home":
        this.editor.home();
        break;
      case "end":
        this.editor.end();
        break;
      case "backspace":
        this.editor.backspace();
        this.suggestionIndex = 0;
        break;
      case "delete":
        this.editor.deleteForward();
        break;
      case "escape":
        this.showShortcuts = false;
        this.editor.clear();
        break;
      default: {
        if (!str || key.meta) return;
        const printable = str.replace(/[\x00-\x1f\x7f]/g, "");
        if (!printable) return;
        if (printable === "?" && !this.editor.text) {
          this.showShortcuts = !this.showShortcuts;
          break;
        }
        this.editor.insert(printable);
        this.suggestionIndex = 0;
        this.showShortcuts = false;
      }
    }
    this.refresh();
  }

  private async submit(): Promise<void> {
    const text = this.editor.submit().trim();
    this.suggestionIndex = 0;
    if (!text) {
      this.refresh();
      return;
    }

    this.print(
      wordWrap(text, this.width - 2)
        .map((line, i) => c.gray(i === 0 ? `> ${line}` : `  ${line}`))
        .join("\n") + "\n",
    );

    if (parseCommand(text)) {
      await this.runCommand(text);
    } else {
      await this.generate(text);
    }
  }

  // ---------------------------------------------------------------- actions

  /** Run a task with the spinner shown; errors are printed instead of crashing. */
  private async runBusy(
    label: string,
    task: () => Promise<void>,
  ): Promise<void> {
    this.busy = true;
    this.aborted = false;
    this.spinnerText = label;
    this.busySince = Date.now();
    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame++;
      this.refresh();
    }, SPINNER_INTERVAL_MS);
    this.refresh();
    try {
      await task();
    } catch (err) {
      this.pendingLines = [];
      this.print(
        c.red(`  Error: ${err instanceof Error ? err.message : String(err)}\n`),
      );
    } finally {
      clearInterval(this.spinnerTimer);
      this.busy = false;
      this.pendingLines = [];
      this.refresh();
    }
  }

  private async generate(prompt: string): Promise<void> {
    const bundle = this.bundle;
    if (!bundle) {
      this.print(c.red("  No model loaded. Type /train first.\n"));
      return;
    }

    await this.runBusy("Thinking…", async () => {
      const startedAt = Date.now();
      let text = "";
      let tokens = 0;
      const sampling = toSamplingOptions(this.settings);
      for (const partial of streamReply(
        bundle,
        prompt,
        this.maxTokens,
        sampling,
      )) {
        if (this.aborted) break;
        text = partial;
        tokens++;
        this.pendingLines = this.formatReply(text);
        this.refresh();
        // Always yield so keypresses (esc) are seen, even at "instant" speed.
        await sleep(this.settings.streamDelayMs);
      }
      this.pendingLines = [];

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const note = this.aborted ? " · interrupted" : "";
      this.print(
        [
          ...(text
            ? this.formatReply(text)
            : [`${c.accent("●")} ${c.dim("(no output)")}`]),
          ...(this.settings.showStats || this.aborted
            ? [c.gray(`  ⎿  ${tokens} tokens · ${seconds}s${note}`)]
            : []),
          "",
        ].join("\n"),
      );
    });
  }

  private async runCommand(input: string): Promise<void> {
    const command = parseCommand(input)!;
    switch (command.name) {
      case "help":
        return this.showHelp();
      case "clear":
        this.out.write(cursor.clearScreen);
        this.drawn = false;
        this.printBanner();
        return;
      case "settings":
      case "config":
        if (command.args.length > 0)
          return this.setFromCommand(command.args[0]!, command.args[1]);
        return this.openSettings();
      case "model":
        return this.showModel();
      case "tokens":
        return this.setTokens(command.args[0]);
      case "train":
        return this.train();
      case "history":
        return this.showHistory();
      case "exit":
      case "quit":
        return this.exit();
      default:
        this.print(
          c.red(
            `  Unknown command /${command.name}. Type /help for the list.\n`,
          ),
        );
    }
  }

  private showHelp(): void {
    const lines = [c.bold("  Commands"), ""];
    for (const command of COMMANDS) {
      const label = padEnd(
        `/${command.name}${command.args ? " " + command.args : ""}`,
        14,
      );
      lines.push(`    ${c.accent(label)} ${command.description}`);
    }
    lines.push("", c.bold("  Shortcuts"), "");
    for (const [keys, action] of SHORTCUTS) {
      lines.push(`    ${padEnd(keys, 14)} ${c.gray(action)}`);
    }
    this.print(lines.join("\n") + "\n");
  }

  private showModel(): void {
    const { config, modelPath } = this.options;
    const model = this.bundle?.model.config;
    const row = (name: string, value: string | number) =>
      `    ${c.gray(name.padEnd(14))} ${value}`;
    this.print(
      [
        c.bold("  Model"),
        "",
        row("file", modelPath),
        row("loaded", this.bundle ? c.green("yes") : c.yellow("no")),
        ...(model
          ? [
              row("vocab", model.vocabSize),
              row("layers", model.numLayers),
              row("dModel", model.dModel),
              row("heads", model.numHeads),
              row("feed-forward", model.dFeedForward),
              row("context", `${model.maxSequenceLength} tokens`),
            ]
          : []),
        row("max reply", `${this.maxTokens} tokens`),
        "",
        c.bold("  Training"),
        "",
        row("corpus", config.training.corpus),
        row("epochs", config.training.epochs),
        row("learning rate", config.training.learningRate),
        "",
      ].join("\n"),
    );
  }

  private setTokens(arg: string | undefined): void {
    const value = Number(arg);
    if (!Number.isInteger(value) || value < 1 || value > MAX_REPLY_TOKENS) {
      this.print(
        c.red(
          `  Usage: /tokens <1-${MAX_REPLY_TOKENS}>  (currently ${this.maxTokens})\n`,
        ),
      );
      return;
    }
    this.applySettings({ ...this.settings, maxTokens: value });
    this.print(c.green(`  Max reply length set to ${value} tokens.\n`));
  }

  private showHistory(): void {
    const history = this.editor.history;
    if (history.length === 0) {
      this.print(c.gray("  No prompts yet.\n"));
      return;
    }
    this.print(
      history
        .map((entry, i) => `  ${c.gray(String(i + 1).padStart(3))}  ${entry}`)
        .join("\n") + "\n",
    );
  }

  private async train(): Promise<void> {
    const { config, modelPath } = this.options;
    let lines: string[];
    try {
      lines = readCorpus(readFileSync(config.training.corpus, "utf8"));
    } catch (err) {
      this.print(
        c.red(
          `  Could not read ${config.training.corpus}: ${err instanceof Error ? err.message : String(err)}\n`,
        ),
      );
      return;
    }

    await this.runBusy("Preparing…", async () => {
      const startedAt = Date.now();
      const session = prepareTraining(lines, {
        ...config.model,
        learningRate: config.training.learningRate,
        epochs: config.training.epochs,
      });

      let loss = Number.NaN;
      for (let epoch = 0; epoch < session.epochs; epoch++) {
        if (this.aborted) {
          this.print(
            c.yellow(
              "  Training interrupted; the previous model is still loaded.\n",
            ),
          );
          return;
        }
        loss = session.runEpoch();
        this.spinnerText = `Training · epoch ${epoch + 1}/${session.epochs} · loss ${loss.toFixed(4)}`;
        await sleep(0); // let the spinner redraw between epochs
      }

      saveBundle(session.bundle, modelPath);
      this.bundle = session.bundle;
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.print(
        [
          ...this.formatReply(
            `Trained on ${lines.length} lines (${session.sampleCount} samples), final loss ${loss.toFixed(4)}. Saved to ${modelPath}.`,
            c.green("●"),
          ),
          c.gray(
            `  ⎿  ${session.epochs} epochs · ${seconds}s · vocab ${session.bundle.tokenizer.vocabSize}`,
          ),
          "",
        ].join("\n"),
      );
    });
  }

  private exit(): void {
    clearInterval(this.spinnerTimer);
    this.clearLive();
    this.out.write(cursor.show + c.gray("Goodbye.") + "\n");
    process.stdin.setRawMode(false);
    process.exit(0);
  }
}
