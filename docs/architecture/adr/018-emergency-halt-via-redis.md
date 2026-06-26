# ADR 018: Emergency Halt via Redis

**Date**: 2026-06-26
**Status**: Accepted

## Context

If a critical exploit is found, scaling Kubernetes pods to zero takes too long to stop financial hemorrhaging.

## Decision

The api-gateway and transfer-service will check a global EMERGENCY_HALT Redis key. If true, all mutating operations instantly reject with 503s.

## Consequences

### Positive

- Mutating operations can be halted across the entire platform in milliseconds by setting a single Redis key.
- Read-only operations can continue during an emergency halt, preserving visibility.
- Simple to implement and operate; the kill switch is a single Redis SET command.

### Negative

- Introduces a dependency on Redis for every mutating request path.
- If the EMERGENCY_HALT key is accidentally set in production, it causes a full platform outage for writes until corrected.
