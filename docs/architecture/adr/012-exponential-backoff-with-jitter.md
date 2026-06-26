# ADR 012: Exponential Backoff with Jitter

**Date**: 2026-06-26
**Status**: Accepted

## Context

If a service goes down, 10 other services retrying simultaneously in a tight loop will cause a "Thundering Herd" DDoS effect when it recovers.

## Decision

All HTTP/Event retries will use exponential backoff (1s, 2s, 4s) multiplied by a random jitter percentage.

## Consequences

### Positive

- Prevents the thundering herd problem by spreading retry attempts over time.
- Gives recovering services space to stabilize before being hit with full traffic.
- Jitter ensures that even services that failed at the same time do not retry in lockstep.

### Negative

- Operations that fail may take longer to eventually succeed due to backoff delays.
- Requires careful configuration of maximum retry counts and backoff ceilings to avoid indefinitely delayed operations.
