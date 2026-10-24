# Authentication and authorization foundation

## Implemented boundary

- Email/password login uses `bcryptjs` hashing and verification with cost factor 12. The exported credential helper applies a 12–128 character baseline (a security assumption for review, not a regulatory rule). Password hashes are selected out of ordinary Mongoose queries and are never included in the public user response. Account provisioning and password-reset flows are intentionally outside this stage.
- Authentication is a server-side `express-session` session. Production sessions are persisted in MongoDB in the `server_sessions` collection; the browser receives only an opaque session identifier. Login regenerates the session identifier to prevent fixation. The default idle lifetime is eight hours and can be reduced with `SESSION_TTL_HOURS`.
- Session cookies are `HttpOnly`, `SameSite=Strict`, path `/`, and `Secure` in production. Production uses the `__Host-` cookie prefix. The frontend origin is allow-listed and credentialed requests are enabled only for that exact configured origin.
- Unsafe `/api` requests require a synchronizer CSRF token obtained from `GET /api/auth/csrf`, then sent as `X-CSRF-Token`. Login also requires this token. The token is bound to the server-side session and compared in constant time.
- Login is rate-limited to eight attempts per IP per 15-minute window. Unknown, suspended, invited, and wrong-password accounts share one response. A randomized dummy bcrypt hash is used for unknown accounts to reduce account-enumeration timing differences.
- The authenticated user and membership roles are reloaded from MongoDB on each request. Roles are never accepted from login or other client payloads. `requireInstitutionRole` checks active membership for the institution route parameter and sets a server-resolved `request.institutionScope`; missing memberships receive a non-disclosing 404. Business services must pass that trusted scope to `institutionScopedFilter` for every tenant-owned read and write.
- Authentication and denied-authorization events write redacted audit records. Login credentials, password hashes, CSRF tokens, cookies, and request bodies are not recorded.

## Security assumptions and limits

- Institution roles currently live in the existing user membership records. Assignment, revocation, and break-glass administration are not implemented here; those must be separately authorized and audited. No role is selected by the user at login.
- A login is possible only for an active account with a provisioned bcrypt hash. No credentials or demo accounts are shipped. Account invitations, password setup/reset, MFA, and recovery are out of scope.
- The institution path parameter is treated only as a requested selector; membership authorization turns it into trusted scope. Routes must not query domain data directly using a body/header institution ID.
- Login throttling uses Express's client IP. Set `TRUST_PROXY_HOPS` to the exact trusted ingress hop count when TLS or client traffic is forwarded through a load balancer. Incorrect proxy trust can allow IP spoofing or prevent the secure cookie from being issued.
- Tests use synthetic users and Express's in-memory session store. Production app wiring uses MongoDB sessions and the real user repository. No external identity provider or bank verification is implied.

## Before production deployment

1. Set `SESSION_SECRET` and `MONGODB_URI` using the hosting provider's secret manager; rotate them using an operational procedure. Never commit local `.env.development` files.
2. Enforce HTTPS end-to-end or configure only the exact trusted reverse proxy hops. Configure HSTS at the TLS termination layer.
3. Use a shared, durable rate-limit store behind multiple server instances; add account/IP progressive throttling and alerting. The included limiter's in-memory store is process-local.
4. Add MFA for privileged roles, secure invitation/password reset, breached-password checks, password rotation/recovery policy, and session revocation on credential or role changes.
5. Review bcrypt cost factor against production hardware and latency; use a managed KMS-backed key/secrets policy and consider Argon2id if the deployment runtime supports its maintained implementation.
6. Configure MongoDB least privilege, network allow-listing, TLS, backups, encryption-at-rest, session TTL index monitoring, and a separate database principal for migrations.
7. Protect audit log retention and access, centralize security monitoring, test alert delivery, and define incident response and account lockout procedures.
8. Add deployment-specific CSP, security headers, dependency scanning, SAST/DAST, penetration testing, and operational checks for cookie, CORS, proxy, and CSRF behavior.

## Test coverage

`server/test/security.test.ts` exercises unauthenticated access, cross-institution access, role escalation attempts, unauthorized approval, expired sessions, CSRF enforcement, generic login errors, and session identifier rotation. Tests use only synthetic data.
