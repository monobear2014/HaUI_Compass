"use strict";
// Offline-only evaluation of the SAME production ranker/chunker, no provider or private data.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { chunkPages } = require("../../apps/web/src/lib/document-chunking.cjs");
const {
  rankDocumentChunks,
} = require("../../apps/web/src/lib/document-ranking.cjs");
const root = path.resolve(__dirname, "../..");
const datasetPath = path.join(root, "evals/datasets/retrieval-vi-v2.json");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function loadDataset() {
  const data = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const ocr = JSON.parse(
    fs.readFileSync(path.join(root, data.ocr_source), "utf8"),
  );
  const books = new Map(data.books.map((book) => [book.id, book.pages]));
  const cells = (row) => "| " + row.join(" | ") + " |";
  books.set(
    "ocr",
    ocr.cases.map((c) => ({
      id: c.id,
      text: [
        ...c.paragraphs,
        ...c.tables.map((t) =>
          [
            cells(t.headers),
            cells(t.headers.map(() => "---")),
            ...t.rows.map(cells),
          ].join("\n"),
        ),
        ...c.formulas.map((f) => "$$\n" + f + "\n$$"),
      ].join("\n\n"),
    })),
  );
  const cases = [
    ...ocr.cases.map((c, i) => ({
      id: `VI-R-${String(i + 1).padStart(3, "0")}`,
      split: c.split,
      category: "ocr_" + c.category,
      book: "ocr",
      question: c.qa[0].question,
      expected_pages: [c.id],
    })),
    ...data.cases,
  ];
  if (new Set(cases.map((c) => c.id)).size !== cases.length)
    throw Error("Duplicate case");
  for (const c of cases) {
    if (
      !books.has(c.book) ||
      !["dev", "test"].includes(c.split) ||
      c.expected_pages.some((id) => !books.get(c.book).some((p) => p.id === id))
    )
      throw Error("Invalid retrieval label");
  }
  return {
    data,
    books,
    cases,
    ocrHash: hash(fs.readFileSync(path.join(root, data.ocr_source))),
  };
}

function metrics(rows) {
  const positive = rows.filter((r) => r.expected_pages.length);
  const negative = rows.filter((r) => !r.expected_pages.length);
  const mean = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const recall = (r, k) =>
    r.expected_pages.filter((p) =>
      r.retrieved.slice(0, k).some((x) => x.page === p),
    ).length / r.expected_pages.length;
  return {
    cases: rows.length,
    answerable: positive.length,
    negative: negative.length,
    hit_at_1: mean(positive.map((r) => Number(recall(r, 1) > 0))),
    hit_at_3: mean(positive.map((r) => Number(recall(r, 3) > 0))),
    source_recall_at_5: mean(positive.map((r) => recall(r, 5))),
    mrr: mean(
      positive.map((r) => {
        const i = r.retrieved.findIndex((x) =>
          r.expected_pages.includes(x.page),
        );
        return i < 0 ? 0 : 1 / (i + 1);
      }),
    ),
    negative_empty_rate: mean(negative.map((r) => Number(!r.retrieved.length))),
    passed: rows.filter((r) => r.passed).length,
  };
}

function run() {
  const { data, books, cases, ocrHash } = loadDataset();
  const indexed = new Map(
    [...books].map(([id, pages]) => [
      id,
      chunkPages(pages.map((p, i) => ({ page_number: i + 1, text: p.text }))),
    ]),
  );
  const rows = cases.map((c) => {
    const query =
      c.category === "unicode_nfd" ? c.question.normalize("NFD") : c.question;
    const started = performance.now();
    const ranked = rankDocumentChunks(query, indexed.get(c.book));
    const latency_ms = performance.now() - started;
    const retrieved = ranked.map((r) => ({
      page: books.get(c.book)[r.chunk.page_number - 1].id,
      page_number: r.chunk.page_number,
      chunk_index: r.chunk.chunk_index,
      score: r.score,
    }));
    const passed = c.expected_pages.length
      ? c.expected_pages.every((p) =>
          retrieved.slice(0, 3).some((r) => r.page === p),
        )
      : !retrieved.length;
    return { ...c, retrieved, latency_ms, passed };
  });
  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {}
  return {
    version: data.version,
    mode: "retrieval-only",
    model_calls: 0,
    annotation_origin: data.annotation_origin,
    timestamp: new Date().toISOString(),
    git_commit: commit,
    dataset_sha256: hash(fs.readFileSync(datasetPath)),
    ocr_labels_sha256: ocrHash,
    ranker_sha256: hash(
      fs.readFileSync(path.join(root, "apps/web/src/lib/document-ranking.cjs")),
    ),
    chunker_sha256: hash(
      fs.readFileSync(
        path.join(root, "apps/web/src/lib/document-chunking.cjs"),
      ),
    ),
    evaluator_sha256: hash(fs.readFileSync(__filename)),
    metrics: metrics(rows),
    splits: Object.fromEntries(
      ["dev", "test"].map((s) => [
        s,
        metrics(rows.filter((r) => r.split === s)),
      ]),
    ),
    categories: Object.fromEntries(
      [...new Set(rows.map((r) => r.category))].map((s) => [
        s,
        metrics(rows.filter((r) => r.category === s)),
      ]),
    ),
    cases: rows,
  };
}

if (require.main === module) {
  const output = process.argv[2];
  if (!output) throw Error("Pass a new report.json output path");
  const report = run();
  if (process.argv[3]) {
    const before = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    for (const key of [
      "version",
      "dataset_sha256",
      "ocr_labels_sha256",
      "chunker_sha256",
    ])
      if (before[key] !== report[key])
        throw Error("Comparison inputs differ: " + key);
    if (
      before.cases.length !== report.cases.length ||
      before.cases.some(
        (c, i) =>
          c.id !== report.cases[i].id ||
          c.question !== report.cases[i].question ||
          JSON.stringify(c.expected_pages) !==
            JSON.stringify(report.cases[i].expected_pages),
      )
    )
      throw Error("Comparison labels differ");
    report.comparison = {
      baseline_ranker_sha256: before.ranker_sha256,
      before: before.metrics,
      after: report.metrics,
      delta: Object.fromEntries(
        [
          "hit_at_1",
          "hit_at_3",
          "source_recall_at_5",
          "mrr",
          "negative_empty_rate",
        ].map((k) => [k, report.metrics[k] - before.metrics[k]]),
      ),
      fixed: report.cases
        .filter((c, i) => c.passed && !before.cases[i].passed)
        .map((c) => c.id),
      regressions: report.cases
        .filter((c, i) => !c.passed && before.cases[i].passed)
        .map((c) => c.id),
    };
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      version: report.version,
      metrics: report.metrics,
      splits: report.splits,
      failed: report.cases.filter((c) => !c.passed).map((c) => c.id),
    }),
  );
}
module.exports = { loadDataset, run, metrics };
