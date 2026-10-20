export type DocumentStorageConfiguration =
  | { kind: "local" }
  | { kind: "vercel-blob" };

type StorageEnvironment = {
  BLOB_READ_WRITE_TOKEN?: string;
  BLOB_STORE_ID?: string;
  VERCEL_OIDC_TOKEN?: string;
  NODE_ENV?: string;
  VERCEL?: string;
};

// Use the configured storage credential consistently for metadata and content.
// The Blob SDK otherwise prefers a Vercel OIDC token over the environment's
// read/write token, which can select a different authorization path on Vercel.
export function documentBlobCredentials(
  environment: StorageEnvironment = process.env,
) {
  return { token: environment.BLOB_READ_WRITE_TOKEN?.trim() || undefined };
}

export function isCloudStorageCredentialed(
  environment: StorageEnvironment = process.env,
) {
  return Boolean(
    environment.BLOB_READ_WRITE_TOKEN?.trim() ||
      (environment.BLOB_STORE_ID?.trim() &&
        environment.VERCEL_OIDC_TOKEN?.trim()),
  );
}

export function requiresCloudStorage(
  environment: StorageEnvironment = process.env,
) {
  return environment.NODE_ENV === "production" || environment.VERCEL === "1";
}

export function resolveDocumentStorageConfiguration(
  environment: StorageEnvironment = process.env,
): DocumentStorageConfiguration {
  if (isCloudStorageCredentialed(environment)) return { kind: "vercel-blob" };
  if (requiresCloudStorage(environment))
    throw new Error(
      "Private Vercel Blob configuration is required in staging/production",
    );
  return { kind: "local" };
}
