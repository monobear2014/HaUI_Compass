#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { chunkText } = require("../../apps/web/src/lib/document-chunking.cjs");
const {
  rankDocumentChunks,
  resolveRetrievalQuery,
} = require("../../apps/web/src/lib/document-ranking.cjs");

const root = path.resolve(__dirname, "../..");
const datasetPath = path.resolve(process.argv[2] || path.join(root, "evals/datasets/compass-rag-v1.json"));
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
const documents = new Map(
  dataset.documents.map((document) => {
    const text = fs.readFileSync(path.join(root, document.path), "utf8");
    const rows = chunkText(text, /\.(md|markdown)$/i.test(document.path)).map(
      (chunk) => ({
        ...chunk,
        chunk_id: `${document.key}:chunk:${chunk.chunk_index}`,
        document_id: document.key,
        filename: path.basename(document.path),
      }),
    );
    return [document.key, rows];
  }),
);

function sourceIds(content) {
  return [...content.matchAll(/\[SOURCE:([^\]]+)\]/g)].map((match) => match[1]);
}

const results = [];
for (const testCase of dataset.cases) {
  const history = [];
  const turns = testCase.turns || [testCase];
  for (const [turnIndex, turn] of turns.entries()) {
    const resolved = resolveRetrievalQuery(turn.question, history);
    const started = performance.now();
    const ranked = rankDocumentChunks(resolved, documents.get(testCase.document) || [], 6);
    const retrievalMs = performance.now() - started;
    results.push({
      case_id: testCase.id,
      turn_index: turnIndex,
      category: testCase.category,
      document: testCase.document,
      question: turn.question,
      resolved_query: resolved,
      answerable: turn.answerable,
      expected_sources: turn.expected_sources,
      retrieval_ms: retrievalMs,
      retrieved: ranked.map((item, index) => ({
        rank: index + 1,
        chunk_id: item.chunk.chunk_id,
        document_id: item.chunk.document_id,
        heading: item.chunk.heading,
        score: item.score,
        source_ids: sourceIds(item.chunk.content),
      })),
    });
    history.push(
      { role: "user", content: turn.question },
      { role: "assistant", content: "Deterministic offline evaluation response." },
    );
  }
}
process.stdout.write(JSON.stringify({ results }));
