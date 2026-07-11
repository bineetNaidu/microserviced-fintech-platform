# Authentication Service (`@fintech/auth-service`)

The Authentication Service handles core credential management, user registration, multi-device session tracking, refresh token rotation, brute-force locking, and verification loops. It serves as the primary security gateway for the entire fintech microservice mesh.

---

## Features

- **Robust Registration & Activation**: Registers user accounts under the secure `CUSTOMER` role, generates email verification tokens, and schedules verification emails by publishing message envelopes to RabbitMQ.
- **Short-Lived Access Tokens (JWT)**: Signs access credentials using the symmetric `jose` HS256 algorithm. Embeds role-based routing permissions (`VIEW_OWN_ACCOUNTS`, `INITIATE_TRANSFER`, etc.) directly into claims.
- **Stateful Refresh Token Rotation**: Implements HttpOnly cookies containing rotated refresh tokens mapping to database sessions.
- **Brute Force Cooldown Locking**: Locks accounts temporarily for **15 minutes** after **5 consecutive failed attempts** to protect against automated dictionary attacks.
- **Automatic Token Theft Defense**: If an already revoked or rotated refresh token is presented, the system flags a theft anomaly, immediately invalidates **all active sessions** for that user ID, and forces a full re-authentication.
- **Kubernetes Probes**: Exposes standard `/health/live` and `/health/ready` check probes evaluating PostgreSQL and Redis dependency loops.

---

## Technology Stack

- **Framework**: Express (TypeScript)
- **Database Mapping**: Drizzle ORM mapping to PostgreSQL connection pools
- **In-Memory Store**: Redis (handles access token JTI revocation/blocklists)
- **Messaging Pipeline**: AMQP (RabbitMQ) event-driven integration via `@fintech/shared-messaging`
- **Validation**: Zod (strict HTTP request schemas)

---

## Directory Structure

```
services/auth-service/
├── db/
│   └── migrations/          # Automatically generated SQL migrations
├── src/
│   ├── config/              # Zod environment loaders
│   ├── controllers/         # HTTP endpoint handlers
│   ├── db/
│   │   └── schema.ts        # Drizzle database table definitions
│   ├── events/
│   │   └── publishers/      # RabbitMQ event publishers
│   ├── repositories/        # Drizzle database queries (User, Session, Token)
│   ├── routes/
│   │   └── v1/              # Endpoint paths (auth, health)
│   ├── services/            # Core business logic (hashing, rotation, lockout)
│   ├── types/               # Type and claims definitions
│   ├── app.ts               # Express configuration pipeline
│   └── server.ts            # Bootstrapper and graceful shutdown drains
├── drizzle.config.ts        # Drizzle Kit CLI compiler configuration
├── package.json
└── tsconfig.json
```

---

## Configuration (Environment Variables)

Ensure the following variables are defined in the execution context:

| Variable       | Description                                         | Example                                      |
| :------------- | :-------------------------------------------------- | :------------------------------------------- |
| `PORT`         | TCP port bound by the HTTP listener                 | `3000`                                       |
| `NODE_ENV`     | Target environment mode                             | `development` / `production`                 |
| `SERVICE_NAME` | Identifier used for correlation logs                | `auth-service`                               |
| `JWT_SECRET`   | Symmetric key utilized to sign JWTs (min. 32 chars) | `super_secret_signing_key_at_least_32_chars` |
| `DATABASE_URL` | PostgreSQL connection string                        | `postgresql://user:pass@localhost:5432/db`   |
| `REDIS_URL`    | Redis cache connection string                       | `redis://localhost:6379/0`                   |
| `RABBITMQ_URL` | RabbitMQ broker connection string                   | `amqp://localhost:5672`                      |

---

## Database Migrations

This service uses **Drizzle Kit** to automate PostgreSQL migration generation.

### 1. Generate Migrations

Run this command from the monorepo root directory after altering `src/db/schema.ts` to build the required SQL statements:

```bash
npx drizzle-kit generate --config=services/auth-service/drizzle.config.ts
```

### 2. Apply Migrations

Run this command to execute the generated migrations against your database connection target:

```bash
npm run db:migrate --workspace=@fintech/auth-service
```

---

## API Contract Summary

All route prefixes are mapped under the `/v1` namespace.

### Public Endpoints

#### Register Account

- **Path**: `POST /v1/register`
- **Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response**: `201 Created`

#### Verify Email

- **Path**: `POST /v1/verify-email`
- **Payload**:
  ```json
  {
    "token": "verification-uuid-token"
  }
  ```
- **Response**: `200 OK`

#### Login (Authenticate Credentials)

- **Path**: `POST /v1/login`
- **Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response**: `200 OK`
- **Behavior**: Returns `accessToken` in payload and sets HttpOnly cookie `refreshToken` restricted to path `/api/v1/auth`.

#### Refresh Access Credentials

- **Path**: `POST /v1/refresh`
- **Payload**: (Optional if Cookie is present)
  ```json
  {
    "refreshToken": "optional-fallback-token"
  }
  ```
- **Response**: `200 OK` (Rotates the refresh cookie and returns a new short-lived `accessToken`).

#### Recover Password (Forgot Loop)

- **Path**: `POST /v1/forgot-password`
- **Payload**:
  ```json
  {
    "email": "user@example.com"
  }
  ```
- **Response**: `200 OK` (Returns success silently even if user email does not exist to prevent scanner enumeration attacks).

#### Reset Password

- **Path**: `POST /v1/reset-password`
- **Payload**:
  ```json
  {
    "token": "reset-uuid-token",
    "password": "NewSecurePassword123!"
  }
  ```
- **Response**: `200 OK` (Resets credentials and terminates all existing sessions immediately).

---

### Protected Endpoints (Requires Bearer Token)

#### Terminate Session (Logout)

- **Path**: `POST /v1/logout`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` (Revokes refresh token, deletes HttpOnly cookie, blocklists active access token JTI in Redis).

#### List Active Sessions

- **Path**: `GET /v1/sessions`
- **Headers**: `Authorization: Bearer <token>`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "sessions": [
        {
          "id": "session-uuid",
          "device": "Mozilla/5.0...",
          "ip": "127.0.0.1",
          "createdAt": "2026-07-11T12:00:00Z",
          "lastUsedAt": "2026-07-11T12:30:00.000Z"
        }
      ]
    }
  }
  ```

#### Revoke Specific Session

- **Path**: `DELETE /v1/sessions/:sessionId`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` (Revokes the target session by ID, blocking subsequent refresh attempts).

---

## Security Designs

### 1. Brute-Force Authentication Lock

- Counter tracking consecutive authentication failures is incremented per user.
- Upon reaching **5 consecutive login failures**, a temporary lockout block activates.
- For the next **15 minutes**, any further authentication request triggers a `403 Forbidden` response returning the remaining lockout minutes.
- The lockout is cleared automatically on the next successful credentials verification.

### 2. Token Theft Defense

- Refresh tokens are single-use. Each rotation yields a new refresh token and flags the previous token as revoked inside the PostgreSQL database.
- If a user sends a token that has **already been marked revoked**, this indicates token theft (i.e. a malicious party intercepted the cookie and rotated the token first, or vice-versa).
- The system automatically triggers defense logic:
  - Looks up the session owner.
  - Revokes **every single session** currently open for that user ID.
  - Rejects the request with `401 Unauthorized`.
  - Forces both the legitimate user and attacker to re-authenticate from scratch.
