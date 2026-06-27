# 🔔 Production Architectural Manual: Notification Service (`services/notification-service/`)

The Notification Service is an event-driven, decoupled worker utility responsible for handling all customer-facing alerts, transaction receipts, security warnings, and compliance dispatches (Email, SMS, Push Notification).

Following microservice independence laws, **this service operates purely as a reactive consumer**. It exposes zero public HTTP endpoints and relies entirely on asynchronous message queues via RabbitMQ to process tasks out-of-band without blocking critical financial execution loops.

---

## 1. Database Domain Schema (`notification_db`)

The Notification Service tracks message dispatch lifecycles, delivery state confirmations, and third-party provider tracking tokens to guarantee idempotency and audit capability.

```sql
-- PostgreSQL Production Schema Migration Baseline

CREATE TABLE IF NOT EXISTS notification_logs (
    id VARCHAR(26) PRIMARY KEY, -- Strict time-sortable ULID
    user_id UUID NOT NULL, -- Logical reference link to user profile
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('EMAIL', 'SMS', 'PUSH')),
    template_name VARCHAR(100) NOT NULL,
    recipient_target VARCHAR(255) NOT NULL, -- e.g., 'user@email.com' or '+919999999999'
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'DELIVERED')),
    provider_name VARCHAR(50) NOT NULL, -- e.g., 'Twilio', 'SendGrid', 'Firebase'
    provider_reference_id VARCHAR(255) DEFAULT NULL, -- External tracking ID
    retry_count INT NOT NULL DEFAULT 0,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

```

### Indexing Strategy

- `CREATE INDEX idx_notifications_user_history ON notification_logs(user_id, created_at DESC);` — Speeds up profile-bound communication activity streams for customer support tools.
- `CREATE INDEX idx_notifications_failed_retry ON notification_logs(status, retry_count) WHERE status = 'FAILED';` — Optimizes background sweeping workers designed to pick up dropped dispatches for exponential retries.

---

## 2. Event-Driven Contract Topology & Inbound Consumers

This service binds exclusively to multiple global topic exchanges. It listens for core domain changes and converts them into localized consumer templates.

```text
                  ┌──────────────────────────────────────────────┐
                  │          RabbitMQ Message Exchanges          │
                  └──────┬──────────────────┬─────────────────┬──┘
                         │                  │                 │
     fintech.users       │   fintech.ledger │                 │ fintech.transfers
     (user.registered)   ▼   (balance.drop) ▼                 ▼ (transfer.completed)
    ┌──────────────────────┐┌────────────────┐┌─────────────────────────┐
    │     Queue Name:      ││  Queue Name:   ││       Queue Name:       │
    │ notification.welcome ││notification.tx ││notification.transfer_ok│
    └──────────┬───────────┘└───────┬────────┘└────────────┬────────────┘
               │                    │                      │
               └──────────┐         │         ┌────────────┘
                          ▼         ▼         ▼
                     ┌─────────────────────────┐
                     │  Notification Service   │
                     └────────────┬────────────┘
                                  │
               Triggers Out-of-Band Dispatches
                                  ▼
                     ┌─────────────────────────┐
                     │ External Gateways       │
                     │ (SendGrid / Twilio / FCM)
                     └─────────────────────────┘

```

### Events Consumed & Processing Mapping

1. **`user.registered` (From `auth-service`)**

- _Queue Name:_ `notification-service.welcome_email`
- _Action:_ Compiles the secure verification HTML payload utilizing the generated `verificationToken` parameter and pushes it to SendGrid.

2. **`transfer.completed` (From `transfer-service`)**

- _Queue Name:_ `notification-service.transfer_receipt`
- _Action:_ Instantly fires two concurrent jobs: an SMS confirmation through Twilio to the sender, and a real-time mobile push notification through Firebase to the recipient account holder.

3. **`user.kyc_status_changed` (From `user-service`)**

- _Queue Name:_ `notification-service.kyc_alert`
- _Action:_ Notifies the user if their profile validation documents were successfully approved or rejected, dynamically embedding localized remediation instructions.

---

## 3. Structural Idempotency & Resiliency Framework

### Consumer Message Deduplication Invariant

Because RabbitMQ guarantees "at-least-once" delivery, network disruptions can cause identical events to be delivered multiple times. The Notification Service implements a strict **Inbox Pattern** using the unique `eventId` from the incoming message envelope. The consumer opens an internal database transaction loop that checks if the `eventId` has already been recorded in a local deduplication registry; if a match occurs, it drops the duplicate and acknowledges the message.

### Fail-Safe Thresholds

All communication integrations utilize **Exponential Backoff with Jitter** (ADR-012) to retry external provider requests. If an external API remains broken after 5 retry attempts, the log transitions to `FAILED` to prevent service thread pool depletion.

---

## 4. Comprehensive Testing Strategy

### Unit Testing Targets (Vitest)

- **Template Engine Compilation Invariant:** Feed the rendering layout engine an execution payload missing critical variable constraints (e.g., a `transfer.completed` transaction message missing an `amountPaise` variable). Assert that the compiler throws a validation exception before attempting to execute external network requests.

#### Integration Testing Targets (Docker-Isolated Environment)

- **Inbox Pattern Deduplication Verification:** Publish two identical `transfer.completed` event frames with an identical `eventId` into the mock RabbitMQ routing instance. Run the integration consumer suite. Assert that only a single log row is appended to `notification_logs`, and that the AMQP framework cleanly flags both items as successfully parsed (`ack`).
- **Provider Resiliency Simulation:** Mock the external SendGrid API client wrapper to respond with a transient `502 Bad Gateway` network code for the first three execution hits, and a successful `200 OK` on the fourth hit. Execute the loop. Assert that the notification worker retries sequentially using your backoff timing constraints and ultimately updates the status to `SENT` without lost context.

### Chaos Testing Matrix

- **Downstream Outage Thread Pooling Test:** Use a tool like Toxiproxy to simulate an absolute, persistent hang (infinite connection block) on the Twilio SMS endpoint gateway. Flood the notification worker queue with 1,000 rapid SMS alert frames. Assert that the service's internal circuit breakers switch to an open state, fast-failing subsequent transactions to protect container memory buffers from crashing.
