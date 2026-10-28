# Verification and API troubleshooting

The verification route is `GET /api/institutions/:institutionId/verification/instruments`.
It authenticates the server session and checks an active institution membership with
`verification:read` permission. Queries always use the authorized institution scope.
Operators and administrators can initiate simulations; reviewer and auditor access
remains read-only.

The reported verification failure was reproduced against the development database:
19 of 48 FDRs were incomplete drafts without `principalAmount`. Calling `.toString()`
on those values threw a TypeError. The listing now selects records with reference,
bank, and Decimal128 amount before pagination. Existing complete drafts remain
eligible. Incomplete verification commands return 409. The page shows an explicit
empty fixture state. No draft data or verification state is modified by this fix.
A read-only request through the fixed router returned 200 with 29 instruments and
all four fixtures for the existing authorized membership.

`GET /api/auth/me` intentionally returns 401 without a valid active session. The
client treats it as signed out. Session cookies are included in client requests;
Vite forwards `/api` to port 4000. Use localhost consistently rather than mixing it
with 127.0.0.1. Production requires HTTPS and correctly configured trusted proxy
hops. Do not remove Secure, CSRF, or institution membership checks to suppress 401.
Authentication responses now disable caching. Profile updates also await the
asynchronous public-user serializer before responding.

In production, Vercel must rewrite `/api/*` to
`https://nidhikosh.onrender.com/api/*` before its SPA fallback rewrite. The browser
continues to call same-origin `/api/...` URLs, so the existing `HttpOnly`,
`SameSite=Strict`, `Secure` session cookie remains usable without enabling
cross-site cookies. No `VITE_API_URL` variable is currently read by the client.
Set the Render `CLIENT_ORIGIN` environment variable to the exact deployed frontend
origin, `https://nidhikosh-app.vercel.app`, so the backend CORS allowlist matches
production as well as local development.

Server environment files resolve relative to the server module, independent of the
working directory: `.env` then `.env.development` overrides during development.
Production reads injected environment variables only. Restart the backend after
changing configuration. OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL belong only
in the server environment. Groq-prefixed keys select its compatible endpoint by
default; its default model is qwen/qwen3.8-27b. Explicit provider/model settings are
supported. The configured development provider returned 200 for both a model-list
check and a minimal real chat request during investigation. No live backend terminal
logs were attached, so the original 503's historical runtime configuration cannot
be established conclusively.

Missing configuration returns 503, as do connection failures and provider rate or
availability failures. Invalid provider responses return 502. These failures never
produce a fabricated answer or retry against an unrelated `/responses` endpoint.
Logs contain event, request ID, and upstream status/reason only, excluding keys,
chat messages, and raw upstream errors. General API failures include method and
route pattern for correlation without recording request bodies or credentials.

Run `npm --workspace server test`, `npm run typecheck`, `npm run lint`, and
`npm run build` to validate. API regression coverage includes Decimal128 output,
empty instruments, operator/admin access, cross-institution and membership denial,
missing provider configuration, upstream rejection/unavailability, network failure,
empty replies, and successful provider replies.
