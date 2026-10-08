#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const {
  chunkText,
  chunkPages,
} = require("../../apps/web/src/lib/document-chunking.cjs");
const { spawnSync } = require("node:child_process");
const {
  rankDocumentChunks,
  resolveRetrievalQuery,
} = require("../../apps/web/src/lib/document-ranking.cjs");

const root = path.resolve(__dirname, "../..");
const datasetPath = path.resolve(
  process.argv[2] || path.join(root, "evals/datasets/compass-rag-v1.json"),
);
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
if (process.argv[3])
  dataset.cases = dataset.cases.filter(
    (row) => row.category === process.argv[3],
  );
const keys = new Set(dataset.cases.map((row) => row.document));
const documents = new Map(
  dataset.documents
    .filter((document) => keys.has(document.key))
    .map((document) => {
      const bytes = fs.readFileSync(path.join(root, document.path));
      let chunks;
      if (document.path.endsWith(".pdf")) {
        const extracted = spawnSync(
          process.env.COMPASS_EVAL_PYTHON || "python3",
          ["-m", "haui_compass.infrastructure.retrieval.pdf"],
          { input: bytes, maxBuffer: 8 * 1024 * 1024 },
        );
        if (extracted.status !== 0)
          throw new Error("PDF extraction worker failed");
        const result = JSON.parse(extracted.stdout.toString());
        if (result.error) throw new Error(result.error);
        chunks = chunkPages(result.pages);
      } else
        chunks = chunkText(
          bytes.toString("utf8"),
          /\.(md|markdown)$/i.test(document.path),
        );
      const rows = chunks.map((chunk) => ({
        ...chunk,
        chunk_id: `${document.key}:chunk:${chunk.chunk_index}`,
        document_id: document.key,
        filename: path.basename(document.path),
      }));
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
    const ranked = rankDocumentChunks(
      resolved,
      documents.get(testCase.document) || [],
      6,
    );
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
        page_number: item.chunk.page_number ?? null,
        score: item.score,
        source_ids: sourceIds(item.chunk.content),
      })),
    });
    history.push(
      { role: "user", content: turn.question },
      {
        role: "assistant",
        content: "Deterministic offline evaluation response.",
      },
    );
  }
}
process.stdout.write(JSON.stringify({ results }));
