"use strict";

// Pure, deterministic ranking core shared by the production SQLite adapter and
// the offline evaluator. Keep persistence/authorization outside this module.
const stopWords = new Set(
  "a an and the of to is in what how tôi bạn mình hãy cho về này đó nó tài liệu trong những các một là gì được giải thích như thế nào có vì sao tại dùng phần nội dung biết giúp với và để của please explain document".split(
    " ",
  ),
);
// Query-format words are not names of subjects that must exist in the source.
// Keep unknown named technical concepts (e.g. Transformer) fail-closed.
stopWords.add("checklist");
// PDF extension exposed ordinary English question phrasing mistaken for named
// technical anchors. Normalize only these evidenced functional query words.
for (const word of ["affect", "direction", "defined", "often", "should"])
  stopWords.add(word);

function normalizedToken(token) {
  // Conservative ASCII plural normalization, used identically for query/evidence.
  // Do not touch short acronyms or words ending in ss/us/is/ics (class, analysis).
  return /^[a-z]{5,}s$/.test(token) && !/(ss|us|is|ics)$/.test(token)
    ? token.slice(0, -1)
    : token;
}

function tokens(text) {
  return [
    ...new Set(
      (
        text
          .normalize("NFC")
          .toLowerCase()
          .match(/[\p{L}\p{N}_]+/gu) ?? []
      )
        .map(normalizedToken)
        .filter((token) => token.length > 1 && !stopWords.has(token)),
    ),
  ];
}

// Search-only normalization: never alter stored text, offsets or citation IDs.
// Keep tokens() stable for existing callers. Accented exact matches receive an
// extra tie-break below; folding enables Vietnamese typed without diacritics.
function folded(token) {
  return token.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
}
const foldedStopWords = new Set([...stopWords].map(folded));
for (const word of ["bao", "nhieu", "bang", "ghi"]) foldedStopWords.add(word);

function searchSequence(text) {
  return (
    (
      text
        .normalize("NFC")
        // a_{12} and a_12 are formatting variants, NOT a_21 or a_1_2.
        .replace(/([A-Za-z])_\{(\d+)\}/g, "$1_$2")
        .toLowerCase()
        .match(/[\p{L}\p{N}_]+/gu) ?? []
    )
      .map(normalizedToken)
      .map(folded)
      .filter((token) => token.length > 1 && !foldedStopWords.has(token))
  );
}

