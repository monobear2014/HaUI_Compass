import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { chunkText } from "./document-chunks";
import { chunkPages, type PdfPage } from "./document-chunking.cjs";
import { extractPdf } from "./pdf-extraction";
import { DocumentError } from "./document-store";
import {
  documentContentHead,
  documentStorage,
  documentStorageKey,
  readDocumentContent,
  removeDocumentContent,
  writeDocumentContent,
} from "./document-file-storage";
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_FILES,
  type StudyDocument,
} from "./documents";
import {
  isWebPostgresConfigured,
  webPostgresPool,
  withWebPostgresTransaction,
} from "./web-database";

const INTENT_TTL_MS = 15 * 60 * 1000;
const CONTENT_TYPES = {
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  markdown: ["text/markdown", "text/plain"],
} as const;

type UploadKind = "pdf" | "text";
type UploadDescriptor = {
  name: string;
  size: number;
  contentType: string;
};

export type UploadIntent = {
  id: string;
  documentId: string;
  pathname: string;
  clientPayload: string;
  name: string;
  kind: UploadKind;
  contentType: string;
  size: number;
  status: "pending" | "uploaded" | "ingesting" | "ready" | "failed" | "expired";
  errorCode: string | null;
};

type UploadIntentRow = {
  id: string;
  owner: string;
  document_id: string;
  storage_key: string;
  name: string;
  kind: UploadKind;
  content_type: string;
  expected_size: number;
  status: UploadIntent["status"];
  error_code: string | null;
  expires_at: number;
};

type TrustedCompletion = {
  intentId: string;
  owner: string;
  storageKey: string;
};

function extension(name: string) {
  return /\.(pdf|txt|md|markdown)$/i.exec(name)?.[1].toLowerCase() as
    | "pdf"
    | "txt"
    | "md"
    | "markdown"
    | undefined;
}

function cleanName(name: string) {
  return name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180)
    .trim();
}

function descriptorParts(descriptor: UploadDescriptor) {
  const name = cleanName(descriptor.name);
  const ext = extension(name);
  if (!ext) throw new DocumentError("unsupported_format");
  if (!descriptor.size || descriptor.size > MAX_DOCUMENT_BYTES)
    throw new DocumentError("file_size", 413);
  const allowed = CONTENT_TYPES[ext];
  if (!allowed.includes(descriptor.contentType as never))
    throw new DocumentError("invalid_content_type");
  return {
    name,
    ext,
    kind: ext === "pdf" ? ("pdf" as const) : ("text" as const),
    contentType: descriptor.contentType,
    size: descriptor.size,
  };
}

function requireDirectUploadRuntime() {
  if (
    !isWebPostgresConfigured() ||
    documentStorage().kind !== "vercel-blob" ||
    !process.env.BLOB_WEBHOOK_PUBLIC_KEY?.trim()
  )
    throw new DocumentError("direct_upload_unavailable", 503);
}

