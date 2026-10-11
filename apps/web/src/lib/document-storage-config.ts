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