function searchTerms(text) {
  text = text.normalize("NFC");
  const labels = [
    ...text
      .normalize("NFC")
      .matchAll(/(?<![\p{L}\p{N}_])([A-Z])(?![\p{L}\p{N}_])/gu),
  ]
    // English article/pronoun A/I are not identifiers unless an explicit table,
    // math or model-label context is present.
    .filter(
      (match) =>
        !/[AI]/.test(match[1]) ||
        /(?:\||\(|\bmodel|mô hình|nhóm|điểm|hàng|cột)\s*$/iu.test(
          text.slice(Math.max(0, match.index - 30), match.index),
        ),
    )
    .map((match) => "label:" + match[1].toLowerCase());
  const contextualLabels = [
    ...text.matchAll(
      /(?:mô hình|mo hinh|model|nhóm|nhom|hàng|hang|cột|cot|điểm|diem)\s+([a-z])(?=$|[^\p{L}\p{N}_])/giu,
    ),
  ].map((match) => "label:" + match[1].toLowerCase());
  return [
    ...new Set([...searchSequence(text), ...labels, ...contextualLabels]),
  ];
}

function adjacentPhrases(sequence) {
  return new Set(
    sequence.slice(1).map((token, i) => sequence[i] + " " + token),
  );
}

function tableContexts(rows) {
  const contexts = new Map();
  let prior = null;
  for (const [index, row] of rows.entries()) {
    // Chunks may start in the 180-character overlap/middle of a table row.
    // Carry only actual table headers, only through contiguous table chunks,
    // and never across source documents/pages. No generated/inferred cells.
    if (
      index &&
      (row.document_id !== rows[index - 1].document_id ||
        row.page_number !== rows[index - 1].page_number ||
        row.chunk_index !== rows[index - 1].chunk_index + 1)
    )
      prior = null;
    const header =
      /^([ \t]*\|[^\n]+\|[ \t]*\r?\n[ \t]*\|[|:\- \t]+\|[ \t]*)$/m.exec(
        row.content,
      );
    if (header) prior = { text: header[1], index };
    else if (!/^[^\n]*\|[^\n]*(?:\r?\n[ \t]*\|[^\n]*){2}/.test(row.content))
      prior = null;
    if (prior && prior.index !== index) contexts.set(index, prior);
    if (!row.content.trimEnd().split("\n").at(-1)?.includes("|")) prior = null;
  }
  return contexts;
}

// Match the document-wide prompts emitted by the unified assistant in both languages.
// Exact templates keep named-topic questions subject to the normal anchor checks.
const documentPrompts = new Set([
  "tóm tắt các ý chính trong tài liệu này.",
  "summarize the main ideas in this material.",
  "giải thích các khái niệm chính trong tài liệu bằng ví dụ dễ hiểu.",
  "explain this material's main concepts with simple examples.",
  "hãy đặt một câu hỏi để tôi tự kiểm tra kiến thức trong tài liệu này.",
  "ask me one question to check my understanding of this material.",
]);
function documentIntent(query) {
  return (
    documentPrompts.has(query.normalize("NFC").trim().toLowerCase()) ||
    /^(hãy )?(tóm tắt|summarize) (tài liệu|document)/i.test(query) ||
    /^(hãy )?giải thích (các ý chính|chủ đề đang học)/i.test(query) ||
    /^(hãy )?(đặt|tạo) (một |1 )?câu hỏi.*(kiểm tra|tài liệu)/i.test(query)
  );
}

function rankDocumentChunks(query, rows, limit = 6) {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), 6))
    : 6;
  if (documentIntent(query)) {
    const count = Math.min(rows.length, boundedLimit);
    return Array.from({ length: count }, (_, i) => ({
      chunk:
        rows[
          count === 1 ? 0 : Math.round((i * (rows.length - 1)) / (count - 1))
        ],
      score: 0,
      coverage: 1,
      anchored: false,
    }));
  }
  // A page-location question uses "states" as a reporting verb, not the
  // technical noun "state". Keep that noun meaningful in other queries.
  const searchQuery = query
    .normalize("NFC")
    .replace(/\b(?:which|what)\s+page\s+states?\b/gi, "page")
    .replace(/\b(?:công thức|cong thuc)\b/gi, " ");
  const terms = searchTerms(searchQuery);
  if (!terms.length) return [];
  const tables = tableContexts(rows);
  const searchTexts = rows.map(
    (row, index) =>
      `${row.heading ?? ""} ${tables.get(index)?.text ?? ""} ${row.content}`,
  );
  const tokenSets = searchTexts.map((text) => new Set(searchTerms(text)));
  // Decide which words are named anchors BEFORE accent folding: Vietnamese
  // "trước" must not become an absent English-style mandatory "truoc" anchor.
  const anchors = [
    ...new Set([
      ...tokens(searchQuery)
        .filter((term) => /^[a-z0-9_]{5,}$/i.test(term))
        .map(folded)
        .filter((term) => !foldedStopWords.has(term)),
      ...terms.filter(
        (term) =>
          /^label:/.test(term) ||
          /^[a-z]_\d+$/.test(term) ||
          /^\d{4,}$/.test(term),
      ),
    ]),
  ];
  const union = new Set(tokenSets.flatMap((set) => [...set]));
  if (anchors.some((term) => !union.has(term))) return [];
  const weights = terms.map((term) =>
    Math.log(
      1 + rows.length / (1 + tokenSets.filter((set) => set.has(term)).length),
    ),
  );
  const queryPhrases = adjacentPhrases(searchSequence(searchQuery));
  const exactTerms = tokens(searchQuery);
  const scored = rows.map((row, i) => {
    const matches = terms.filter((term) => tokenSets[i].has(term)).length;
    const score = terms.reduce(
      (sum, term, j) => sum + (tokenSets[i].has(term) ? weights[j] : 0),
      0,
    );
    const headingTerms = new Set(searchTerms(row.heading ?? ""));
    const headingScore = terms.reduce(
      (sum, term, j) => sum + (headingTerms.has(term) ? weights[j] : 0),
      0,
    );
    const anchored =
      anchors.length > 0 && anchors.every((term) => tokenSets[i].has(term));
    const phrases = adjacentPhrases(searchSequence(searchTexts[i]));
    const phraseScore = [...queryPhrases].filter((phrase) =>
      phrases.has(phrase),
    ).length;
    const exactSet = new Set(tokens(searchTexts[i]));
    // Exact accented spelling wins ties, without disabling unaccented fallback.
    const exactScore =
      exactTerms.filter((term) => exactSet.has(term)).length /
      Math.max(1, exactTerms.length);
    return {
      chunk: row,
      score: score + headingScore + phraseScore + 0.1 * exactScore,
      coverage: matches / terms.length,
      anchored,
    };
  });
  const ranked = scored
    .filter((item) => item.score > 0 && (item.coverage >= 0.3 || item.anchored))
    .sort(
      (a, b) =>
        Number(b.anchored) - Number(a.anchored) ||
        b.score - a.score ||
        a.chunk.chunk_index - b.chunk.chunk_index,
    );
  // Return the ORIGINAL header chunk as separate evidence when selecting a
  // continuation row. Source content/offsets/IDs are never rewritten or prefixed.
  const selected = [];
  const included = new Set();
  const indexes = new Map(rows.map((row, index) => [row, index]));
  for (const item of ranked) {
    const index = indexes.get(item.chunk);
    if (included.has(index)) continue;
    if (selected.length >= boundedLimit) break;
    selected.push(item);
    included.add(index);
    const header = tables.get(index);
    if (
      header &&
      !included.has(header.index) &&
      selected.length < boundedLimit
    ) {
      selected.push(scored[header.index]);
      included.add(header.index);
    }
  }
  return selected;
}

function resolveRetrievalQuery(query, history) {
  const refersBack = (text) =>
    /\b(its|it|why)\b/i.test(text) || /(?:nó|đó|vậy|tiếp tục)/i.test(text);
  const followUp =
    refersBack(query) ||
    (history.at(-1)?.role === "assistant" &&
      /\?\s*$/.test(history.at(-1).content));
  if (!followUp || !history.length || documentIntent(query)) return query;
  const recentQuestion =
    history.findLast((row) => row.role === "user" && !refersBack(row.content))
      ?.content ??
    history.findLast((row) => row.role === "user")?.content ??
    "";
  return documentIntent(recentQuestion)
    ? recentQuestion
    : `${query} ${recentQuestion}`;
}

module.exports = {
  documentIntent,
  rankDocumentChunks,
  resolveRetrievalQuery,
  tokens,
};
