import "server-only";
import { extractPdf } from "./pdf-extraction";
import {
  ingestDocument,
  migrateCompassChat,
} from "./migrations/001-compass-chat";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chunkText } from "./document-chunks";
import { chunkPages, type PdfPage } from "./document-chunking.cjs";
import {
  documentStorageKey,
  readDocumentContent,
  removeDocumentContent,
  writeDocumentContent,
} from "./document-file-storage";
import {
  type DocumentStudyProgress,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_FILES,
  type StudyDocument,
} from "./documents";
import type { DocumentPersistence } from "./persistence-contracts";
import {
  isWebPostgresConfigured,
  webPostgresPool,
  withWebPostgresTransaction,
} from "./web-database";

// Local demo storage, separated by authenticated owner (unlike the shared learning API).
// PDF text extraction is internal only; no OCR or generated study plan is implied.
let connection: DatabaseSync | undefined;
export function documentDatabase() {
  if (connection) return connection;
  const directory =
    process.env.COMPASS_STORAGE_DIR ||
    (process.env.COMPASS_TEST_STORAGE === "1"
      ? join(process.cwd(), ".playwright-data")
      : join(process.cwd(), ".demo-auth"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, "documents.sqlite");
  connection = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  connection.exec(`PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL,
      kind TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL,
      headings TEXT NOT NULL, content BLOB NOT NULL, hash TEXT NOT NULL,
      UNIQUE(owner, hash)
    );`);
  connection.exec(`CREATE TABLE IF NOT EXISTS document_study_progress (
    owner TEXT NOT NULL,
    document_id TEXT NOT NULL,
    covered TEXT NOT NULL,
    mastered TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(owner, document_id)
  );`);
  try {
    migrateCompassChat(connection);
  } catch (error) {
    connection.close();
    connection = undefined;
    throw error;
  }
  return connection;
}

export class DocumentError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
type Row = {
  id: string;
  name: string;
  kind: "pdf" | "text";
  size: number;
  created_at: string;
  headings: string | string[];
  content?: Uint8Array;
  storage_key?: string;
  ingestion_status: StudyDocument["ingestionStatus"];
};
function metadata(row: Row): StudyDocument {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.size,
    createdAt: row.created_at,
    headings:
      typeof row.headings === "string"
        ? JSON.parse(row.headings)
        : row.headings,
    ingestionStatus: row.ingestion_status,
  };
}

