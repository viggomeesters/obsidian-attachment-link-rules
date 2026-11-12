import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";

import {
  DEFAULT_SETTINGS,
  actionForFileName,
  applyDropAction,
  formatDroppedLinks,
  normalizeExtensionList,
  normalizeSettings,
  rewriteInsertedAttachmentSyntax,
  matchesDroppedFileName,
} from "../dist/core.mjs";

test("PDF files default to non-embedded links", () => {
  assert.equal(actionForFileName("report.PDF", DEFAULT_SETTINGS), "link");
  assert.equal(applyDropAction("![[report.pdf]]", "link"), "[[report.pdf]]");
});

test("common image files default to embeds", () => {
  assert.equal(actionForFileName("diagram.webp", DEFAULT_SETTINGS), "embed");
  assert.equal(applyDropAction("[[diagram.webp]]", "embed"), "![[diagram.webp]]");
});

test("unknown extensions keep native default syntax", () => {
  assert.equal(actionForFileName("dataset.parquet", DEFAULT_SETTINGS), "default");
  assert.equal(applyDropAction("![[dataset.parquet]]", "default"), "![[dataset.parquet]]");
});

test("extension parsing is case-insensitive and accepts dots commas and whitespace", () => {
  assert.deepEqual(normalizeExtensionList(".PDF, docx  XLSX\npptx"), ["pdf", "docx", "xlsx", "pptx"]);
});

test("link rules win when an extension appears in both configured lists", () => {
  const settings = normalizeSettings({
    linkExtensions: "pdf png",
    embedExtensions: "png jpg",
  });

  assert.equal(actionForFileName("image.png", settings), "link");
  assert.equal(actionForFileName("photo.jpg", settings), "embed");
});

test("files without an extension use native default syntax", () => {
  assert.equal(actionForFileName("LICENSE", DEFAULT_SETTINGS), "default");
});

test("multiple dropped attachments are inserted on separate lines", () => {
  assert.equal(
    formatDroppedLinks(["[[report.pdf]]", "![[diagram.png]]"]),
    "[[report.pdf]]\n![[diagram.png]]",
  );
});

test("only the newly inserted wikilink syntax is rewritten", () => {
  const before = "Existing ![[old.pdf]]\nCursor here";
  const after = "Existing ![[old.pdf]]\n![[new.pdf]]Cursor here";

  assert.deepEqual(rewriteInsertedAttachmentSyntax(before, after, DEFAULT_SETTINGS), {
    changed: true,
    text: "Existing ![[old.pdf]]\n[[new.pdf]]Cursor here",
  });
});

test("native Markdown links are rewritten while preserving label and destination", () => {
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax("", "[report](files/report.pdf)\n[photo](images/photo.png)", DEFAULT_SETTINGS),
    {
      changed: true,
      text: "[report](files/report.pdf)\n![photo](images/photo.png)",
    },
  );
});

test("unconfigured inserted attachments remain untouched", () => {
  assert.deepEqual(rewriteInsertedAttachmentSyntax("Before", "Before![[data.parquet]]", DEFAULT_SETTINGS), {
    changed: false,
    text: "Before![[data.parquet]]",
  });
});

test("an attachment inserted before another wikilink does not confuse the diff boundary", () => {
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax(
      "[[report.pdf]]# Note\n",
      "[[diagram.png]][[report.pdf]]# Note\n",
      DEFAULT_SETTINGS,
    ),
    {
      changed: true,
      text: "![[diagram.png]][[report.pdf]]# Note\n",
    },
  );
});

test("settings tab exposes searchable definitions without calling deprecated display", async () => {
  const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

  assert.match(source, /getSettingDefinitions\(\): SettingDefinitionItem\[\]/);
  assert.doesNotMatch(source, /this\.display\(\)/);
});

test("concurrent edits preserve a pre-existing attachment while formatting a new drop", () => {
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax("x ![[old.pdf]] end", "typed x ![[old.pdf]] end ![[new.pdf]]", DEFAULT_SETTINGS),
    { changed: true, text: "typed x ![[old.pdf]] end [[new.pdf]]" },
  );
});

test("ambiguous duplicate links in disjoint edits never rewrite an existing attachment", () => {
  const after = "typed x ![[old.pdf]] end ![[old.pdf]]";
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax("x ![[old.pdf]] end", after, DEFAULT_SETTINGS),
    { changed: false, text: after },
  );
});

test("drop attribution accepts native destinations and numbered collisions only", () => {
  for (const target of ["report.pdf", "folder/report.pdf", "folder/report%201.pdf", "report (2).pdf"]) {
    assert.equal(matchesDroppedFileName(target, ["report.pdf"]), true, target);
  }
  for (const target of ["typed.pdf", "report-old.pdf", "https://example.invalid/report.pdf"]) {
    assert.equal(matchesDroppedFileName(target, ["report.pdf"]), false, target);
  }
  assert.equal(matchesDroppedFileName("a[1] (2).pdf", ["a[1].pdf"]), true);
});

test("identical-token prepend/append ambiguity preserves both occurrences", () => {
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax("![[old.pdf]]", "![[old.pdf]]![[old.pdf]]", DEFAULT_SETTINGS),
    { changed: false, text: "![[old.pdf]]![[old.pdf]]" },
  );
});

test("an unambiguous duplicate after a distinct suffix can still be formatted", () => {
  assert.deepEqual(
    rewriteInsertedAttachmentSyntax("![[old.pdf]] tail", "![[old.pdf]] tail![[old.pdf]]", DEFAULT_SETTINGS),
    { changed: true, text: "![[old.pdf]] tail[[old.pdf]]" },
  );
});
