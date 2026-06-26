# ADR 013: Circuit Breakers on Sync Calls

**Date**: 2026-06-26
**Status**: Accepted

## Context

If the account-service hangs, the api-gateway will exhaust all its threads waiting for it, bringing down the whole platform.

## Decision

Implement standard Circuit Breakers (e.g., via opossum). If a service fails X times, the circuit opens and fails-fast immediately to protect thread pools.

## Consequences

### Positive

- Protects the calling service's thread pool from exhaustion caused by a slow or unresponsive downstream service.
- Allows the system to fail fast and return errors quickly rather than hanging indefinitely.
- Gives downstream services time to recover without being overwhelmed by continued requests.

### Negative

- Requires careful tuning of failure thresholds and timeout windows to avoid opening circuits too aggressively.
- Adds operational complexity; teams must monitor circuit states and understand half-open recovery behavior.
