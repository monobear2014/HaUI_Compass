import { test, expect } from "@playwright/test";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { googleAuthConfiguration } from "../src/lib/google-auth-config";
import {
  googleAuthorizationUrl,
  googleClient,
  googleIdentity,
  newGoogleFlow,
  readGoogleFlow,
  GOOGLE_FLOW_SECONDS,
} from "../src/lib/google-oauth";

const config = {
  clientId: "synthetic-client.apps.googleusercontent.com",
  clientSecret: "synthetic-secret",
  redirectUri: "http://localhost:3000/api/auth/google/callback",
  origin: "http://localhost:3000",
};

test("Google configuration requires complete credentials and an exact safe callback", () => {
  expect(googleAuthConfiguration({})).toBeNull();
  const environment = {
    GOOGLE_CLIENT_ID: config.clientId,
    GOOGLE_CLIENT_SECRET: config.clientSecret,
    GOOGLE_REDIRECT_URI: config.redirectUri,
    NODE_ENV: "development",
  };
  expect(googleAuthConfiguration(environment)).toEqual(config);
  for (const uri of [
    "https://example.com/other",
    "https://user:password@example.com/api/auth/google/callback",
    "https://example.com/api/auth/google/callback?next=anything",
    "http://example.com/api/auth/google/callback",
  ]) {
    expect(
      googleAuthConfiguration({ ...environment, GOOGLE_REDIRECT_URI: uri }),
    ).toBeNull();
  }
  expect(
    googleAuthConfiguration({ ...environment, NODE_ENV: "production" }),
  ).toBeNull();
});

test("Google state binds the browser, PKCE and nonce to a short lived safe return path", () => {
  const flow = newGoogleFlow("https://untrusted.example");
  expect(flow.next).toBe("/learn");
  const raw = Buffer.from(JSON.stringify(flow)).toString("base64url");
  expect(readGoogleFlow(raw, flow.state)).toEqual(flow);
  expect(readGoogleFlow(undefined, flow.state)).toBeNull();
  expect(readGoogleFlow(raw, newGoogleFlow(null).state)).toBeNull();
  expect(
    readGoogleFlow(
      raw,
      flow.state,
      flow.createdAt + GOOGLE_FLOW_SECONDS * 1000,
    ),
  ).toBeNull();
  expect(readGoogleFlow(raw, flow.state, flow.createdAt - 1)).toBeNull();
  expect(readGoogleFlow("malformed", flow.state)).toBeNull();
  const url = new URL(googleAuthorizationUrl(googleClient(config), flow));
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(flow.verifier).digest("base64url"),
  );
  expect(url.searchParams.get("nonce")).toBe(flow.nonce);
  expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
    "email",
    "openid",
    "profile",
  ]);
  expect(url.searchParams.has("client_secret")).toBe(false);
  expect(url.searchParams.get("access_type")).toBe("online");
});

test("Google tokens require a valid signature, audience, issuer, expiry, nonce and verified email", async () => {
  const client = googleClient(config);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  // Only synthetic keys: verification uses the real Google library without
  // making a certificate or token request to the provider.
  Object.defineProperty(client.transporter, "request", {
    value: async () => ({
      data: { synthetic: publicKey.export({ type: "spki", format: "pem" }) },
      headers: new Headers({ "cache-control": "public, max-age=3600" }),
    }),
  });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "https://accounts.google.com",
    aud: config.clientId,
    sub: "synthetic-subject",
    nonce: "synthetic-nonce",
    email_verified: true,
    name: "Synthetic student",
    iat: now,
    exp: now + 3600,
  };
  const token = (claims: object, key = privateKey) => {
    const input = [
      JSON.stringify({ alg: "RS256", kid: "synthetic" }),
      JSON.stringify(claims),
    ]
      .map((value) => Buffer.from(value).toString("base64url"))
      .join(".");
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
  };
  const verify = (idToken: string) =>
    client.verifyIdToken({ idToken, audience: config.clientId });
  const verified = (await verify(token(payload))).getPayload();
  expect(googleIdentity(verified, payload.nonce)).toEqual({
    subject: payload.sub,
    name: payload.name,
  });
  expect(() => googleIdentity(verified, "wrong-nonce")).toThrow();
  expect(() =>
    googleIdentity({ ...verified, email_verified: false }, payload.nonce),
  ).toThrow();
  for (const claims of [
    { ...payload, aud: "foreign-client" },
    { ...payload, iss: "https://untrusted.example" },
    { ...payload, iat: now - 7200, exp: now - 3600 },
  ]) {
    await expect(verify(token(claims))).rejects.toThrow();
  }
  const foreign = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await expect(verify(token(payload, foreign.privateKey))).rejects.toThrow();
});

test("Google callbacks without a browser flow cannot create a session", async ({
  request,
}) => {
  const response = await request.get(
    "/api/auth/google/callback?code=synthetic&state=synthetic",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(
    /\/login\?error=google_(failed|unavailable)$/,
  );
  expect(response.headers()["set-cookie"] || "").not.toContain(
    "compass_session=",
  );
});

test("Google initiation sets an HttpOnly flow cookie and rejects a mismatched callback state", async ({
  context,
}) => {
  const start = await context.request.get(
    "/api/auth/google?next=https%3A%2F%2Funtrusted.example",
    { maxRedirects: 0 },
  );
  expect(start.status()).toBe(307);
  const target = new URL(start.headers().location);
  expect(target.origin).toBe("https://accounts.google.com");
  expect(target.searchParams.get("redirect_uri")).toMatch(
    /\/api\/auth\/google\/callback$/,
  );
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
  const cookie = (await context.cookies()).find(
    (item) => item.name === "compass_google",
  );
  expect(Boolean(cookie?.httpOnly)).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const failure = await context.request.get(
    "/api/auth/google/callback?code=synthetic&state=wrong-state",
    { maxRedirects: 0 },
  );
  expect(failure.status()).toBe(307);
  expect(failure.headers().location).toMatch(/\/login\?error=google_failed$/);
  expect(
    (await context.cookies()).some((item) => item.name === "compass_google"),
  ).toBe(false);
  const session = await context.request.get("/api/auth/session");
  expect((await session.json()).user).toBeNull();
});

test("upload is optional and opens from the learning home", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo account" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page
    .getByRole("link", { name: "Add materials", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/documents\/upload\?next=%2Flearn$/);
  await expect(
    page.getByRole("heading", { name: "Start with your study material." }),
  ).toBeVisible();
});
