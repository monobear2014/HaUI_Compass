import "server-only";
import { del, get, head, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DOCUMENT_BYTES } from "./documents";
import {
  resolveDocumentStorageConfiguration,
  type DocumentStorageConfiguration,
} from "./document-storage-config";

export type DocumentStorageObject = {
  pathname: string;
  size: number;
  contentType: string;
  etag?: string;
};

export type DocumentStorageRead = DocumentStorageObject & {
  stream: ReadableStream<Uint8Array>;
};

export interface DocumentStorage {
  readonly kind: DocumentStorageConfiguration["kind"];
  put(
    key: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<DocumentStorageObject>;
  get(key: string): Promise<DocumentStorageRead | null>;
  head(key: string): Promise<DocumentStorageObject | null>;
  read(key: string): Promise<Buffer>;
  stream(key: string): Promise<DocumentStorageRead | null>;
  delete(key: string): Promise<void>;
  signedGetUrl(key: string, validForMs?: number): Promise<string>;
}

function storageDirectory() {
  const root =
    process.env.COMPASS_STORAGE_DIR ||
    (process.env.COMPASS_TEST_STORAGE === "1"
      ? join(process.cwd(), ".playwright-data")
      : join(process.cwd(), ".demo-auth"));
  return join(root, "document-content");
}

export function validateDocumentStorageKey(key: string) {
  if (
    !/^documents\/[a-f0-9-]{36}(?:\/[a-f0-9-]{36}\.(?:pdf|txt|md|markdown))?$/.test(
      key,
    )
  )
    throw new Error("Invalid document storage key");
}

function storagePath(key: string) {
  validateDocumentStorageKey(key);
  return join(storageDirectory(), key.slice("documents/".length));
}

export function documentStorageKey(
  documentId: string,
  uploadId = documentId,
  extension?: string,
) {
  if (!/^[a-f0-9-]{36}$/.test(documentId) || !/^[a-f0-9-]{36}$/.test(uploadId))
    throw new Error("Invalid document storage identity");
  return extension
    ? `documents/${documentId}/${uploadId}.${extension}`
    : `documents/${documentId}`;
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>,
  maximumBytes = MAX_DOCUMENT_BYTES,
) {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes)
        throw new Error("Document storage object too large");
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts.map((part) => Buffer.from(part)));
}

class LocalDocumentStorage implements DocumentStorage {
  readonly kind = "local" as const;

  async put(key: string, content: Uint8Array, contentType: string) {
    validateDocumentStorageKey(key);
    const path = storagePath(key);
    await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
    await writeFile(path, content, { mode: 0o600, flag: "wx" }).catch(
      async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        await writeFile(path, content, { mode: 0o600 });
      },
    );
    return { pathname: key, size: content.byteLength, contentType };
  }

  async get(key: string) {
    const content = await readFile(storagePath(key)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    return content
      ? {
          pathname: key,
          size: content.byteLength,
          contentType: "application/octet-stream",
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(content));
              controller.close();
            },
          }),
        }
      : null;
  }

  async head(key: string) {
    const result = await this.get(key);
    return result
      ? {
          pathname: result.pathname,
          size: result.size,
          contentType: result.contentType,
        }
      : null;
  }

  async read(key: string) {
    return readFile(storagePath(key));
  }

  stream(key: string) {
    return this.get(key);
  }

  async delete(key: string) {
    await rm(storagePath(key), { force: true });
  }

  async signedGetUrl(key: string) {
    validateDocumentStorageKey(key);
    return `/api/documents/storage?key=${encodeURIComponent(key)}`;
  }
}

class VercelBlobDocumentStorage implements DocumentStorage {
  readonly kind = "vercel-blob" as const;

  async put(key: string, content: Uint8Array, contentType: string) {
    validateDocumentStorageKey(key);
    const result = await put(key, Buffer.from(content), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return {
      pathname: result.pathname,
      size: content.byteLength,
      contentType: result.contentType,
    };
  }

  async get(key: string) {
    validateDocumentStorageKey(key);
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return {
      pathname: result.blob.pathname,
      size: result.blob.size,
      contentType: result.blob.contentType,
      etag: result.blob.etag,
      stream: result.stream,
    };
  }

  async head(key: string) {
    validateDocumentStorageKey(key);
    try {
      const result = await head(key, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return {
        pathname: result.pathname,
        size: result.size,
        contentType: result.contentType,
        etag: result.etag,
      };
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) return null;
      throw error;
    }
  }

  async read(key: string) {
    const result = await this.get(key);
    if (!result) throw new Error("Document storage object not found");
    return streamToBuffer(result.stream);
  }

  stream(key: string) {
    return this.get(key);
  }

  async delete(key: string) {
    validateDocumentStorageKey(key);
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }

  async signedGetUrl(key: string, validForMs = 5 * 60 * 1000) {
    validateDocumentStorageKey(key);
    const validUntil = Date.now() + validForMs;
    const token = await issueSignedToken({
      pathname: key,
      operations: ["get"],
      validUntil,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const result = await presignUrl(token, {
      operation: "get",
      pathname: key,
      access: "private",
      validUntil,
    });
    return result.presignedUrl;
  }
}

let selectedStorage: DocumentStorage | undefined;

export function documentStorage() {
  if (selectedStorage) return selectedStorage;
  const configuration = resolveDocumentStorageConfiguration();
  selectedStorage =
    configuration.kind === "vercel-blob"
      ? new VercelBlobDocumentStorage()
      : new LocalDocumentStorage();
  return selectedStorage;
}

export function resetDocumentStorageForTests() {
  selectedStorage = undefined;
}

export async function writeDocumentContent(
  key: string,
  content: Uint8Array,
  contentType = "application/octet-stream",
) {
  await documentStorage().put(key, content, contentType);
}

export async function readDocumentContent(key: string) {
  return documentStorage().read(key);
}

export async function streamDocumentContent(key: string) {
  return documentStorage().stream(key);
}

export async function documentContentHead(key: string) {
  return documentStorage().head(key);
}

export async function removeDocumentContent(key: string) {
  await documentStorage().delete(key);
}

export async function signedDocumentContentUrl(key: string, validForMs?: number) {
  return documentStorage().signedGetUrl(key, validForMs);
}
