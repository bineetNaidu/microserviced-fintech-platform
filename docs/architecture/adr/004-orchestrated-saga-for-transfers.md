# ADR 004: Orchestrated Saga for Transfers

**Date**: 2026-06-26
**Status**: Accepted

## Context

A money transfer spans multiple databases (Account limits, Ledger entries, Notifications). A failure mid-flight leaves the system in an inconsistent state.

## Decision

The transfer-service acts as a central Orchestrator (State Machine). If step 3 fails, it actively sends commands to reverse steps 1 and 2.

## Consequences

### Positive

- Clear visibility into the exact state of any transfer at all times.
- Avoids the "event ping-pong" confusion of choreographed sagas.
- Compensating transactions are explicitly managed, making failure recovery predictable.

### Negative

- The transfer-service becomes a central coordination point and must be highly reliable.
- More complex to implement than a simple synchronous call chain.
