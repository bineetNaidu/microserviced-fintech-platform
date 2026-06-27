# 👥 Production Architectural Manual: User Service (`services/user-service/`)

This document establishes the production-grade specification for the User Profile & Compliance boundary. The User Service tracks legal identities, personal configurations, and Know Your Customer (KYC) progression vectors.

## 1. Database Domain Schema (`user_db`)

The User Service maintains a dedicated database completely isolated from credential concerns.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY, -- Coordinated UUID matching auth_db users.id exactly
    email VARCHAR(255) NOT NULL UNIQUE, -- Denormalized for rapid searching
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) DEFAULT NULL,
    date_of_birth DATE DEFAULT NULL,
    address_line_1 VARCHAR(255) DEFAULT NULL,
    address_line_2 VARCHAR(255) DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    state VARCHAR(100) DEFAULT NULL,
    postal_code VARCHAR(20) DEFAULT NULL,
    country CHAR(2) NOT NULL DEFAULT 'IN',
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (kyc_status IN ('pending', 'submitted', 'verified', 'rejected', 'suspended')),
    kyc_verified_at TIMESTAMPTZ DEFAULT NULL,
    kyc_verified_by UUID DEFAULT NULL, -- Refers to Admin user ID
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
    language CHAR(2) NOT NULL DEFAULT 'en',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    sms_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    push_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
    transfer_notification_threshold BIGINT DEFAULT 0, -- Stored in paise
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL
        CHECK (document_type IN ('aadhaar', 'pan', 'passport', 'driving_licence')),
    document_number VARCHAR(50) NOT NULL,
    document_reference VARCHAR(255) DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT DEFAULT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ DEFAULT NULL,
    reviewed_by UUID DEFAULT NULL
);

```

### Indexing Strategy

- `UNIQUE INDEX idx_profiles_email ON user_profiles(email) WHERE deleted_at IS NULL;`
- `INDEX idx_profiles_kyc_search ON user_profiles(kyc_status, is_active);` — Optimizes regulatory compliance batch filtering sweeps.
- `INDEX idx_profiles_composite_name ON user_profiles(last_name, first_name) WHERE deleted_at IS NULL;` — Enables rapid operational back-office pattern matches.

---

## 2. API Path Matrix & Payload Contracts

### Identity Extraction Guard

All user-facing endpoints (`/me` routes) explicitly ignore any raw user IDs provided in the request body. They extract the caller's context strictly from `req.authenticatedUser.userId` populated by the gateway reverse-proxy verification layer.

#### Endpoint Definitions

##### `GET /v1/users/me`

- **Security Interceptors:** Enforces active access token verification.
- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "id": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "email": "user@domain.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone_number": "+919876543210",
    "kycStatus": "pending",
    "preferences": {
      "language": "en",
      "timezone": "Asia/Kolkata"
    }
  },
  "meta": null,
  "error": null
}
```

##### `PATCH /v1/users/me`

- **Security Interceptors:** Private.
- **Request Body (`UpdateProfileDto`):** Only mutable fields are permitted (`firstName`, `lastName`, `phone_number`, `preferences`). `email` mutations are blocked to safeguard against hijacking loops.

##### `GET /v1/users/internal/:userId`

- **Security Interceptors:** Private cluster routing layer. Blocks external public requests via Gateway controls. Mandates internal service token matches (`X-Internal-API-Key`).
- **Purpose:** Allows the `transfer-service` to run fail-fast synchronous compliance limits checking on boot loops before spawning Sagas.
- **Response Payload (`200 OK`):**

```json
{
  "success": true,
  "data": {
    "id": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "kycStatus": "verified",
    "isActive": true
  },
  "meta": null,
  "error": null
}
```

---

## 3. Event-Driven Contract Topology

