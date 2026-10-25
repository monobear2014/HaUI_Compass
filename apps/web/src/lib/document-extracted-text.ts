import "server-only";
import { documentDatabase, findDocument } from "./document-store";
import { isWebPostgresConfigured, webPostgresPool } from "./web-database";

type Chunk = {
  content: string;
  start_offset: number;
  end_offset: number;
  page_number: number | null;
};

// Read existing owner-scoped chunks; never re-run paid OCR when a reader is opened.
export async function extractedDocumentPages(owner: string, id: string) {
  if (!(await findDocument(owner, id, false))) return null;
  const rows = isWebPostgresConfigured()
    ? (
        await webPostgresPool().query<Chunk>(
          `SELECT c.content,c.start_offset,c.end_offset,c.page_number
       FROM web.document_chunks c JOIN web.documents d ON d.id=c.document_id
       WHERE d.owner=$1 AND d.id=$2 ORDER BY c.chunk_index`,
          [owner, id],
        )
      ).rows
    : (documentDatabase()
        .prepare(
          `SELECT c.content,c.start_offset,c.end_offset,c.page_number
       FROM document_chunks c JOIN documents d ON d.id=c.document_id
       WHERE d.owner=? AND d.id=? ORDER BY c.chunk_index`,
        )
        .all(owner, id) as Chunk[]);
  const pages = new Map<
    number,
    { page_number: number; text: string; end: number }
  >();
  for (const row of rows) {
    const number = row.page_number || 1;
    const page = pages.get(number) || { page_number: number, text: "", end: 0 };
    page.text += row.content.slice(Math.max(0, page.end - row.start_offset));
    page.end = Math.max(page.end, row.end_offset);
    pages.set(number, page);
  }
  return [...pages.values()].map(({ page_number, text }) => ({
    page_number,
    text,
  }));
}
