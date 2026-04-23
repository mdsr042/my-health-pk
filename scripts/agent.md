# Scripts Scoped Guide

Last reviewed: 2026-04-23

## Purpose

Define standards for operational scripts used for desktop preflight, diagnostics, integration checks, and sync tracing. Root policy remains canonical: `../agent.md`.

## Critical Invariants

- Operator scripts must prefer explicit, inspectable output over silent behavior.
- Sync trace tooling must remain anchored to `deviceId`, `bundleId`, and `mutationId`.
- Preflight checks must fail fast with clear remediation instructions.
- Scripts must not bypass entitlement or rebuild-required safeguards in normal workflows.

## Public Interfaces / Contracts

- `desktop-doctor-check.mjs` is the preflight contract for local desktop readiness.
- `desktop-sync-integration.mjs` is the integration validation contract for sync behavior.
- `trace-desktop-sync.mjs` is the support contract for explaining sync state across local/server records.

## Failure Modes & Recovery

- If dependencies/ports/env are invalid, scripts must print actionable errors and stop.
- If trace data is missing, scripts must report which identifier stage failed (device, bundle, mutation).
- Recovery guidance must distinguish retryable failures from rebuild-required flows.

## Required Checks Before Merge

- `npm run desktop:doctor-check`
- `npm run test:desktop:integration`
- Script syntax checks for updated files (`node --check ...`).

## What Not To Change Without Cross-Team Review

- Trace output fields used by support runbooks.
- Preflight pass/fail criteria relied on by onboarding and CI docs.
- Integration script acceptance logic for compatibility and idempotency behavior.
