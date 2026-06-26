# ADR 016: OpenTelemetry Instrumentation

**Date**: 2026-06-26
**Status**: Accepted

## Context

We don't want to be locked into Datadog, New Relic, or Jaeger specific agents.

## Decision

Use OpenTelemetry (OTel) standards for traces, metrics, and logs. We can point the OTel Collector to any vendor later without changing application code.

## Consequences

### Positive

- Full vendor portability; switching observability backends requires only OTel Collector configuration changes, not application code changes.
- A single instrumentation standard covers traces, metrics, and logs.
- Large ecosystem of auto-instrumentation libraries for Node.js, reducing manual effort.

### Negative

- OTel SDK and Collector add operational complexity compared to a single vendor agent.
- The OTel standard is still evolving; some features may be less mature than vendor-specific agents.
