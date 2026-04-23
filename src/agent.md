# Client Scoped Guide

Last reviewed: 2026-04-23

## Purpose

Define renderer/UI rules for offline trust indicators, safe conflict handling, and entitlement-aware behavior. Root policy remains canonical: `../agent.md`.

## Critical Invariants

- UI must clearly show sync health, pending issues, and backup-overdue states.
- `restricted` entitlement mode is read-only across write entry points.
- `locked` entitlement state blocks normal usage paths.
- Conflict actions must be explicit, explainable, and reversible through sync-safe flows.
- Client must avoid silent destructive local overwrite when unresolved conflicts exist.

## Public Interfaces / Contracts

- `DesktopContext` and desktop bridge types are the only path for runtime sync/recovery controls.
- Data contexts must respect desktop runtime state gates (`rebuildRequired`, entitlement state, read-only restrictions).
- Conflict UI must consume server-provided conflict metadata and local summaries consistently.

## Failure Modes & Recovery

- If rebuild-required is set, app must route user toward rebuild flow and block risky writes.
- If sync is degraded, app must expose actionable recovery options without hiding local data.
- If conflict resolution is used, UI must show the chosen action and rationale clearly.

## Required Checks Before Merge

- UI tests for restricted mode and rebuild-required banner behavior.
- Conflict review/resolution UI tests for patient/draft/appointment cases.
- Build validation for renderer bundles (`npm run build`).

## What Not To Change Without Cross-Team Review

- Entitlement UI gating semantics (read-only vs blocked behavior).
- Conflict action labels/meanings and user-facing trust messaging.
- Desktop runtime type contracts that gate write access and recovery flows.
