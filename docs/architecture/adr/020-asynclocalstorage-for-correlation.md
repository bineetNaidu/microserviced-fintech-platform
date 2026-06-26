# ADR 020: AsyncLocalStorage for Correlation

**Date**: 2026-06-26
**Status**: Accepted

## Context

Tracking a single request as it jumps through middlewares, controllers, and services is impossible without a trace ID. Passing req.traceId into every single function manually is tedious.

## Decision

Use Node.js AsyncLocalStorage in the shared middleware to automatically propagate the X-Correlation-ID to all Pino logs and outgoing Axios/RabbitMQ calls implicitly.

## Consequences

### Positive

- Correlation IDs are automatically available in all log lines and outgoing calls without manually threading them through every function signature.
- Simplifies debugging and distributed tracing significantly.
- Consistent implementation via shared middleware ensures all services behave the same way.

### Negative

- Developers must be aware of AsyncLocalStorage semantics to avoid losing context in certain async patterns (e.g., some stream or worker thread usages).
- Slight overhead from AsyncLocalStorage context propagation, though negligible in practice for typical request loads.
