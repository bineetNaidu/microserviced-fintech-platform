# ADR 015: Kustomize Overlays over Helm

**Date**: 2026-06-26
**Status**: Accepted

## Context

We need to deploy the same Kubernetes manifests to staging and production but with different CPU limits and environment variables.

## Decision

Use Kustomize base + overlays to patch plain YAML files, avoiding the complex templating logic of Helm charts.

## Consequences

### Positive

- Base manifests remain plain, valid Kubernetes YAML that can be read and applied without any tooling.
- Overlays provide a clean, declarative way to express environment-specific differences.
- No need to learn or maintain Helm chart templating syntax and lifecycle hooks.

### Negative

- Kustomize is less powerful than Helm for complex conditional logic or dynamic value generation.
- Does not provide Helm's release management, rollback, or chart versioning capabilities out of the box.