export async function createUploadIntents(
  owner: string,
  descriptors: UploadDescriptor[],
) {
  requireDirectUploadRuntime();
  if (!descriptors.length || descriptors.length > MAX_DOCUMENT_FILES)
    throw new DocumentError("file_count");
  const prepared = descriptors.map(descriptorParts);
  const now = new Date().toISOString();
  const expiresAt = Date.now() + INTENT_TTL_MS;
  return withWebPostgresTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 1))",
      [owner],
    );
    const usageResult = await client.query<{ count: string; bytes: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(size), 0)::text AS bytes
       FROM web.documents WHERE owner = $1 AND ingestion_status <> 'failed'`,
      [owner],
    );
    const usage = usageResult.rows[0];
    if (
      Number(usage?.count ?? 0) + prepared.length > 100 ||
      Number(usage?.bytes ?? 0) + prepared.reduce((sum, file) => sum + file.size, 0) >
        50 * 1024 * 1024
    )
      throw new DocumentError("storage_full", 413);

    const intents: UploadIntent[] = [];
    for (const file of prepared) {
      const id = randomUUID();
      const documentId = randomUUID();
      const pathname = documentStorageKey(documentId, id, file.ext);
      const pendingHash = `pending:${id}`;
      await client.query(
        `INSERT INTO web.documents
         (id, owner, name, kind, size, created_at, headings, storage_key, hash, ingestion_status)
         VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8, 'pending')`,
        [
          documentId,
          owner,
          file.name,
          file.kind,
          file.size,
          now,
          pathname,
          pendingHash,
        ],
      );
      await client.query(
        `INSERT INTO web.document_upload_intents
         (id, owner, document_id, storage_key, name, kind, content_type,
          expected_size, status, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $9, $10)`,
        [
          id,
          owner,
          documentId,
          pathname,
          file.name,
          file.kind,
          file.contentType,
          file.size,
          now,
          expiresAt,
        ],
      );
      intents.push({
        id,
        documentId,
        pathname,
        clientPayload: JSON.stringify({ intentId: id, owner, storageKey: pathname }),
        name: file.name,
        kind: file.kind,
        contentType: file.contentType,
        size: file.size,
        status: "pending",
        errorCode: null,
      });
    }
    return intents;
  });
}

async function findIntent(owner: string, intentId: string) {
  if (!/^[a-f0-9-]{36}$/.test(intentId)) return null;
  const result = await webPostgresPool().query<UploadIntentRow>(
    `SELECT id, owner, document_id, storage_key, name, kind, content_type,
            expected_size, status, error_code, expires_at
     FROM web.document_upload_intents WHERE owner = $1 AND id = $2`,
    [owner, intentId],
  );
  return result.rows[0] ?? null;
}

function parseTrustedCompletion(tokenPayload: string | null | undefined) {
  if (!tokenPayload) throw new DocumentError("invalid_upload_completion", 400);
  let value: Partial<TrustedCompletion>;
  try {
    value = JSON.parse(tokenPayload) as Partial<TrustedCompletion>;
  } catch {
    throw new DocumentError("invalid_upload_completion", 400);
  }
  if (
    typeof value.intentId !== "string" ||
    typeof value.owner !== "string" ||
    typeof value.storageKey !== "string"
  )
    throw new DocumentError("invalid_upload_completion", 400);
  return value as TrustedCompletion;
}

export async function authorizeUploadToken(
  owner: string,
  pathname: string,
  clientPayload: string | null,
) {
  requireDirectUploadRuntime();
  if (!clientPayload) throw new DocumentError("invalid_upload_intent", 400);
  let payload: Partial<TrustedCompletion>;
  try {
    payload = JSON.parse(clientPayload) as Partial<TrustedCompletion>;
  } catch {
    throw new DocumentError("invalid_upload_intent", 400);
  }
  if (
    payload.owner !== owner ||
    typeof payload.intentId !== "string" ||
    typeof payload.storageKey !== "string" ||
    payload.storageKey !== pathname
  )
    throw new DocumentError("invalid_upload_intent", 403);
  const intent = await findIntent(owner, payload.intentId);
  if (!intent || intent.storage_key !== pathname)
    throw new DocumentError("invalid_upload_intent", 403);
  if (intent.status !== "pending" || intent.expires_at <= Date.now())
    throw new DocumentError("expired_upload_intent", 409);
  return intent;
}

function headingMetadata(text: string) {
  const headings: string[] = [];
  let fence: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (!fence) {
      const heading = /^ {0,3}#{1,6}[\t ]+(.+)$/.exec(line)?.[1];
      if (heading) headings.push(heading.replace(/[\t ]+#+[\t ]*$/, "").trim().slice(0, 160));
      if (headings.length === 12) break;
    }
  }
  return headings;
}

async function validateActualContent(intent: UploadIntentRow, content: Buffer) {
  if (content.byteLength !== intent.expected_size)
    throw new DocumentError("file_size", 413);
  if (intent.kind === "pdf") {
    if (!content.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new DocumentError("invalid_pdf");
    return { headings: [], pages: await extractPdf(content) };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new DocumentError("invalid_text");
  }
  if (!text.trim() || /[\u0000-\u0008\u000e-\u001f]/.test(text))
    throw new DocumentError("invalid_text");
  return {
    headings: /\.(md|markdown)$/i.test(intent.name) ? headingMetadata(text) : [],
    pages: undefined,
  };
}

async function persistChunks(
  client: import("pg").PoolClient,
  documentId: string,
  document: UploadIntentRow,
  content: Buffer,
  pages?: PdfPage[],
) {
  const chunks = pages
    ? chunkPages(pages)
    : chunkText(
        new TextDecoder("utf-8", { fatal: true }).decode(content),
        /\.(md|markdown)$/i.test(document.name),
      );
  await client.query("DELETE FROM web.document_chunks WHERE document_id = $1", [documentId]);
  for (const chunk of chunks) {
    await client.query(
      `INSERT INTO web.document_chunks
       (id, document_id, content, chunk_index, heading, start_offset, end_offset, created_at, page_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        documentId,
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
  return chunks.length;
}

