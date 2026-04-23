# Electron Scoped Guide

Last reviewed: 2026-04-23

## Purpose

Define desktop runtime rules for offline-first behavior, local persistence, sync orchestration, and safe renderer bridging. Root policy remains canonical: `../agent.md`.

## Critical Invariants

- Local SQLite is the source of pending desktop state and outbox/bundle state.
- Bundle lifecycle must remain explicit and traceable (`pending`, `retryable`, `conflict`, `dead_letter`, `completed`).
- Conflicts must store enough local/server context for safe manual review.
- `restricted` entitlement mode is read-only; `locked` blocks unlock and sync.
- `rebuild_required` state must be explicit and never silently bypassed.

## Public Interfaces / Contracts

- `main.cjs` owns desktop sync loop and runtime status.
- `preload.cjs` exposes minimal bridge APIs; renderer must not receive raw FS/SQL access.
- `services/local-db.cjs` enforces durable outbox, bundle tracking, and diagnostics snapshot shape.
- Sync push/pull contracts must stay compatible with `server/index.js` policy in `../server/agent.md`.

## Failure Modes & Recovery

- Native module mismatch (`better-sqlite3`) must route to rebuild flow (`desktop:rebuild-native`).
- Checkpoint invalidation must set rebuild-required state and stop normal sync until recovery.
- Retry only transient sync failures; do not loop on validation/conflict/entitlement failures.
- Recovery actions must remain available: run sync, retry retryables, rebuild cache, export diagnostics.

## Required Checks Before Merge

- `node --check electron/main.cjs`
- `node --check electron/services/local-db.cjs`
- `npm run desktop:doctor-check`
- Targeted desktop sync tests when touching bridge/runtime/sync paths.

## What Not To Change Without Cross-Team Review

- Bundle status semantics and retry/dead-letter policy.
- Entitlement enforcement behavior used by unlock and sync runner.
- Preload bridge exposure scope (security boundary).
- Diagnostics contract fields consumed by support scripts.
