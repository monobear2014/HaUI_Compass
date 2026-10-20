import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { safeReturnPath } from "./auth-navigation";
import { googleAuthConfiguration } from "./google-auth-config";

export const GOOGLE_FLOW_SECONDS = 600;
export type GoogleFlow = {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  createdAt: number;
};

export function newGoogleFlow(next: unknown): GoogleFlow {
  return {
    state: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    next: safeReturnPath(next),
    createdAt: Date.now(),
  };
}

export function readGoogleFlow(
  raw: string | undefined,
  state: string | null,
  now = Date.now(),
): GoogleFlow | null {
  if (!raw || raw.length > 2048 || !state || !/^[\w-]{43}$/.test(state))
    return null;
  try {
    const flow = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !flow ||
      typeof flow !== "object" ||
      ![flow.state, flow.verifier, flow.nonce].every(
        (value) => typeof value === "string" && /^[\w-]{43}$/.test(value),
      ) ||
      !Number.isSafeInteger(flow.createdAt) ||
      now < flow.createdAt ||
      now - flow.createdAt >= GOOGLE_FLOW_SECONDS * 1000 ||
      !timingSafeEqual(Buffer.from(flow.state), Buffer.from(state))
    )
      return null;
    return { ...flow, next: safeReturnPath(flow.next) };
  } catch {
    return null;
  }
}

export function googleClient(
  config: NonNullable<ReturnType<typeof googleAuthConfiguration>>,
) {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    transporterOptions: { timeout: 15_000, retry: false },
  });
}

export function googleAuthorizationUrl(client: OAuth2Client, flow: GoogleFlow) {
  return client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    access_type: "online",
    prompt: "select_account",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256")
      .update(flow.verifier)
      .digest("base64url"),
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

// Call only with the payload returned by OAuth2Client.verifyIdToken, which
// verifies the signature, issuer, audience and expiration against Google keys.
export function googleIdentity(
  payload:
    | {
        sub?: string;
        nonce?: string;
        email_verified?: boolean;
        name?: string;
      }
    | undefined,
  nonce: string,
) {
  if (
    !payload?.sub ||
    payload.sub.length > 255 ||
    payload.nonce !== nonce ||
    payload.email_verified !== true
  )
    throw new Error("invalid_google_identity");
  return { subject: payload.sub, name: payload.name || "Google user" };
}