```text
                       ┌─────────────────────────┐
                       │      Auth Service       │
                       └────────────┬────────────┘
                                    │
                                    │ Publishes event: user.registered
                                    ▼
                      ┌───────────────────────────┐
                      │ exchange: fintech.users   │
                      └─────────────┬─────────────┘
                                    │
                                    │ Delivered to bound queue
                                    ▼
                      ┌───────────────────────────┐
                      │ Queue:                    │
                      │ user-service.profile      │
                      └─────────────┬─────────────┘
                                    │
                                    │ Consumed asynchronously
                                    ▼
                       ┌─────────────────────────┐
                       │      User Service       │
                       └────────────┬────────────┘
                                    │
                                    │ Publishes downstream update
                                    ▼
                      ┌───────────────────────────┐
                      │ exchange: fintech.users   │
                      └─────────────┬─────────────┘
                                    │
                                    │ routingKey: user.kyc_status_changed
                                    ▼
                       ┌─────────────────────────┐
                       │ Bound Consumers:        │
                       │ - account-service       │
                       │ - notification-service  │
                       └─────────────────────────┘

```

### Events Published

- **`user.kyc_status_changed`**
- _Routing Key:_ `user.kyc_status_changed`
- _Payload:_

```json
{
  "eventId": "evt_2c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "eventType": "user.kyc_status_changed",
  "producerService": "user-service",
  "correlationId": "corr_f4a2c1e8...",
  "payload": {
    "userId": "c7a8b3d2-09e4-41bf-b1a3-2bfb2649a212",
    "previousStatus": "submitted",
    "newStatus": "verified",
    "changedBy": "adm_8b3d9a12..."
  },
  "occurredAt": "2026-06-27T14:30:00.000Z"
}
```

#### Events Consumed

- **`user.registered` (From `auth-service`)**: Spawns the data transaction to create localized metadata profiles.
- **`operations.kyc_approved` / `operations.kyc_rejected**`: Handles back-office review results to update status pools.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **KYC Progression Limits:** Test the legal transition engine logic. Verify that pushing a status modification from `REJECTED` directly to `VERIFIED` without a valid interim `SUBMITTED` document reference throws a strict `ValidationError`.

#### Integration Testing Targets (Docker-Isolated Environment)

- **Idempotent Queue Consumer Registration:** Feed the AMQP consumer twin identical instances of a `user.registered` event envelope containing the same payload and `eventId`. Run the execution sweep. Assert that the second identical message does _not_ trigger duplicate row serialization inserts or break execution flows—silently short-circuiting with a clean message acknowledgement (`ack`).
- **Cross-Boundary Exploitation Defense:** Simulate a malicious actor passing an arbitrary `userId` to `PATCH /v1/users/me`. Ensure that your router controller actively discards that variable, extracting the filter criteria solely from the validated token session claims.

#### Chaos Testing Matrix

- **Network Drift During Initialization:** Inject an artificial database latency packet delay (e.g., 5000ms via Toxiproxy) on the `user_db` cluster pool while consuming `user.registered`. Force the consumer execution pool to hit its timeout threshold. Assert that the local transaction block safely executes a full rollback, leaving the data clean, and issues a negative acknowledgement (`nack`) to RabbitMQ to guarantee safe event delivery retry loops.

## 5. 🌐 Event-Driven Communication: Auth Service ↔ User Service

In a production-grade microservices system, the **Auth Service** and **User Service** are completely decoupled at the database and network layers. They communicate asynchronously using **RabbitMQ topic exchanges**. Here is exactly how that data lifecycle flows:

1. **The Registration Event:** When a user registers via `POST /v1/register`, the Auth Service writes the absolute minimum credentials (`id`, `email`, `password_hash`, `role`) to `auth_db`. It wraps this structural change inside a standardized AMQP message envelope (`EventEnvelope<T>`) and publishes it to the `fintech.users` topic exchange with the routing key `user.registered`.
2. **The Queue & Consumer Binding:** RabbitMQ reads the routing key and delivers a copy of the message into the `user-service.profile` queue, which is bound to that exchange. The User Service runs an active, type-safe consumer loop that listens to this queue.
3. **Reactive Profile Provisioning:** Upon receiving the message, the User Service extracts the universally coordinated `userId` and `email`. It opens a local transaction block in `user_db` to seamlessly provision the profile layout (`user_profiles`) and default configurations (`user_preferences`) without blocking the client's initial registration request.