export async function completeUploadIntent(
  trustedTokenPayload: string,
  blob: { pathname: string; size: number; contentType: string },
) {
  requireDirectUploadRuntime();
  const trusted = parseTrustedCompletion(trustedTokenPayload);
  if (blob.pathname !== trusted.storageKey)
    throw new DocumentError("invalid_upload_completion", 400);
  const transition = await withWebPostgresTransaction(async (client) => {
    const result = await client.query<UploadIntentRow>(
      `SELECT id, owner, document_id, storage_key, name, kind, content_type,
              expected_size, status, error_code, expires_at
       FROM web.document_upload_intents
       WHERE id = $1 AND owner = $2 FOR UPDATE`,
      [trusted.intentId, trusted.owner],
    );
    const row = result.rows[0];
    if (!row || row.storage_key !== trusted.storageKey)
      throw new DocumentError("invalid_upload_completion", 403);
    if (row.status === "ready") return row;
    if (row.status === "ingesting") return null;
    if (row.status !== "pending" && row.status !== "uploaded")
      throw new DocumentError("expired_upload_intent", 409);
    if (row.expires_at <= Date.now()) {
      await client.query(
        `UPDATE web.document_upload_intents SET status = 'expired', updated_at = $1,
         error_code = 'expired' WHERE id = $2`,
        [new Date().toISOString(), row.id],
      );
      throw new DocumentError("expired_upload_intent", 409);
    }
    if (blob.size !== row.expected_size || !CONTENT_TYPES[row.kind === "pdf" ? "pdf" : extension(row.name)!].includes(blob.contentType as never))
      throw new DocumentError("invalid_upload_completion", 400);
    const now = new Date().toISOString();
    await client.query(
      `UPDATE web.document_upload_intents SET status = 'uploaded', updated_at = $1,
       completed_at = COALESCE(completed_at, $1) WHERE id = $2`,
      [now, row.id],
    );
    await client.query(
      "UPDATE web.documents SET ingestion_status = 'uploaded' WHERE id = $1",
      [row.document_id],
    );
    return row;
  });
  if (!transition) return { status: "ingesting" as const };
  const intent = transition as UploadIntentRow;
  if (intent.status === "ready") return { status: "ready" as const, documentId: intent.document_id };

  const claimed = await withWebPostgresTransaction(async (client) => {
    const result = await client.query<UploadIntentRow>(
      `SELECT id, owner, document_id, storage_key, name, kind, content_type,
              expected_size, status, error_code, expires_at
       FROM web.document_upload_intents WHERE id = $1 AND owner = $2 FOR UPDATE`,
      [intent.id, intent.owner],
    );
    const row = result.rows[0];
    if (!row) throw new DocumentError("invalid_upload_completion", 403);
    if (row.status === "ready") return row;
    if (row.status === "ingesting") return null;
    if (row.status !== "uploaded")
      throw new DocumentError("invalid_upload_completion", 409);
    await client.query(
      "UPDATE web.document_upload_intents SET status = 'ingesting', updated_at = $1 WHERE id = $2",
      [new Date().toISOString(), row.id],
    );
    await client.query(
      "UPDATE web.documents SET ingestion_status = 'ingesting' WHERE id = $1",
      [row.document_id],
    );
    return row;
  });
  if (!claimed) return { status: "ingesting" as const };
  const claimedIntent = claimed as UploadIntentRow;
  if (claimedIntent.status === "ready")
    return { status: "ready" as const, documentId: claimedIntent.document_id };

  let content: Buffer;
  let pages: PdfPage[] | undefined;
  let headings: string[];
  try {
    content = await readDocumentContent(claimedIntent.storage_key);
    ({ headings, pages } = await validateActualContent(claimedIntent, content));
  } catch (error) {
    const code = error instanceof DocumentError ? error.code : "ingestion_failed";
    await withWebPostgresTransaction(async (client) => {
      await client.query(
        `UPDATE web.document_upload_intents SET status = 'failed', error_code = $1,
         updated_at = $2 WHERE id = $3 AND status = 'ingesting'`,
        [code, new Date().toISOString(), claimedIntent.id],
      );
      await client.query(
        "DELETE FROM web.document_chunks WHERE document_id = $1",
        [claimedIntent.document_id],
      );
      await client.query(
        "UPDATE web.documents SET ingestion_status = 'failed' WHERE id = $1",
        [claimedIntent.document_id],
      );
    });
    throw error;
  }
  const hash = createHash("sha256").update(content).digest("hex");
  let duplicateDocument = false;
  try {
    await withWebPostgresTransaction(async (client) => {
      const duplicate = await client.query<{ id: string }>(
        "SELECT id FROM web.documents WHERE owner = $1 AND hash = $2 AND id <> $3 FOR UPDATE",
        [claimedIntent.owner, hash, claimedIntent.document_id],
      );
      if (duplicate.rows[0]) {
        duplicateDocument = true;
        await client.query(
          `UPDATE web.document_upload_intents SET status = 'failed', error_code = 'duplicate_document',
           updated_at = $1 WHERE id = $2`,
          [new Date().toISOString(), claimedIntent.id],
        );
        await client.query(
          "UPDATE web.documents SET ingestion_status = 'failed', hash = $1 WHERE id = $2",
          [hash, claimedIntent.document_id],
        );
        return;
      }
      const count = await persistChunks(client, claimedIntent.document_id, claimedIntent, content, pages);
      void count;
      await client.query(
        `UPDATE web.documents SET name = $1, size = $2, headings = $3::jsonb, hash = $4,
         ingestion_status = 'ready' WHERE id = $5`,
        [claimedIntent.name, content.byteLength, JSON.stringify(headings), hash, claimedIntent.document_id],
      );
      await client.query(
        `UPDATE web.document_upload_intents SET status = 'ready', updated_at = $1,
         error_code = NULL WHERE id = $2`,
        [new Date().toISOString(), claimedIntent.id],
      );
    });
  } catch (error) {
    await withWebPostgresTransaction(async (client) => {
      await client.query(
        `UPDATE web.document_upload_intents SET status = 'failed', error_code = 'ingestion_failed',
         updated_at = $1 WHERE id = $2 AND status = 'ingesting'`,
        [new Date().toISOString(), claimedIntent.id],
      );
      await client.query(
        "DELETE FROM web.document_chunks WHERE document_id = $1",
        [claimedIntent.document_id],
      );
      await client.query(
        "UPDATE web.documents SET ingestion_status = 'failed' WHERE id = $1",
        [claimedIntent.document_id],
      );
    }).catch(() => undefined);
    throw error;
  }
  if (duplicateDocument)
    return {
      status: "failed" as const,
      documentId: claimedIntent.document_id,
      errorCode: "duplicate_document",
    };
  return { status: "ready" as const, documentId: claimedIntent.document_id };
}

