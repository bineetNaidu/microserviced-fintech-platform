# ADR 008: Cursor-Based Pagination

**Date**: 2026-06-26
**Status**: Accepted

## Context

Standard OFFSET / LIMIT pagination in SQL becomes exponentially slower on large ledger tables because the database must scan and skip rows.

## Decision

Use ULID-based cursors (WHERE id > :last_id LIMIT 20).

## Consequences

### Positive

- Constant O(1) query time regardless of table size.
- Consistent results even when new records are inserted between page requests.
- More efficient use of database indexes compared to OFFSET-based queries.

### Negative

- Does not support jumping to an arbitrary page number (e.g., "go to page 47").
- Clients must store and pass the cursor value between requests.
- Sorting by columns other than the cursor key requires additional care.
