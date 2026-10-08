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
      (text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
        .map(normalizedToken)
        .filter((token) => token.length > 1 && !stopWords.has(token)),
    ),
  ];
}

function documentIntent(query) {
  return (
    /^(hãy )?(tóm tắt|summarize) (tài liệu|document)/i.test(query) ||
    /^(hãy )?giải thích (các ý chính|chủ đề đang học)/i.test(query) ||
    /^(hãy )?(đặt|tạo) (một |1 )?câu hỏi.*(kiểm tra|tài liệu)/i.test(query)
  );
}

function rankDocumentChunks(query, rows, limit = 6) {
  const boundedLimit = Math.max(1, Math.min(limit, 6));
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
  const terms = tokens(query);
  if (!terms.length) return [];
  const tokenSets = rows.map(
    (row) => new Set(tokens(`${row.heading ?? ""} ${row.content}`)),
  );
  const anchors = terms.filter(
    (term) => /^[a-z0-9_]{5,}$/i.test(term) && !stopWords.has(term),
  );
  const union = new Set(tokenSets.flatMap((set) => [...set]));
  if (anchors.some((term) => !union.has(term))) return [];
  const weights = terms.map((term) =>
    Math.log(
      1 + rows.length / (1 + tokenSets.filter((set) => set.has(term)).length),
    ),
  );
  return rows
    .map((row, i) => {
      const matches = terms.filter((term) => tokenSets[i].has(term)).length;
      const score = terms.reduce(
        (sum, term, j) => sum + (tokenSets[i].has(term) ? weights[j] : 0),
        0,
      );
      const headingTerms = new Set(tokens(row.heading ?? ""));
      const headingScore = terms.reduce(
        (sum, term, j) => sum + (headingTerms.has(term) ? weights[j] : 0),
        0,
      );
      const anchored =
        anchors.length > 0 && anchors.every((term) => tokenSets[i].has(term));
      return {
        chunk: row,
        score: score + headingScore,
        coverage: matches / terms.length,
        anchored,
      };
    })
    .filter((item) => item.score > 0 && (item.coverage >= 0.3 || item.anchored))
    .sort(
      (a, b) => b.score - a.score || a.chunk.chunk_index - b.chunk.chunk_index,
    )
    .slice(0, boundedLimit);
}

function resolveRetrievalQuery(query, history) {
  const refersBack = (text) =>
    /\b(its|it|why)\b/i.test(text) || /(?:nó|đó|vậy|tiếp tục)/i.test(text);
  const followUp =
    refersBack(query) ||
    (history.at(-1)?.role === "assistant" && /\?\s*$/.test(history.at(-1).content));
  if (!followUp || !history.length || documentIntent(query)) return query;
  const recentQuestion =
    history.findLast((row) => row.role === "user" && !refersBack(row.content))
      ?.content ??
    history.findLast((row) => row.role === "user")?.content ??
    "";
  return documentIntent(recentQuestion) ? recentQuestion : `${query} ${recentQuestion}`;
}

module.exports = {
  documentIntent,
  rankDocumentChunks,
  resolveRetrievalQuery,
  tokens,
};
