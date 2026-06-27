# 🔐 Production Architectural Manual: Auth Service (`services/auth-service/`)

This document establishes the production-grade specification for the Identity & Access Management boundary. The Auth Service handles credential life cycles, secure session verification, and asymmetric token signatures. It remains strictly decoupled from downstream user profiles.

---

## 1. Database Domain Schema (`auth_db`)

The Auth Service owns an isolated database instance. To guarantee absolute security, the application database engine user has its privileges restricted per-table.

### Primary Key Strategy

All tables explicitly utilize cryptographically random UUID v4 primary keys (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`). This eliminates sequence scanning and resource enumeration attacks.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'support_agent', 'auditor', 'manager', 'admin')),
    is_email_verified BOOLEAN NOT NULL DEFAULT false,
    is_suspended BOOLEAN NOT NULL DEFAULT false,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
    user_agent TEXT DEFAULT NULL,
    ip_address INET DEFAULT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing Strategy

- `UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;` — Optimizes lookup during authentication passes.
- `INDEX idx_sessions_refresh_token ON sessions(refresh_token_hash);` — Forces $O(1)$ token matching during rotation flows.
- `INDEX idx_sessions_user_id ON sessions(user_id) WHERE is_revoked IS FALSE;` — Optimizes profile active-session clear passes.

---

## 2. API Path Matrix & Payload Contracts

The service routes are validated utilizing strong schema parameters. Downstream handlers do not accept raw user inputs without contract matching.

### Standard API Wrapper Constraints

All successful JSON responses are delivered through the global wrapper contract:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta: null;
  error: null;
}
```

#### Endpoint Definitions

##### `POST /v1/register`

- **Security Interceptors:** Public. Global rate-limiter applied at gateway layer.
- **Request Body (`RegisterDto`):**

```json
{
  "email": "user@domain.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

- **Response Payload (`201 Created`):**

```json
{
  "success": true,
  "data": {
    "message": "Registration successful. Verification sequence initiated."
  },
  "meta": null,
  "error": null
}
```

##### `POST /v1/login`

- **Security Interceptors:** Public. Enforces a maximum constraint of 5 failed login attempts per IP per 15 minutes tracked in Redis to defend against distributed brute-force strikes.
- **Request Body (`LoginDto`):**

```json
{
  "email": "user@domain.com",
  "password": "SecurePassword123!"
}
```

- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
      "email": "user@domain.com",
      "role": "customer"
    }
  },
  "meta": null,
  "error": null
}
```

_Note: Simultaneously appends an immutable `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000` header to block client XSS token scraping._

##### `POST /v1/refresh`

- **Security Interceptors:** Public. Automatically extracts the encrypted `refreshToken` from the cookie jar.
- **Response Payload (`200 OK`):** Enforces **one-time usage refresh token rotation**. If an already-rotated token is ever re-sent, the service interprets this as token theft, revokes the user's entire session family tree, and forces a hard re-authentication sequence.

##### `DELETE /v1/logout`

- **Security Interceptors:** Requires active verification middleware.
- **Response Payload (`200 OK`):** Deletes the refresh token database record and inserts the token's unique string `jti` into the Redis blocklist for its remaining lifetime, ensuring immediate token revocation.

---

## 3. Event-Driven Contract Topology

The Auth Service relies purely on asynchronous AMQP topic exchanges to notify downstream layers without establishing tight network boundaries.

```text
                             ┌─────────────────┐
                             │  Auth Service   │
                             └────────┬────────┘
                                      │
                   Publishes Events   │
                   (Topic Exchange)   ▼
                  ┌──────────────────────────────────────┐
                  │ exchange: fintech.users              │
                  └───────────────────┬──────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │ routingKey:             │ routingKey:             │ routingKey:
            │ user.registered         │ user.logged_in          │ user.suspended
            ▼                         ▼                         ▼
 ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
 │ Queue:               │  │ Queue:               │  │ Queue:               │
 │ user-service.profile │  │ audit-service.login  │  │ account-service.halt │
 └──────────────────────┘  └──────────────────────┘  └──────────────────────┘

```

### Events Published

- **`user.registered`**
- _Routing Key:_ `user.registered`
- _Payload:_

```json
{
  "eventId": "evt_9b3d21f0-4a81-421c-be3a-029fb1e20211",
  "eventType": "user.registered",
  "producerService": "auth-service",
  "correlationId": "corr_c8b1a2d4...",
  "payload": {
    "userId": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "email": "user@domain.com",
    "role": "customer",
    "verificationToken": "vtok_8f2d1e0a..."
  },
  "occurredAt": "2026-06-26T22:51:00.000Z"
}
```

- **`user.logged_in`**
- _Routing Key:_ `user.logged_in`
- _Payload:_ Maps user connection parameters (`sessionId`, `ipAddress`, `userAgent`) to the `audit-service`.

#### Events Consumed

- **`operations.user_suspended`**
- _Exchange Target:_ `fintech.operations`
- _Action Engine:_ Catches admin actions, mutates `is_suspended = true` on the database row, and dynamically pushes active session tokens into the cluster Redis blocklist to cut user interactions within 60 seconds.

---

## 4. Comprehensive Testing Strategy

To defend the platform against security drift, testing must cover both crypto math and state invariants.

### Unit Testing Targets (Vitest)

- **Password Cryptography Guard:** Test that passwords hash uniquely with a fixed **bcrypt workload cost factor of 12**. Ensure that a string-comparison mismatch triggers a timing-safe evaluation drop to eliminate side-channel timing analysis vectors.
- **Asymmetric Key Sign Invariants:** Mock the RSA filesystem calls and verify that generated JWT payloads match the strict claims structure (`sub`, `role`, `sessionId`, `jti`) and are verifiably signed by the private key.

### Integration Testing Targets (Docker-Isolated Environment)

- **Brute-Force Lockout Sequence:** Inject 5 sequential failed login calls from a single IP within a loop. Assert that the 6th call hits a strict `429 Too Many Requests` state, even if the user credentials passed on the 6th attempt are perfectly valid.
- **Token Rotation Hijack Defense:**

1. Authenticate a test user, retrieve access token `A1` and refresh token `R1`.
2. Call `/v1/refresh` with `R1` to simulate an attacker request. Ensure token `R2` is issued and `R1` is neutralized.
3. Re-call `/v1/refresh` with `R1` to simulate the victim request.
4. Assert that the service flags a unique constraint collision on `refresh_token_hash`, marks the session as `is_revoked = true`, and wipes out the user's active session footprint.

### Chaos Testing Matrix

- **Redis Blocklist Partitioning:** Break connection bounds between the Auth Service and the Redis cluster cache. Execute a user access attempt with a token marked for termination. Assert that the architecture **fails closed**—rejecting token routing maps with a clean `503 Service Unavailable` response rather than allowing unverified access across backend systems.
