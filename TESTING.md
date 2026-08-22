# End-to-end API testing log

This document records a full manual test pass of every user-facing flow in the Auth-Service POC, run against a real local PostgreSQL database and a Mailpit SMTP container (no mocks). **OAuth/social login is explicitly excluded from this pass** — it needs real provider credentials and is deferred to a separate session.

Every request below is a real `curl` call that was actually executed against the running service during this test pass. Replace `$ACCESS_TOKEN` / `$ORG_ID` / etc. with values from your own run — they're illustrative placeholders, not live credentials.

## Environment used for this pass

- PostgreSQL running locally (`DATABASE_URL` in `.env`)
- [Mailpit](https://github.com/axllent/mailpit) in Docker for SMTP + a web/API inbox at `http://localhost:8025`
- Migrations applied with `npx prisma migrate deploy` (schema was already in sync via an existing `prisma/migrations/20260822115306_sync_full_schema`), seed run with `npx tsx prisma/seed.ts` to populate the `Permission` table
- App built with `npx nest build` and run with `node dist/src/main.js` (port 3000)

---

## 0. Setup: migrations, seed, build, run

```bash
# Apply pending migrations (never run against a DB that matters without a backup)
npx prisma migrate deploy

# Seed the Permission table (RBAC roles reference these by key)
npx tsx prisma/seed.ts

# Build and start
npx nest build
node dist/src/main.js
```

---

## 1. Registration → email verification → login

### Register

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner1@example.com","password":"Password123!","termsAccepted":true}'
```

```json
{ "message": "User registration email sent to email id: owner1@example.com" }
```

`termsAccepted: true` is required (GDPR consent tracking) — omitting it or passing `false` is rejected by validation with a 400.

### Fetch the verification token from Mailpit

```bash
curl -s http://localhost:8025/api/v1/messages   # find the message ID for the recipient
curl -s http://localhost:8025/api/v1/message/<MESSAGE_ID>   # extract ?token=... from the body
```

### Verify email

```bash
curl "http://localhost:3000/auth/verify-email?token=<TOKEN_FROM_EMAIL>"
```

```json
{
  "message": "Email verified. Please Login using your email and password by going to the login page"
}
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner1@example.com","password":"Password123!"}'
```

```json
{ "access_token": "<JWT>", "refresh_token": "<sessionId>.<rawToken>" }
```

### Get current profile

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "id": "...",
  "email": "owner1@example.com",
  "is_email_verified": true,
  "terms_accepted_at": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

---

## 2. Session management

### List my sessions (scoped to caller only)

```bash
curl http://localhost:3000/session -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Revoke a single session (must be your own)

```bash
curl -X PATCH http://localhost:3000/session/$SESSION_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Trying to revoke someone else's session ID returns `404 Session not found` — ownership isn't leaked as a 403 vs 404 distinction, to avoid confirming session-ID existence to an attacker.

### Revoke all my sessions

```bash
curl -X PATCH http://localhost:3000/session/user/revoke-all \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{ "message": "3 sessions revoked" }
```

### Refresh (rotates the session — old refresh token and old access token are both invalidated)

```bash
curl http://localhost:3000/auth/refresh -H "Authorization: Bearer $REFRESH_TOKEN"
```

Reusing the old refresh token afterwards correctly returns `401 SessionExpiredError`. Using the pre-refresh access token afterwards correctly returns `401 User session not found`.

---

## 3. Organizations & RBAC

### Create an organization (caller becomes Owner; Owner/Admin/Member system roles are auto-provisioned)

```bash
curl -X POST http://localhost:3000/organizations \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"orgName":"Acme Corp"}'
```

```json
{ "id": "<ORG_ID>", "name": "Acme Corp" }
```

### List an org's roles (with effective permissions)

```bash
curl http://localhost:3000/organizations/$ORG_ID/roles \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

### Add a member with a given role

```bash
curl -X POST http://localhost:3000/organizations/$ORG_ID/members \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"<USER_ID>","roleId":"<ADMIN_ROLE_ID>"}'
```

### List members

```bash
curl http://localhost:3000/organizations/$ORG_ID/members \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

### Create a custom role (requires `role.create`)

```bash
curl -X POST http://localhost:3000/organizations/$ORG_ID/role \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleName":"Editor","permissionIds":[]}'
```

Attempting to include an owner-only permission (e.g. `organization.delete`) in a custom role is rejected:

```json
{
  "message": "RoleCreationError: Cannot create role with owner permissions. Only one owner is allowed",
  "error": "Forbidden",
  "statusCode": 403
}
```

### Give a custom role a parent (hierarchical permission inheritance)

```bash
curl -X PATCH http://localhost:3000/organizations/$ORG_ID/roles/$EDITOR_ROLE_ID \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"parentRoleId":"<MEMBER_ROLE_ID>"}'
```

**Verified**: a user holding a role with zero permissions of its own, but whose `parentRoleId` points at the Member role (`organization.read`), can successfully call endpoints requiring `organization.read` (inherited) but is still `403`'d on endpoints requiring `role.create` (not inherited). Hierarchical inheritance works exactly as designed.

### Change a member's role

```bash
curl -X PATCH http://localhost:3000/organizations/$ORG_ID/users/$USER_ID \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"<NEW_ROLE_ID>"}'
```

### Delete a role (blocked while members hold it or other roles inherit from it)

```bash
curl -X DELETE http://localhost:3000/organizations/$ORG_ID/roles/$ROLE_ID \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
```

### Remove a member (blocked for the current Owner — must transfer ownership first)

```bash
curl -X DELETE http://localhost:3000/organizations/$ORG_ID/members/$USER_ID \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

### Transfer ownership

```bash
curl -X POST http://localhost:3000/organizations/$ORG_ID/transfer-ownership \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"tranfereeId":"<NEW_OWNER_USER_ID>","transferorReplacementOrgRoleId":"<ADMIN_ROLE_ID>"}'
```

```json
{ "message": "Ownership transferred successfully" }
```

---

## 4. Multi-tenancy isolation (verified live, not just unit-tested)

- A user with **no membership** in Org B gets `403 This action is forbidden to you` on every Org-B-scoped route (`/members`, `/roles`, `/audit-logs`, etc.).
- A user who **is** an Admin in Org A, holding a real `role.update` permission there, cannot use that permission against a role ID that actually belongs to Org B — even by constructing the URL with Org A's ID and Org B's role ID:
  ```bash
  curl -X PATCH http://localhost:3000/organizations/$ORG_A_ID/roles/$ORG_B_ROLE_ID \
    -H "Authorization: Bearer $ORG_A_ADMIN_TOKEN" -H "Content-Type: application/json" \
    -d '{"roleName":"Hijacked"}'
  # => 400 {"message":"Role not found","error":"Bad Request","statusCode":400}
  ```
- Session revocation is scoped per-user: one user cannot revoke another user's session by ID (404, not 200).
- Audit log reads are scoped per-org via the same `AuthorizationGuard` + `audit.read` permission check as every other org route.

---

## 5. Audit logging

### List an org's audit trail (paginated, newest first)

```bash
curl "http://localhost:3000/organizations/$ORG_ID/audit-logs?page=1&limit=20" \
  -H "Authorization: Bearer $OWNER_ACCESS_TOKEN"
```

Every security-relevant action taken above (register, login, org creation, member added, role created/updated, ownership transferred, role changed) shows up here with a hash-chained `prev_hash`/`entry_hash` pair.

### Verify the tamper-evident hash chain is intact

```bash
curl http://localhost:3000/audit-logs/integrity -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{ "valid": true }
```

(This endpoint is intentionally global/unscoped — the hash chain spans all tenants — and only requires authentication, not a specific permission.)

---

## 6. GDPR: data export & right to erasure

### Export my data (Art. 15/20)

```bash
curl http://localhost:3000/auth/me/export -H "Authorization: Bearer $ACCESS_TOKEN"
```

Returns `profile`, `organizationMemberships`, `sessions` (with `refresh_token_hash` stripped — never exported, even hashed), and recent `auditEvents` where the caller was the actor.

### Delete my account (Art. 17)

```bash
curl -X DELETE http://localhost:3000/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"password":"Password123!"}'
```

- **Blocked with `409 Conflict`** while the caller is the Owner of any organization ("Transfer ownership of your organizations before deleting your account") — verified live.
- **Succeeds** for an account with no org ownerships: cascades through `MagicLink`, `UserSession`, `OrgMembership`, deletes the `User` row, and records a `USER_ACCOUNT_DELETED` audit event (which correctly survives the user's deletion, since `AuditLog` has no FK to `User` by design). Verified the account can no longer log in afterward (`404 User not found. Please register first`).
- Password is optional in the request body for OAuth-only accounts (no password to re-confirm) — not exercised in this pass since OAuth is out of scope here.

---

## 7. API security hardening

### Rate limiting

Hitting `/auth/login` repeatedly from the same IP within the configured window (`AUTH_THROTTLE_LIMIT`, default 5/60s) returns `429 Too Many Requests` once the limit is exceeded — verified live.

### Security headers (Helmet)

```bash
curl -I http://localhost:3000/
```

Confirmed present: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.

### Input validation

- Unknown/extra fields in a request body are rejected (`forbidNonWhitelisted`):
  ```json
  {
    "message": ["property isAdmin should not exist"],
    "error": "Bad Request",
    "statusCode": 400
  }
  ```
- Missing required fields are rejected with descriptive messages, e.g. omitting `termsAccepted` on registration.
- A malformed `:organizationId` route param (not a UUID) now returns a clean `400 Bad Request` (see bug list below — this was a 500 before this test pass).

---

## 8. OAuth / social login — testing locally without real provider credentials

`GoogleStrategy`/`GithubStrategy`/`MicrosoftStrategy` each fetch a real REST profile endpoint after the token exchange, in three different vendor-specific shapes (Google's OpenID userinfo, GitHub's `/user` + `/user/emails`, Microsoft Graph's `/me`). `scripts/mock-oauth-server.ts` is a small dependency-free local server that implements all three, so the entire redirect → code exchange → profile fetch → account link/create flow can be exercised over real HTTP without registering an app with any provider.

### Run it

```bash
npm run mock:oauth
# Mock OAuth server listening on http://localhost:4500
```

Then set this in `.env` and restart the app (`OAUTH_MOCK_BASE_URL` is read by all three strategies — when unset, they talk to the real providers as normal):

```
OAUTH_MOCK_BASE_URL=http://localhost:4500
```

### Drive the flow with curl

```bash
# 1. Initiate - requires the same GDPR consent gate as password registration
curl -sD - -o /dev/null "http://localhost:3000/auth/google?termsAccepted=true" | grep -i location
# => Location: http://localhost:4500/google/authorize?...&redirect_uri=...&client_id=...

# 2. Copy that Location header and append &email=<whatever fake email you want to test with>,
#    then hit it (the mock server "authorizes" instantly, no login UI):
curl -sD - -o /dev/null "http://localhost:4500/google/authorize?...&email=alice@example.com" | grep -i location
# => Location: http://localhost:3000/auth/google/callback?code=...&state=...

# 3. Hit the callback URL exactly as our app issued it - this is the real app code path,
#    identical to what a browser would do after a real provider redirect:
curl "http://localhost:3000/auth/google/callback?code=...&state="
# => {"access_token":"...","refresh_token":"..."} - same shape as POST /auth/login
```

Swap `google` for `github` or `microsoft` in steps 1–3 to test the other two providers — same three-step shape each time.

### Verified with this mock during development

- All three providers complete the full flow and return a working `access_token`/`refresh_token`.
- A second OAuth login with the same `email` reuses the same `User`/`OAuthAccount` row (same `sub` in the JWT) rather than creating a duplicate.
- Logging in via OAuth with an email that matches an **existing password-based account** links the new `OAuthAccount` to that existing user (verified by checking the `User`/`OAuthAccount` tables directly) rather than creating a second account.
- Omitting `?termsAccepted=true` on the initiate step is rejected with `400` before the redirect to the (mock or real) provider ever happens.

### Limitations of this mock

- It only proves the **app's side** of the integration (guard chain → strategy `validate()` → controller → `AuthService.loginWithOAuth` → session/JWT/audit). It does not catch a mismatch between the mock's fake profile shape and what a real provider actually returns tomorrow (e.g. Google changing its userinfo schema) — that class of risk still needs an occasional real smoke test against the actual provider.
- Google's `email_verified: false` rejection path and GitHub's "no email returned" rejection path are exercised by unit tests (`*.strategy.spec.ts`), not by this mock server, since the mock always returns a verified email by default.
