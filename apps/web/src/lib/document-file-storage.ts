import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

function storageDirectory() {
  const root =
    process.env.COMPASS_STORAGE_DIR ||
    (process.env.COMPASS_TEST_STORAGE === "1"
      ? join(process.cwd(), ".playwright-data")
      : join(process.cwd(), ".demo-auth"));
  return join(root, "document-content");
}

function storagePath(key: string) {
  if (!/^documents\/[a-f0-9-]{36}$/.test(key))
    throw new Error("Invalid document storage key");
  return join(storageDirectory(), key.slice("documents/".length));
}

export function documentStorageKey(id: string) {
  return `documents/${id}`;
}

export async function writeDocumentContent(key: string, content: Uint8Array) {
  await mkdir(storageDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(storagePath(key), content, { mode: 0o600 });
}

export async function readDocumentContent(key: string) {
  return readFile(storagePath(key));
}

export async function removeDocumentContent(key: string) {
  await rm(storagePath(key), { force: true });
}