export async function listDocuments(owner: string): Promise<StudyDocument[]> {
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query<Row>(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status
       FROM web.documents WHERE owner = $1
       ORDER BY created_at DESC, id DESC LIMIT 100`,
      [owner],
    );
    return result.rows.map(metadata);
  }
  const rows = documentDatabase()
    .prepare(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status
    FROM documents WHERE owner = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all(owner) as Row[];
  return rows.map(metadata);
}
export async function findDocument(
  owner: string,
  id: string,
  includeContent = true,
) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query<Row>(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status,
       storage_key FROM web.documents WHERE owner = $1 AND id = $2`,
      [owner, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const content = includeContent
      ? await readDocumentContent(row.storage_key!)
      : Buffer.alloc(0);
    return { ...metadata(row), content };
  }
  const row = documentDatabase()
    .prepare(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status${includeContent ? ", content" : ""} FROM documents WHERE owner = ? AND id = ?`,
    )
    .get(owner, id) as Row | undefined;
  return row
    ? { ...metadata(row), content: Buffer.from(row.content ?? []) }
    : null;
}

export async function getDocumentStudyProgress(
  owner: string,
  documentId: string,
): Promise<DocumentStudyProgress | null> {
  if (!(await findDocument(owner, documentId, false))) return null;
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query<{
      covered: string[];
      mastered: string[];
      updated_at: string;
    }>(
      `SELECT covered, mastered, updated_at
       FROM web.document_study_progress
       WHERE owner = $1 AND document_id = $2`,
      [owner, documentId],
    );
    const row = result.rows[0];
    return row
      ? {
          covered: row.covered,
          mastered: row.mastered,
          updatedAt: row.updated_at,
        }
      : { covered: [], mastered: [], updatedAt: null };
  }
  const row = documentDatabase()
    .prepare(
      "SELECT covered, mastered, updated_at FROM document_study_progress WHERE owner = ? AND document_id = ?",
    )
    .get(owner, documentId) as
    { covered: string; mastered: string; updated_at: string } | undefined;
  return row
    ? {
        covered: JSON.parse(row.covered),
        mastered: JSON.parse(row.mastered),
        updatedAt: row.updated_at,
      }
    : { covered: [], mastered: [], updatedAt: null };
}

export async function saveDocumentStudyProgress(
  owner: string,
  documentId: string,
  progress: Pick<DocumentStudyProgress, "covered" | "mastered">,
): Promise<DocumentStudyProgress | null> {
  const document = await findDocument(owner, documentId, false);
  if (!document) return null;
  const count =
    document.kind === "pdf" ? 0 : Math.max(document.headings.length, 1);
  const validIds = new Set(
    Array.from({ length: count }, (_, i) => `topic-${i}`),
  );
  const covered = [...new Set(progress.covered)].filter((id) =>
    validIds.has(id),
  );
  const mastered = [...new Set(progress.mastered)].filter((id) =>
    covered.includes(id),
  );
  const updatedAt = new Date().toISOString();
  if (isWebPostgresConfigured()) {
    await webPostgresPool().query(
      `INSERT INTO web.document_study_progress
       (owner, document_id, covered, mastered, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (owner, document_id) DO UPDATE SET
         covered = EXCLUDED.covered,
         mastered = EXCLUDED.mastered,
         updated_at = EXCLUDED.updated_at`,
      [
        owner,
        documentId,
        JSON.stringify(covered),
        JSON.stringify(mastered),
        updatedAt,
      ],
    );
    return { covered, mastered, updatedAt };
  }
  documentDatabase()
    .prepare(
      `INSERT INTO document_study_progress (owner, document_id, covered, mastered, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner, document_id) DO UPDATE SET
       covered = excluded.covered, mastered = excluded.mastered, updated_at = excluded.updated_at`,
    )
    .run(
      owner,
      documentId,
      JSON.stringify(covered),
      JSON.stringify(mastered),
      updatedAt,
    );
  return { covered, mastered, updatedAt };
}

export async function saveDocuments(owner: string, files: File[]) {
  if (!files.length || files.length > MAX_DOCUMENT_FILES)
    throw new DocumentError("file_count");
  // Validate the complete batch before saving anything.
  const prepared = await Promise.all(
    files.map(async (file) => {
      const extension = /\.(pdf|txt|md|markdown)$/i
        .exec(file.name)?.[1]
        .toLowerCase();
      if (!extension) throw new DocumentError("unsupported_format");
      if (!file.size || file.size > MAX_DOCUMENT_BYTES)
        throw new DocumentError("file_size", 413);
      const content = Buffer.from(await file.arrayBuffer());
      const kind = extension === "pdf" ? ("pdf" as const) : ("text" as const);
      const headings: string[] = [];
      let pages: PdfPage[] | undefined;
      if (kind === "pdf") {
        if (!content.subarray(0, 5).equals(Buffer.from("%PDF-")))
          throw new DocumentError("invalid_pdf");
        pages = await extractPdf(content);
      } else {
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(content);
        } catch {
          throw new DocumentError("invalid_text");
        }
        if (!text.trim() || /[\u0000-\u0008\u000e-\u001f]/.test(text))
          throw new DocumentError("invalid_text");
        // Only explicit Markdown headings, not invented semantic/AI topics.
        if (extension === "md" || extension === "markdown") {
          let fence: string | null = null;
          for (const line of text.split(/\r?\n/)) {
            const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
            if (marker) {
              if (!fence) fence = marker;
              else if (marker[0] === fence[0] && marker.length >= fence.length)
                fence = null;
              continue;
            }
            if (fence) continue;
            const heading = /^ {0,3}#{1,6}[\t ]+(.+)$/.exec(line)?.[1];
            if (heading)
              headings.push(
                heading
                  .replace(/[\t ]+#+[\t ]*$/, "")
                  .trim()
                  .slice(0, 160),
              );
            if (headings.length === 12) break;
          }
        }
      }
      const name = file.name
        .split(/[\\/]/)
        .pop()!
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 180)
        .trim();
      if (!name) throw new DocumentError("unsupported_format");
      return {
        id: randomUUID(),
        name,
        kind,
        size: content.length,
        content,
        headings,
        hash: createHash("sha256").update(content).digest("hex"),
        pages,
      };
    }),
  );
  if (isWebPostgresConfigured()) return saveDocumentsPostgres(owner, prepared);
  const store = documentDatabase();
  store.exec("BEGIN IMMEDIATE");
  try {
    const usage = store
      .prepare(
        "SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM documents WHERE owner = ?",
      )
      .get(owner) as { count: number; bytes: number };
    const saved: StudyDocument[] = [];
    for (const file of prepared) {
      const existing = store
        .prepare(
          "SELECT id, name, kind, size, created_at, headings, ingestion_status FROM documents WHERE owner = ? AND hash = ?",
        )
        .get(owner, file.hash) as Row | undefined;
      if (existing) {
        if (
          existing.ingestion_status === "failed" ||
          (existing.ingestion_status === "unsupported" && file.pages)
        ) {
          try {
            ingestDocument(store, { ...file, id: existing.id });
            existing.ingestion_status =
              file.kind === "pdf" && !file.pages ? "unsupported" : "ready";
          } catch {
            store
              .prepare("DELETE FROM document_chunks WHERE document_id = ?")
              .run(existing.id);
            console.error("Compass ingestion retry failed", {
              documentId: existing.id,
            });
          }
        }
        saved.push(metadata(existing));
        continue;
      }
      if (++usage.count > 100 || (usage.bytes += file.size) > 50 * 1024 * 1024)
        throw new DocumentError("storage_full", 413);
      const createdAt = new Date().toISOString();
      store
        .prepare(
          "INSERT INTO documents (id, owner, name, kind, size, created_at, headings, content, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          file.id,
          owner,
          file.name,
          file.kind,
          file.size,
          createdAt,
          JSON.stringify(file.headings),
          file.content,
          file.hash,
        );
      let failed = false;
      try {
        ingestDocument(store, file);
      } catch {
        console.error("Compass ingestion failed", { documentId: file.id });
        store
          .prepare("DELETE FROM document_chunks WHERE document_id = ?")
          .run(file.id);
        store
          .prepare(
            "UPDATE documents SET ingestion_status = 'failed' WHERE id = ?",
          )
          .run(file.id);
        failed = true;
      }
      saved.push({
        id: file.id,
        name: file.name,
        kind: file.kind,
        size: file.size,
        createdAt,
        headings: file.headings,
        ingestionStatus: failed
          ? "failed"
          : file.kind === "pdf" && !file.pages
            ? "unsupported"
            : "ready",
      });
    }
    store.exec("COMMIT");
    if (saved.some((doc) => doc.ingestionStatus === "failed"))
      throw new DocumentError("ingestion_failed", 422);
    return [...new Map(saved.map((doc) => [doc.id, doc])).values()];
  } catch (error) {
    if (store.isTransaction) store.exec("ROLLBACK");
    throw error;
  }
}

export async function deleteDocument(owner: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return false;
  if (isWebPostgresConfigured()) {
    const storageKey = await withWebPostgresTransaction(async (client) => {
      const lookup = await client.query<{ storage_key: string }>(
        `SELECT storage_key FROM web.documents
         WHERE owner = $1 AND id = $2 FOR UPDATE`,
        [owner, id],
      );
      if (!lookup.rows[0]) return null;
      await client.query(
        "DELETE FROM web.documents WHERE owner = $1 AND id = $2",
        [owner, id],
      );
      return lookup.rows[0].storage_key;
    });
    if (!storageKey) return false;
    await removeDocumentContent(storageKey).catch(() => {
      console.warn("Deleted document content cleanup failed", {
        documentId: id,
      });
    });
    return true;
  }

  const store = documentDatabase();
  store.exec("BEGIN IMMEDIATE");
  try {
    const found = store
      .prepare("SELECT id FROM documents WHERE owner = ? AND id = ?")
      .get(owner, id);
    if (!found) {
      store.exec("COMMIT");
      return false;
    }
    store
      .prepare(
        `DELETE FROM message_citations WHERE message_id IN
         (SELECT m.id FROM chat_messages m JOIN chat_sessions s ON s.id = m.session_id
          WHERE s.owner = ? AND s.study_set_id = ?)`,
      )
      .run(owner, id);
    store
      .prepare(
        `DELETE FROM chat_messages WHERE session_id IN
         (SELECT id FROM chat_sessions WHERE owner = ? AND study_set_id = ?)`,
      )
      .run(owner, id);
    store
      .prepare("DELETE FROM chat_sessions WHERE owner = ? AND study_set_id = ?")
      .run(owner, id);
    store
      .prepare(
        "DELETE FROM document_study_progress WHERE owner = ? AND document_id = ?",
      )
      .run(owner, id);
    store.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(id);
    store
      .prepare("DELETE FROM documents WHERE owner = ? AND id = ?")
      .run(owner, id);
    store.exec("COMMIT");
    return true;
  } catch (error) {
    store.exec("ROLLBACK");
    throw error;
  }
}

type PreparedDocument = {
  id: string;
  name: string;
  kind: "pdf" | "text";
  size: number;
  content: Buffer;
  headings: string[];
  hash: string;
  pages?: PdfPage[];
};

async function saveDocumentsPostgres(
  owner: string,
  documents: PreparedDocument[],
) {
  const candidates = await Promise.all(
    documents.map(async (document) => {
      const storageKey = documentStorageKey(document.id);
      await writeDocumentContent(storageKey, document.content);
      const unsupported = document.kind === "pdf" && !document.pages;
      const chunks = unsupported
        ? []
        : document.pages
          ? chunkPages(document.pages)
          : chunkText(
              new TextDecoder("utf-8", { fatal: true }).decode(
                document.content,
              ),
              /\.(md|markdown)$/i.test(document.name),
            );
      return { ...document, storageKey, chunks, unsupported };
    }),
  );
  const retained = new Set<string>();
  const obsolete = new Set<string>();
  let saved: StudyDocument[] = [];
  try {
    saved = await withWebPostgresTransaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
        [owner],
      );
      const usageResult = await client.query<{ count: string; bytes: string }>(
        `SELECT COUNT(*)::text AS count, COALESCE(SUM(size), 0)::text AS bytes
         FROM web.documents WHERE owner = $1`,
        [owner],
      );
      const usage = {
        count: Number(usageResult.rows[0]?.count ?? 0),
        bytes: Number(usageResult.rows[0]?.bytes ?? 0),
      };
      const result: StudyDocument[] = [];
      for (const document of candidates) {
        const lookup = await client.query<Row>(
          `SELECT id, name, kind, size, created_at, headings,
           ingestion_status, storage_key FROM web.documents
           WHERE owner = $1 AND hash = $2`,
          [owner, document.hash],
        );
        const existing = lookup.rows[0];
        if (
          existing &&
          existing.ingestion_status !== "failed" &&
          !(existing.ingestion_status === "unsupported" && document.pages)
        ) {
          retained.add(existing.storage_key!);
          result.push(metadata(existing));
          continue;
        }
        if (!existing) {
          if (
            ++usage.count > 100 ||
            (usage.bytes += document.size) > 50 * 1024 * 1024
          )
            throw new DocumentError("storage_full", 413);
        }

        const id = existing?.id ?? document.id;
        const storageKey = existing
          ? documentStorageKey(existing.id)
          : document.storageKey;
        if (existing?.storage_key && existing.storage_key !== storageKey)
          obsolete.add(existing.storage_key);
        if (existing && document.storageKey !== storageKey) {
          await writeDocumentContent(storageKey, document.content);
        }
        retained.add(storageKey);
        const createdAt = existing?.created_at ?? new Date().toISOString();
        const status = document.unsupported ? "unsupported" : "pending";
        await client.query(
          `INSERT INTO web.documents
           (id, owner, name, kind, size, created_at, headings, storage_key, hash, ingestion_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
             kind = EXCLUDED.kind, size = EXCLUDED.size,
             headings = EXCLUDED.headings, storage_key = EXCLUDED.storage_key,
             hash = EXCLUDED.hash, ingestion_status = EXCLUDED.ingestion_status`,
          [
            id,
            owner,
            document.name,
            document.kind,
            document.size,
            createdAt,
            JSON.stringify(document.headings),
            storageKey,
            document.hash,
            status,
          ],
        );
        let finalStatus: StudyDocument["ingestionStatus"] = status;
        if (!document.unsupported) {
          await client.query("SAVEPOINT ingest_document");
          try {
            await client.query(
              "DELETE FROM web.document_chunks WHERE document_id = $1",
              [id],
            );
            for (const chunk of document.chunks) {
              await client.query(
                `INSERT INTO web.document_chunks
                 (id, document_id, content, chunk_index, heading,
                  start_offset, end_offset, created_at, page_number)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  randomUUID(),
                  id,
                  chunk.content,
                  chunk.chunk_index,
                  chunk.heading,
                  chunk.start_offset,
                  chunk.end_offset,
                  new Date().toISOString(),
                  "page_number" in chunk ? chunk.page_number : null,
                ],
              );
            }
            await client.query(
              "UPDATE web.documents SET ingestion_status = 'ready' WHERE id = $1",
              [id],
            );
            await client.query("RELEASE SAVEPOINT ingest_document");
            finalStatus = "ready";
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT ingest_document");
            await client.query("RELEASE SAVEPOINT ingest_document");
            await client.query(
              "DELETE FROM web.document_chunks WHERE document_id = $1",
              [id],
            );
            await client.query(
              "UPDATE web.documents SET ingestion_status = 'failed' WHERE id = $1",
              [id],
            );
            finalStatus = "failed";
            console.error("Compass ingestion failed", { documentId: id });
          }
        }
        result.push({
          id,
          name: document.name,
          kind: document.kind,
          size: document.size,
          createdAt,
          headings: document.headings,
          ingestionStatus: finalStatus,
        });
      }
      return result;
    });
  } catch (error) {
    await Promise.all(
      candidates.map((document) =>
        removeDocumentContent(document.storageKey).catch(() => undefined),
      ),
    );
    throw error;
  }
  await Promise.all([
    ...candidates
      .filter((document) => !retained.has(document.storageKey))
      .map((document) =>
        removeDocumentContent(document.storageKey).catch(() => undefined),
      ),
    ...[...obsolete].map((key) =>
      removeDocumentContent(key).catch(() => undefined),
    ),
  ]);
  if (saved.some((document) => document.ingestionStatus === "failed"))
    throw new DocumentError("ingestion_failed", 422);
  return [
    ...new Map(saved.map((document) => [document.id, document])).values(),
  ];
}

export const documentPersistence = {
  listDocuments,
  findDocument,
  saveDocuments,
  deleteDocument,
  getStudyProgress: getDocumentStudyProgress,
  saveStudyProgress: saveDocumentStudyProgress,
} satisfies DocumentPersistence;
