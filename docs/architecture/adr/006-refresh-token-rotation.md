# ADR 006: Refresh Token Rotation

**Date**: 2026-06-26
**Status**: Accepted

## Context

Long-lived access tokens are dangerous. If a refresh token is stolen, an attacker has permanent access.

## Decision

Access tokens expire in 15 minutes. Refresh tokens are one-time use (Rotation). If a used refresh token is presented again, the system immediately revokes the entire token family (Theft Detection).

## Consequences

### Positive

- Short-lived access tokens limit the damage window if a token is intercepted.
- Refresh token rotation ensures stolen refresh tokens are detected and invalidated.
- Entire token families can be revoked immediately upon detection of theft.

### Negative

- Clients must implement logic to handle token refresh flows.
- In rare cases of network failure during token rotation, legitimate users may be logged out if the old token is inadvertently reused.
