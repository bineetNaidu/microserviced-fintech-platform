# ADR 010: RabbitMQ Topic Exchanges

**Date**: 2026-06-26
**Status**: Accepted

## Context

Services need to broadcast events (e.g., transfer.completed), but multiple unknown services might need to listen (Notifications, Audit, Reporting).

## Decision

RabbitMQ Topic Exchanges will be used for pub/sub decoupled routing, allowing consumers to dynamically bind to wildcard routing keys (transfer.\*).

## Consequences

### Positive

- Publishers and consumers are fully decoupled; publishers do not need to know who is listening.
- New consumers can be added without modifying the publisher.
- Wildcard routing keys provide flexible subscription patterns.

### Negative

- Requires careful management of exchange and queue naming conventions.
- Debugging message routing issues can be more complex than direct point-to-point messaging.
