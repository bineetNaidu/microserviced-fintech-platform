# ADR 003: Double-Entry Accounting over Balance Column

**Date**: 2026-06-26
**Status**: Accepted

## Context

Storing user balances as a mutable balance column allows race conditions, lost updates, and provides zero audit history of how the balance reached that number.

## Decision

The ledger-service will strictly use an append-only double-entry system (Total Debits = Total Credits). Balances are dynamically calculated by summing entries.

## Consequences

### Positive

- Mathematical certainty in all balance calculations.
- Easy reconciliation at any point in time.
- Absolute immutability of financial records — no entry is ever modified or deleted.
- Complete audit history of every transaction.

### Negative

- Querying balances becomes heavier as it requires summing all historical entries (solved via ADR-017 with balance snapshots).
