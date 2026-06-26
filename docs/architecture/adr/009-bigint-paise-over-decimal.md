# ADR 009: BigInt Paise over Decimal

**Date**: 2026-06-26
**Status**: Accepted

## Context

JavaScript and IEEE 754 floating-point numbers cause rounding errors (0.1 + 0.2 = 0.30000000000000004).

## Decision

All monetary amounts are handled as BIGINT integers representing the smallest unit (paise). ₹100.50 is stored as 10050.

## Consequences

### Positive

- Eliminates all floating-point rounding errors from monetary calculations.
- Integer arithmetic is predictable and exact.
- Consistent representation across the database (PostgreSQL BIGINT) and application layer.

### Negative

- All display logic must convert from paise to rupees, requiring careful formatting at the presentation layer.
- Developers must be disciplined about never mixing paise and rupee values in calculations.
