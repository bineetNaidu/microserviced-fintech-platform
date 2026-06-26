# ADR 002: Database-per-Service Pattern

**Date**: 2026-06-26
**Status**: Accepted

## Context

A monolithic shared database causes high coupling; a schema change for the user-service could inadvertently break the ledger-service.

## Decision

Every microservice will have its own isolated PostgreSQL database/schema. Services can only communicate via HTTP or RabbitMQ, never by directly querying another service's tables.

## Consequences

### Positive

- Perfect domain isolation between services.
- Services can scale independently based on their own data requirements.
- Schema changes in one service cannot break other services.

### Negative

- Complex distributed transactions are required when an operation spans multiple services (solved via ADR-004).
- Data reporting and analytics that span multiple services become more difficult.
