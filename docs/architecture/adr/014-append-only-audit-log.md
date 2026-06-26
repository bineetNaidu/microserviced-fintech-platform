# ADR 014: Append-Only Audit Log

**Date**: 2026-06-26
**Status**: Accepted

## Context

Financial regulations require proof that compliance data wasn't tampered with by developers.

## Decision

The audit-service will use a database user that only has INSERT and SELECT grants. UPDATE and DELETE will be strictly revoked at the Postgres engine level.

## Consequences

### Positive

- Provides cryptographic-grade assurance that audit records cannot be modified or deleted, even by developers with database access.
- Satisfies financial regulatory requirements for tamper-evident logs.
- Simplifies compliance audits by ensuring log integrity at the database permission level.

### Negative

- Storage grows indefinitely since records can never be deleted; a data archival strategy must be planned separately.
- Correcting erroneous audit entries requires inserting a compensating record rather than fixing the original.
