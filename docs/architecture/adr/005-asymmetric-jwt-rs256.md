# ADR 005: Asymmetric JWT RS256

**Date**: 2026-06-26
**Status**: Accepted

## Context

Microservices need to verify user tokens without querying the auth-service every time, but sharing a symmetric secret (HS256) across 13 services is a massive security risk.

## Decision

Use RS256 asymmetric keys. The auth-service holds the private key to sign JWTs. All other services hold the public key to verify them natively.

## Consequences

### Positive

- Each service can independently verify tokens without network calls to the auth-service.
- Compromise of a service only exposes the public key, not the signing secret.
- Clear separation of concerns: only auth-service can issue tokens, but any service can verify them.

### Negative

- Key rotation is more involved than with symmetric keys and requires distributing updated public keys to all services.
- Slightly larger token size compared to HS256.
