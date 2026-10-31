import { test } from "node:test";
import assert from "node:assert/strict";
import { LineEditor } from "../tui/line-editor.js";
import { matchCommands, parseCommand } from "../tui/commands.js";
import {
  wordWrap,
  visibleLength,
  truncate,
  truncateStart,
} from "../tui/ansi.js";

test("line editor inserts and deletes at the cursor", () => {
  const editor = new LineEditor();
  editor.insert("helo");
  editor.left();
  editor.insert("l");
  assert.equal(editor.text, "hello");
  editor.end();
  editor.insert(" world ");
  editor.deleteWordBack();
  assert.equal(editor.text, "hello ");
  editor.home();
  editor.deleteForward();
  assert.equal(editor.text, "ello ");
});

test("line editor history restores the draft", () => {
  const editor = new LineEditor();
  editor.insert("first");
  editor.submit();
  editor.insert("second");
  editor.submit();
  editor.insert("draft");
  editor.historyPrev();
  assert.equal(editor.text, "second");
  editor.historyPrev();
  assert.equal(editor.text, "first");
  editor.historyNext();
  editor.historyNext();
  assert.equal(editor.text, "draft");
});

test("slash commands match by prefix and parse arguments", () => {
  assert.deepEqual(
    matchCommands("/t").map((c) => c.name),
    ["tokens", "train"],
  );
  assert.deepEqual(matchCommands("hello"), []);
  assert.deepEqual(matchCommands("/tokens 5"), []);
  assert.deepEqual(parseCommand("/Tokens 12"), {
    name: "tokens",
    args: ["12"],
  });
  assert.equal(parseCommand("hi"), undefined);
});

test("text helpers wrap and truncate", () => {
  assert.deepEqual(wordWrap("the cat sat on the mat", 10), [
    "the cat",
    "sat on the",
    "mat",
  ]);
  assert.deepEqual(wordWrap("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  assert.equal(visibleLength("\x1b[31mred\x1b[39m"), 3);
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.equal(truncateStart("abcdef", 4), "…def");
});
