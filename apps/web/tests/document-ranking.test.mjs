import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rankDocumentChunks } = require("../src/lib/document-ranking.cjs");
const { chunkPages } = require("../src/lib/document-chunking.cjs");

const row = (content, chunk_index) => ({ content, chunk_index, heading: null });
test("unaccented and NFD Vietnamese preserve named-topic refusal", () => {
  const rows = [
    row("Bộ đệm nhớ trạng thái, bộ nhớ của máy tính.", 0),
    row("Bộ nhớ đệm lưu dữ liệu gần đây.", 1),
  ];
  for (const q of [
    "Bộ nhớ đệm là gì?",
    "Bo nho dem la gi?",
    "Bộ nhớ đệm là gì?".normalize("NFD"),
  ])
    assert.equal(rankDocumentChunks(q, rows)[0].chunk.chunk_index, 1);
  assert.deepEqual(
    rankDocumentChunks("Kubernetes cache hoạt động thế nào?", rows),
    [],
  );
});

test("short row labels and math subscripts never conflate different identifiers", () => {
  const rows = [
    row("| Mô hình | Recall |\n|---|---|\n| A | 0,5 |", 0),
    row("| Mô hình | Recall |\n|---|---|\n| B | 0,9 |", 1),
  ];
  assert.equal(
    rankDocumentChunks("Recall mô hình B?", rows)[0].chunk.chunk_index,
    1,
  );
  assert.equal(
    rankDocumentChunks("Recall mô hình b?", rows)[0].chunk.chunk_index,
    1,
  );
  assert.deepEqual(rankDocumentChunks("Recall mô hình D?", rows), []);
  const math = [
    row("Phần tử ma trận $$a_{21}=0.25$$", 0),
    row("Phần tử ma trận $$a_{12}=-0.05$$", 1),
  ];
  for (const q of ["a_{12} bằng bao nhiêu?", "a_12 là gì?"])
    assert.equal(rankDocumentChunks(q, math)[0].chunk.chunk_index, 1);
  assert.deepEqual(rankDocumentChunks("a_{99} là gì?", math), []);
  assert.deepEqual(
    rankDocumentChunks("Học phí năm 2027?", [
      row("Năm 2026 học phần có học bổng.", 0),
    ]),
    [],
  );
});

test("long-table continuation retrieves the row AND original header without modifying citations", () => {
  const header = "| Mô hình | Precision | Recall |\n| --- | --- | --- |\n";
  const text =
    header +
    Array.from(
      { length: 360 },
      (_, i) => `| R${String(i).padStart(3, "0")} | 0,40 | 0,50 |`,
    ).join("\n") +
    "\n| B | 0,79 | 0,88 |";
  const rows = chunkPages([{ page_number: 2, text }]);
  assert.ok(rows.length > 2);
  const before = JSON.stringify(rows);
  const ranked = rankDocumentChunks("Recall mô hình B?", rows);
  assert.match(ranked[0].chunk.content, /\| B \| 0,79 \| 0,88 \|/);
  assert.ok(ranked.some((r) => r.chunk.content.includes(header)));
  assert.ok(ranked.length <= 6);
  for (const r of ranked) {
    assert.equal(
      text.slice(r.chunk.start_offset, r.chunk.end_offset),
      r.chunk.content,
    );
    assert.equal(r.chunk.page_number, 2);
  }
  assert.equal(JSON.stringify(rows), before);
});

test("table headers never cross a page/document boundary or unrelated prose", () => {
  const first = {
    ...row("| SecretHeader | Recall |\n|---|---|\n| A | 0.1 |", 0),
    page_number: 1,
    document_id: "one",
  };
  const next = {
    ...row("| B | 0.9 |\n| C | 0.8 |\n| D | 0.7 |", 1),
    page_number: 2,
    document_id: "one",
  };
  // A row on another page must not become a fully anchored hit using the old header.
  assert.ok(
    !rankDocumentChunks("SecretHeader B?", [first, next]).some(
      (r) => r.chunk === next && r.anchored,
    ),
  );
  next.page_number = 1;
  next.document_id = "two";
  assert.ok(
    !rankDocumentChunks("SecretHeader B?", [first, next]).some(
      (r) => r.chunk === next && r.anchored,
    ),
  );
  next.document_id = "one";
  next.chunk_index = 2;
  const prose = {
    ...row("Unrelated ordinary paragraph, not a table.", 1),
    page_number: 1,
    document_id: "one",
  };
  assert.ok(
    !rankDocumentChunks("SecretHeader B?", [first, prose, next]).some(
      (r) => r.chunk === next && r.anchored,
    ),
  );
});

test("English A/I are not false named anchors and limits remain bounded", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    row("Softmax probability distribution.", i),
  );
  assert.ok(rankDocumentChunks("I use softmax", rows).length);
  assert.ok(
    rankDocumentChunks("A softmax probability distribution", rows).length,
  );
  for (const limit of [NaN, Infinity, 100, -1, 2.8])
    assert.ok(rankDocumentChunks("softmax", rows, limit).length <= 6);
});
