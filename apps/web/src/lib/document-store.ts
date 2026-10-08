import "server-only";
import {
  ingestDocument,
  migrateCompassChat,
} from "./migrations/001-compass-chat";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type DocumentStudyProgress,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_FILES,
  type StudyDocument,
} from "./documents";

// Local demo storage, separated by authenticated owner (unlike the shared learning API).
// No third-party upload, PDF extraction, OCR, or generated study plan is implied.
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
  headings: string;
  content?: Uint8Array;
  ingestion_status: StudyDocument["ingestionStatus"];
};
function metadata(row: Row): StudyDocument {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.size,
    createdAt: row.created_at,
    headings: JSON.parse(row.headings),
    ingestionStatus: row.ingestion_status,
  };
}

export function listDocuments(owner: string): StudyDocument[] {
  const rows = documentDatabase()
    .prepare(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status
    FROM documents WHERE owner = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all(owner) as Row[];
  return rows.map(metadata);
}
export function findDocument(owner: string, id: string, includeContent = true) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = documentDatabase()
    .prepare(
      `SELECT id, name, kind, size, created_at, headings, ingestion_status${includeContent ? ", content" : ""} FROM documents WHERE owner = ? AND id = ?`,
    )
    .get(owner, id) as Row | undefined;
  return row
    ? { ...metadata(row), content: Buffer.from(row.content ?? []) }
    : null;
}

export function getDocumentStudyProgress(
  owner: string,
  documentId: string,
): DocumentStudyProgress | null {
  if (!findDocument(owner, documentId)) return null;
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

export function saveDocumentStudyProgress(
  owner: string,
  documentId: string,
  progress: Pick<DocumentStudyProgress, "covered" | "mastered">,
): DocumentStudyProgress | null {
  const document = findDocument(owner, documentId);
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
      if (kind === "pdf") {
        if (!content.subarray(0, 5).equals(Buffer.from("%PDF-")))
          throw new DocumentError("invalid_pdf");
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
      };
    }),
  );
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
        if (existing.ingestion_status === "failed") {
          try {
            ingestDocument(store, { ...file, id: existing.id });
            existing.ingestion_status = "ready";
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
          : file.kind === "pdf"
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
