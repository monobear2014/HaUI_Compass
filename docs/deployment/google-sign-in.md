# Google sign-in

Password and Google sign-in send students directly to `/learn` (or the validated
screen they requested). Lecturer access still comes from server-side grants.
`/documents/upload` is an optional page reached from **Thêm tài liệu / Add materials**.
The old `/onboarding/upload` URL redirects to this page.

Google is enabled only when all three server-side settings below are valid.
Until then its button is disabled; password sign-in continues to work.

## Create credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or
   select a project.
2. In **Google Auth Platform → Branding**, set the app name, support email and
   developer contact. Use the app's actual privacy/terms URLs when requested.
3. Under **Audience**, choose **External** for personal Gmail accounts. While the
   app is in Testing, add the Gmail accounts that will test it to **Test users**.
4. Under **Clients → Create client**, choose **Web application**.
5. Add the exact **Authorized redirect URI**:
   - Local: `http://localhost:3000/api/auth/google/callback`
   - Hosted: `https://YOUR-APP-HOST/api/auth/google/callback`
6. Copy the client ID and secret into server-side settings. Never commit the
   secret or paste it into an issue/chat. No Gmail inbox or Drive permissions are
   requested; the scopes are `openid email profile`.

Google's [OpenID Connect setup documentation](https://developers.google.com/identity/openid-connect/openid-connect)
explains consent-screen and exact redirect matching requirements.

## Local setup

Create `apps/web/.env.local` (the root `.env` is not automatically loaded by the
Next.js process running in `apps/web`):

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

Restart Next.js and visit `http://localhost:3000/login`. Use that exact hostname;
the OAuth start route redirects other hosts to the configured callback origin.
SQLite development storage creates the OAuth identity table automatically.

## Preview / deployment setup

Stable Preview URL: <https://haui-compass.vercel.app/>.

Configured on 2026-10-19: Google OAuth client `HaUI Compass Web` in project
`haui-compass-auth-20261019`; client settings installed in local `.env.local`
and Vercel Preview environment. PostgreSQL migration revision 4 was applied
and verified in release build events. The app remains External / Testing with
one owner test account. After the owner completed Google identity verification,
real Google sign-in succeeded and reached `/learn` on the stable Preview URL;
document upload remained available through the optional “Thêm tài liệu” links.
No credential values are recorded here.
Register this exact hosted callback in Google Cloud:

```text
https://haui-compass.vercel.app/api/auth/google/callback
```

1. Apply web PostgreSQL migration **004_oauth_accounts.sql** before enabling
   Google. In `apps/web`, run `npm run db:migrate` with the dedicated Preview
   `HAUI_COMPASS_WEB_DATABASE_URL` supplied securely to the process. The migration
   is additive and does not modify existing users/documents.
2. Choose a stable application hostname. Each immutable Vercel Preview has a
   different hostname; a callback registered for an earlier Preview will not
   automatically work on a later one.
3. Register its exact callback URI in Google Cloud and set `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` (sensitive) and `GOOGLE_REDIRECT_URI` for the web process
   in the hosting provider's Preview environment.
4. Redeploy. Keep deployment protection consistent with the intended testers so
   Google can return the browser to the application.
5. Verify success, cancel, retry and logout using an allowed Google test account.
   A callback without the initiating browser cookie must not create a session.

After each future Preview deployment, repoint the stable alias to that deployment
before testing Google sign-in:

```sh
vercel alias set YOUR-NEW-DEPLOYMENT.vercel.app haui-compass.vercel.app
```

This uses Vercel's [Preview alias workflow](https://vercel.com/kb/guide/how-to-alias-a-preview-deployment-using-the-cli);
it does not promote the Preview to Production.

## Identity and verification

- The server uses Google's official `google-auth-library`: authorization code
  exchange with PKCE S256, then ID-token signature, issuer, audience and expiry
  verification. It additionally checks the nonce and verified-email claim.
- A ten-minute HttpOnly, SameSite=Lax cookie binds state, nonce and PKCE verifier
  to the initiating browser. HTTPS uses a Secure `__Host-` cookie. The callback
  clears this cookie on success and failure.
- Provider identity is `(provider, subject)`, never the email address. Signing in
  with Google creates a separate account from an existing password account;
  existing documents are not merged automatically. The same Google identity
  returns to the same user. Google-only users have no known password.
- Access/refresh/ID tokens are not persisted or returned to the browser. OAuth
  errors are reduced to fixed application error codes; do not log provider
  responses, callback query strings, cookies or arbitrary exceptions.
- Automated tests use synthetic state, RSA keys and claims. They do not replace
  a real Google sign-in acceptance test after credentials are configured.
