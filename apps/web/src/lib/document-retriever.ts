import "server-only";
import {
  documentDatabase,
  DocumentError,
  findDocument,
} from "./document-store";
import { rankDocumentChunks, type RankedChunk } from "./document-ranking.cjs";

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  filename: string;
  content: string;
  chunk_index: number;
  heading: string | null;
  start_offset: number;
  end_offset: number;
  page_number?: number | null;
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
export { documentIntent } from "./document-ranking.cjs";

export class SqliteDocumentRetriever implements DocumentRetriever {
  search(
    query: string,
    studySetId: string,
    userId: string,
    documentIds?: string[],
    limit = 6,
  ) {
    return this.searchWithScores(
      query,
      studySetId,
      userId,
      documentIds,
      limit,
    ).map((item) => item.chunk);
  }

  searchWithScores(
    query: string,
    studySetId: string,
    userId: string,
    documentIds?: string[],
    limit = 6,
  ): RankedChunk<RetrievedChunk>[] {
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
      d.name AS filename, c.content, c.chunk_index, c.heading, c.start_offset, c.end_offset, c.page_number
      FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.owner = ? AND d.id = ? AND d.ingestion_status = 'ready' ORDER BY c.chunk_index`,
      )
      .all(userId, studySetId) as RetrievedChunk[];
    return rankDocumentChunks(query, rows, limit);
  }
}
