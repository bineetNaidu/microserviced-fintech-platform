# ADR 019: Internal API Keys for Service-to-Service Auth

**Date**: 2026-06-26
**Status**: Accepted

## Context

We need to prevent Service A from hitting Service B's internal endpoints, but full mTLS is too complex for this team size.

## Decision

Services will authenticate with one another using securely injected Internal API keys passed in headers via the @fintech/shared-middleware.

## Consequences

### Positive

- Prevents unauthorized service-to-service calls with a straightforward implementation.
- Significantly simpler to operate than mTLS certificate management.
- Centralized enforcement via shared middleware ensures consistent application across all services.

### Negative

- API keys must be securely managed, rotated, and distributed via secrets management (e.g., Kubernetes Secrets or a vault).
- Less cryptographically robust than mTLS, which provides mutual identity verification at the transport layer.
