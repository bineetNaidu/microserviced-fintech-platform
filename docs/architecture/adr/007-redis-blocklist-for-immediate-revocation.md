# ADR 007: Redis Blocklist for Immediate Revocation

**Date**: 2026-06-26
**Status**: Accepted

## Context

Stateless JWTs cannot be logged out before their 15-minute expiration natively.

## Decision

When a user logs out, their current JWT jti (JWT ID) is pushed to a Redis blocklist with a TTL matching the token's remaining life. The API Gateway checks this Redis cache before routing.

## Consequences

### Positive

- Users are effectively logged out immediately upon request, not after token expiry.
- Redis TTL ensures the blocklist does not grow unboundedly.
- Fast in-memory lookup keeps the performance overhead minimal.

### Negative

- Introduces a dependency on Redis availability for every authenticated request at the gateway.
- If Redis goes down, there is a risk of allowing recently-revoked tokens to pass through.
