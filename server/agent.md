# Server Scoped Guide

Last reviewed: 2026-04-23

## Purpose

Define canonical server-side sync and compatibility guarantees for desktop + web clients. Root policy remains canonical: `../agent.md`.

## Critical Invariants

- Server Postgres is canonical committed truth.
- Encounter/patient bundle commits must remain atomic in transaction boundaries.
- Idempotency must be enforced by both `mutationId` and `bundleId`.
- Sync responses must remain additive-first for supported older desktop clients.
- Pull must never surface partially committed clinical state as final.

## Public Interfaces / Contracts

- `POST /api/sync/push` returns stable bundle-level and mutation-level outcomes.
- `GET /api/sync/pull` is delta-first and must include checkpoint state semantics.
- Compatibility outcomes must be explicit (`ok`, `unknown_checkpoint`, `expired_checkpoint`, `rebuild_required`).
- Changes to sync wire shapes require coordination with `../electron/agent.md` and `../src/agent.md`.

## Failure Modes & Recovery

- Unknown/expired checkpoints must return explicit rebuild-required guidance, not silent fallback.
- Conflict outcomes must include enough metadata for desktop conflict UI and support tracing.
- Validation/permission/entitlement failures are non-retryable and must not be treated as transient.

## Required Checks Before Merge

- Sync endpoint tests for accepted/conflict/rejected/retryable paths.
- Mixed-version compatibility tests for push/pull contracts.
- Integration checks that preserve traceability by `deviceId`, `bundleId`, and `mutationId`.

## What Not To Change Without Cross-Team Review

- Push/pull contract shape for existing fields.
- Checkpoint token lifecycle behavior.
- Processed-bundle/idempotency table semantics.
- Conflict classification codes consumed by desktop resolution workflow.
