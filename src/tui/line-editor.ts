/** Single-line text editor state with cursor movement and prompt history. */
export class LineEditor {
  text = "";
  cursor = 0;
  readonly history: string[] = [];

  /** -1 means "not browsing history". */
  private historyIndex = -1;
  /** What the user was typing before browsing history. */
  private draft = "";

  insert(value: string): void {
    this.text =
      this.text.slice(0, this.cursor) + value + this.text.slice(this.cursor);
    this.cursor += value.length;
  }

  backspace(): void {
    if (this.cursor === 0) return;
    this.text =
      this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
    this.cursor--;
  }

  deleteForward(): void {
    if (this.cursor >= this.text.length) return;
    this.text =
      this.text.slice(0, this.cursor) + this.text.slice(this.cursor + 1);
  }

  /** Delete the word before the cursor (Ctrl+W). */
  deleteWordBack(): void {
    const before = this.text.slice(0, this.cursor).replace(/\S*\s*$/, "");
    this.text = before + this.text.slice(this.cursor);
    this.cursor = before.length;
  }

  /** Delete everything before the cursor (Ctrl+U). */
  deleteToStart(): void {
    this.text = this.text.slice(this.cursor);
    this.cursor = 0;
  }

  left(): void {
    this.cursor = Math.max(0, this.cursor - 1);
  }

  right(): void {
    this.cursor = Math.min(this.text.length, this.cursor + 1);
  }

  home(): void {
    this.cursor = 0;
  }

  end(): void {
    this.cursor = this.text.length;
  }

  /** Replace the text and put the cursor at the end. */
  setText(value: string): void {
    this.text = value;
    this.cursor = value.length;
  }

  clear(): void {
    this.setText("");
    this.historyIndex = -1;
  }

  /** Show the previous prompt from history (Up arrow). */
  historyPrev(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.draft = this.text;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.setText(this.history[this.historyIndex]!);
  }

  /** Show the next prompt from history, or return to the draft (Down arrow). */
  historyNext(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.setText(this.history[this.historyIndex]!);
    } else {
      this.historyIndex = -1;
      this.setText(this.draft);
    }
  }

  /** Return the current text, record it in history and reset the editor. */
  submit(): string {
    const value = this.text;
    if (value.trim() && this.history.at(-1) !== value) {
      this.history.push(value);
    }
    this.clear();
    return value;
  }
}
