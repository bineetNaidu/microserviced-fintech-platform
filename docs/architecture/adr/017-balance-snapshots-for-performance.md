# ADR 017: Balance Snapshots for Performance

**Date**: 2026-06-26
**Status**: Accepted

## Context

Summing 50,000 ledger entries just to show a user their dashboard balance is too slow (resolving ADR-003's tradeoff).

## Decision

The ledger-service will generate a materialized snapshot of the balance at the end of each day. The active balance is calculated by Yesterday's Snapshot + Today's Entries.

## Consequences

### Positive

- Dashboard balance queries are fast regardless of total ledger history size.
- Preserves the immutability and correctness guarantees of the double-entry system from ADR-003.
- Today's entries are still small in number and fast to sum, keeping query times bounded.

### Negative

- Snapshot generation must be a reliable scheduled job; failures must be detected and retried.
- Balance calculation logic must account for the snapshot + delta pattern, adding complexity versus a simple sum.
