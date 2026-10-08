"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { tokens, rankDocumentChunks, resolveRetrievalQuery } = require("../../apps/web/src/lib/document-ranking.cjs");

const rows = [
  { chunk_index: 0, heading: "Git", content: "Review instructions before merge and deploy. Upload logs after deployment." },
  { chunk_index: 1, heading: "Softmax", content: "Softmax converts logits into probabilities for multiclass classification." },
  { chunk_index: 2, heading: "Validation", content: "Tập xác thực giúp chọn siêu tham số; test dùng đánh giá cuối." },
];

test("slash, hyphen and punctuation split identically; case and Unicode normalize", () => {
  for (const query of ["merge/deploy", "MERGE-DEPLOY", "merge,deploy", "merge deploy"]) {
    assert.deepEqual(tokens(query), ["merge", "deploy"]);
    assert.equal(rankDocumentChunks(query, rows)[0].chunk.chunk_index, 0);
  }
  assert.deepEqual(tokens("xác thực".normalize("NFD")), tokens("XÁC THỰC"));
  assert.equal(rankDocumentChunks("Đánh giá tập xác thực", rows)[0].chunk.chunk_index, 2);
});

test("generic query format and plural technical forms remain comparable", () => {
  for (const query of ["Checklist trước merge/deploy?", "instruction/upload", "instructions-uploads"]) {
    assert.equal(rankDocumentChunks(query, rows)[0].chunk.chunk_index, 0);
  }
  assert.deepEqual(tokens("class analysis physics"), ["class", "analysis", "physics"]);
  assert.deepEqual(tokens("logits"), tokens("logit"));
});

test("absent named anchors still refuse and history does not contaminate unrelated queries", () => {
  assert.deepEqual(rankDocumentChunks("Transformer hoạt động thế nào?", rows), []);
  assert.deepEqual(rankDocumentChunks("Kubernetes deployment cấu hình gì?", rows), []);
  const history = [{ role: "user", content: "Softmax là gì?" }, { role: "assistant", content: "Xác suất." }];
  assert.equal(resolveRetrievalQuery("Nó có hạn chế gì?", history), "Nó có hạn chế gì? Softmax là gì?");
  assert.equal(resolveRetrievalQuery("Kubernetes là gì?", history), "Kubernetes là gì?");
});
