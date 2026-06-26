# ADR 011: Idempotent Consumers

**Date**: 2026-06-26
**Status**: Accepted

## Context

RabbitMQ guarantees "at-least-once" delivery, meaning network blips can cause duplicate event delivery. We cannot credit an account twice.

## Decision

Every consumer will maintain an inbox_messages table. Event processing is wrapped in a DB transaction that first attempts to insert the event_id. If it violates the unique constraint, the event is ignored as a duplicate.

## Consequences

### Positive

- Guarantees exactly-once processing semantics at the application level despite at-least-once delivery.
- The inbox_messages table provides a built-in audit trail of all processed events.
- The deduplication logic is consistent and centralized per consumer.

### Negative

- Each consumer service requires an additional inbox_messages table in its database.
- Slightly increased database write overhead for every processed event.
