# ADR 001: Monorepo with npm Workspaces

**Date**: 2026-06-26
**Status**: Accepted

## Context

Managing 13 microservices and 7 shared packages across multiple repositories leads to version drift and difficult PR reviews. Adapted from handbook's pnpm to standard npm based on our setup.

## Decision

We will use a single Git repository structured via standard npm workspaces.

## Consequences

### Positive

- Eases cross-service refactoring and dependency sharing.
- All services and packages are versioned together, eliminating version drift.
- PR reviews can span multiple services in a single pull request, improving visibility.

### Negative

- Requires stricter CI/CD pipeline routing to only deploy affected services.
- The repository can grow large over time, requiring careful management of build and test pipelines.