export async function reconcileUploadIntent(owner: string, intentId: string) {
  requireDirectUploadRuntime();
  const intent = await findIntent(owner, intentId);
  if (!intent) return null;
  if (intent.status === "ready" || intent.status === "failed" || intent.status === "expired")
    return intent;
  if (intent.expires_at <= Date.now()) {
    await completeUploadIntent(
      JSON.stringify({ intentId, owner, storageKey: intent.storage_key }),
      { pathname: intent.storage_key, size: 0, contentType: intent.content_type },
    ).catch(() => undefined);
    return findIntent(owner, intentId);
  }
  const object = await documentContentHead(intent.storage_key);
  if (!object) return intent;
  try {
    await completeUploadIntent(
      JSON.stringify({ intentId, owner, storageKey: intent.storage_key }),
      { pathname: intent.storage_key, size: object.size, contentType: object.contentType },
    );
  } catch {
    // The durable failed state is written by completeUploadIntent when validation or ingestion fails.
  }
  return findIntent(owner, intentId);
}

export async function getUploadIntentStatus(owner: string, intentId: string) {
  const intent = await reconcileUploadIntent(owner, intentId);
  if (!intent) return null;
  const document = await webPostgresPool().query<StudyDocument>(
    `SELECT id, name, kind, size, created_at AS "createdAt", headings,
            ingestion_status AS "ingestionStatus"
     FROM web.documents WHERE owner = $1 AND id = $2`,
    [owner, intent.document_id],
  );
  return {
    id: intent.id,
    documentId: intent.document_id,
    status: intent.status,
    errorCode: intent.error_code,
    document: document.rows[0] ?? null,
  };
}

export async function retryUploadIntent(owner: string, intentId: string) {
  requireDirectUploadRuntime();
  const intent = await withWebPostgresTransaction(async (client) => {
    const result = await client.query<UploadIntentRow>(
      `SELECT id, owner, document_id, storage_key, name, kind, content_type,
              expected_size, status, error_code, expires_at
       FROM web.document_upload_intents WHERE owner = $1 AND id = $2 FOR UPDATE`,
      [owner, intentId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.status !== "failed" || row.error_code === "duplicate_document")
      throw new DocumentError("upload_not_retryable", 409);
    if (row.expires_at <= Date.now())
      throw new DocumentError("expired_upload_intent", 409);
    await client.query(
      `UPDATE web.document_upload_intents SET status = 'uploaded', error_code = NULL,
       updated_at = $1 WHERE id = $2`,
      [new Date().toISOString(), row.id],
    );
    await client.query(
      "UPDATE web.documents SET ingestion_status = 'uploaded' WHERE id = $1",
      [row.document_id],
    );
    return row;
  });
  if (!intent) return null;
  const object = await documentContentHead(intent.storage_key);
  if (!object) throw new DocumentError("storage_read_failed", 503);
  await completeUploadIntent(
    JSON.stringify({ intentId, owner, storageKey: intent.storage_key }),
    { pathname: intent.storage_key, size: object.size, contentType: object.contentType },
  );
  return getUploadIntentStatus(owner, intentId);
}

export async function cleanupUploadObject(key: string) {
  await removeDocumentContent(key);
}

export async function persistDirectUploadObject(
  key: string,
  content: Buffer,
  contentType: string,
) {
  await writeDocumentContent(key, content, contentType);
}
