import "server-only";
import {
  documentDatabase,
  DocumentError,
  findDocument,
} from "./document-store";

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  filename: string;
  content: string;
  chunk_index: number;
  heading: string | null;
  start_offset: number;
  end_offset: number;
};
export interface DocumentRetriever {
  search(
    query: string,
    studySetId: string,
    userId: string,
    documentIds?: string[],
    limit?: number,
  ): RetrievedChunk[];
}
const stopWords = new Set(
  "a an and the of to is in what how tôi bạn mình hãy cho về này đó nó tài liệu trong những các một là gì được giải thích như thế nào có vì sao tại dùng phần nội dung biết giúp với và để của please explain document".split(
    " ",
  ),
);
function tokens(text: string) {
  return [
    ...new Set(
      (
        text
          .normalize("NFC")
          .toLowerCase()
          .match(/[\p{L}\p{N}_]+/gu) ?? []
      ).filter((token) => token.length > 1 && !stopWords.has(token)),
    ),
  ];
}
export function documentIntent(query: string) {
  return (
    /^(hãy )?(tóm tắt|summarize) (tài liệu|document)/i.test(query) ||
    /^(hãy )?giải thích (các ý chính|chủ đề đang học)/i.test(query) ||
    /^(hãy )?(đặt|tạo) (một |1 )?câu hỏi.*(kiểm tra|tài liệu)/i.test(query)
  );
}

export class SqliteDocumentRetriever implements DocumentRetriever {
  search(
    query: string,
    studySetId: string,
    userId: string,
    documentIds?: string[],
    limit = 6,
  ) {
    // Current repo: each study set has exactly one source document. Validate every
    // supplied ID BEFORE even reading chunks; this boundary can later join a set table.
    const document = findDocument(userId, studySetId, false);
    if (!document) throw new DocumentError("not_found", 404);
    for (const id of documentIds ?? []) {
      if (id !== studySetId) throw new DocumentError("not_found", 404);
    }
    if (document.ingestionStatus !== "ready")
      throw new DocumentError(
        `ingestion_${document.ingestionStatus ?? "pending"}`,
        422,
      );
    const rows = documentDatabase()
      .prepare(
        `SELECT c.id AS chunk_id, c.document_id,
      d.name AS filename, c.content, c.chunk_index, c.heading, c.start_offset, c.end_offset
      FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.owner = ? AND d.id = ? AND d.ingestion_status = 'ready' ORDER BY c.chunk_index`,
      )
      .all(userId, studySetId) as RetrievedChunk[];
    const boundedLimit = Math.max(1, Math.min(limit, 6));
    if (documentIntent(query)) {
      // Distributed coverage for summary/quiz instead of always truncating to the beginning.
      const count = Math.min(rows.length, boundedLimit);
      return Array.from(
        { length: count },
        (_, i) =>
          rows[
            count === 1 ? 0 : Math.round((i * (rows.length - 1)) / (count - 1))
          ],
      );
    }
    const terms = tokens(query);
    if (!terms.length) return [];
    const tokenSets = rows.map(
      (row) => new Set(tokens(`${row.heading ?? ""} ${row.content}`)),
    );
    // Rare terms count more than common words. Required ASCII/acronym anchors
    // follow the existing knowledge retriever's fail-closed rule.
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
    const ranked = rows
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
          row,
          score: score + headingScore,
          coverage: matches / terms.length,
          anchored,
        };
      })
      .filter(
        (item) => item.score > 0 && (item.coverage >= 0.3 || item.anchored),
      )
      .sort(
        (a, b) => b.score - a.score || a.row.chunk_index - b.row.chunk_index,
      );
    return ranked.slice(0, boundedLimit).map((item) => item.row);
  }
}
