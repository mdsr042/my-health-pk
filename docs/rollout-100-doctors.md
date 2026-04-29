# 100-Doctor Rollout Readiness

## Objective

Use this gate to decide whether the desktop app is safe for a controlled rollout to approximately 100 active doctors.

This gate focuses on sync trust, conflict safety, entitlement correctness, and recoverability.

## How to run

### Full gate (required for rollout decision)

`npm run rollout:100`

### Quick gate (developer fast check)

`npm run rollout:100:quick`

Quick mode skips the full desktop sync integration run and must not be used as the final rollout decision.

### Pilot cohort health decision

`npm run desktop:cohort-health`

Use this command as the go/no-go summary before expanding rollout batches. It exits non-zero on `NO_GO`.

## Gate criteria

A rollout candidate is considered ready only when all required checks pass:

- Electron runtime syntax check
- Server runtime syntax check
- Desktop preflight (`desktop:doctor-check`)
- Phase 1 desktop sync/store/UI tests
- Desktop end-to-end sync integration
- Production build

The desktop integration gate includes mixed-version safety checks:

- additive compatibility metadata on sync contracts
- legacy `mutations` payload support
- explicit rejection for outdated desktop client versions (no silent sync drift)
- full gate fails if these compatibility markers are missing from integration output

## Operational checks before enabling 100 users

- Confirm diagnostics export is working from desktop sync issues panel.
- Confirm `rebuild_required` state is visible and blocks risky writes.
- Confirm restricted entitlement mode enforces read-only behavior.
- Confirm at least one support runbook trace succeeds by `deviceId`, `bundleId`, and `mutationId`.

## Failure handling

If the gate fails:

1. Do not expand rollout.
2. Fix failed check(s).
3. Rerun `npm run rollout:100` until all checks pass.
4. Capture failure class in the incident log:
   - compatibility
   - conflict handling
   - entitlement enforcement
   - recovery/tooling
   - build/runtime

## Rollout policy for first 100 doctors

- Roll out in batches, not all at once.
- Keep sync issue monitoring active during each batch window.
- Pause rollout immediately if conflict/dead-letter trends increase unexpectedly.
- Require one stable full-gate pass before each expansion batch.
- Do not expand cohorts when compatibility checks fail, even if feature tests pass.
