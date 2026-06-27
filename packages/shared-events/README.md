# @fintech/shared-events

The centralized message contract registry for the distributed event-driven fintech platform. This package provides strongly typed, machine-verifiable definitions for every asynchronous message broadcasted across the AMQP message broker (RabbitMQ).

---

## 🛠️ Architectural Rationale & Design Patterns

### 1. Unified Audit and Telemetry Envelope

In distributed message-driven topologies, tracking asynchronous operations across boundaries is a common failure point. If consumer services process bare data records without envelope tracing metadata, system audits and message replay actions become impossible.

Every event mapped in this workspace implements the global `EventEnvelope<T>` structure:

- **`id` (ULID):** Unique lexicographically sortable identifier enabling consumer services to execute deduplication routines efficiently.
- **`correlationId` (UUID):** Propagated out-of-band via trace contexts, allowing OpenTelemetry trackers to stitch HTTP gateway endpoints and downstream broker consumers into a unified tracing log.
- **`producer`:** Tracks the source container instance to simplify system profiling and trace debugging.

### 2. Immutability & Contract Preservation

Event definitions represent historical facts within the application lifecycle—they detail events that _have already occurred_. Consequently, these contracts are structurally immutable. Modifying fields within this registry must be managed strictly via forward-compatible structural extensions to prevent message parsing failures across system versions.

---

## 📁 Hierarchy Map

```text
EventEnvelope<T> (Unified Base Tracking Container)
 ├── AccountCreatedEvent ---------> Broadcasted when user configurations match banking rules
 ├── AccountStatusChangedEvent ---> Injects structural updates whenever compliance holds shift
 ├── TransferInitiatedEvent ------> Triggers initial balance checks inside the Saga pipeline
 ├── TransferStateTransitionEvent -> Ticks through core forward or compensating balances phases
 ├── ApprovalApprovedEvent -------> Injects Maker-Checker overrides to service logic loops
 └── ApprovalRejectedEvent -------> Drops administrative requests back to audit logs

```

---

## 💻 Concrete Usage Guide

### 1. Publishing an Event (Producer Service)

When publishing a message within a microservice component (e.g., `services/transfer-service/src/services/saga.engine.ts`), construct the complete event contract explicitly:

```typescript
import type { TransferInitiatedEvent } from '@fintech/shared-events';
import { ulid } from 'ulid';

async function broadcastTransferStarted(sagaRecord: any, correlationId: string) {
  const eventMessage: TransferInitiatedEvent = {
    id: ulid(),
    type: 'transfer.initiated',
    correlationId: correlationId,
    timestamp: new Date(),
    producer: 'transfer-service',
    data: {
      transferId: sagaRecord.id,
      fromAccountId: sagaRecord.fromAccountId,
      toAccountId: sagaRecord.toAccountId,
      amountPaise: sagaRecord.amountPaise,
      currency: sagaRecord.currency,
      idempotencyKey: sagaRecord.idempotencyKey,
    },
  };

  // Publish strictly typed envelope directly onto the AMQP Broker exchange
  await amqpChannel.publish(
    'financial-events-exchange',
    'transfer.initiated',
    Buffer.from(JSON.stringify(eventMessage)),
  );
}
```

### 2. Consuming and Processing Messages Safely (Consumer Service)

Use the typed schemas within background listeners (e.g., `services/ledger-service/src/workers/transfer.worker.ts`) to achieve parsing type-safety:

```typescript
import type { TransferInitiatedEvent } from '@fintech/shared-events';

export function handleIncomingBrokerMessage(rawPayload: Buffer) {
  // Parse the common envelope structure
  const envelope = JSON.parse(rawPayload.toString()) as TransferInitiatedEvent;

  // Enforce contract processing rules
  console.log(`Processing event [${envelope.id}] routed from ${envelope.producer}`);
  console.log(
    `Executing ledger balance updates for transfer reference: ${envelope.data.transferId}`,
  );

  // Business engines execute using verified primitive fields:
  const amount = envelope.data.amountPaise;
  const targetCurrency = envelope.data.currency;
}
```

---

## 🔍 Verification and Build Sequences

To register or alter system message payload parameters:

1. Complete structural configuration modifications within the corresponding `src/domain/` directory.
2. Regenerate workspace outputs:

```bash
# Clean historical builds and run compilation script
npm run build --workspace=@fintech/shared-events

# Dry-run signature structural verification check
npm run typecheck --workspace=@fintech/shared-events

```

---

### 🔍 Verification Rebuild Sequence

Let's execute a full validation clean run to confirm that our primitives, configurations, and errors packages connect cleanly across your workspaces:

```bash
npm run build --workspace=@fintech/shared-events
```
