# Desktop Local Setup

## Recommended local flow

1. Copy `.env.desktop.example` to `.env.desktop` and adjust `DATABASE_URL` if needed.
2. Install packages:
   - `npm install`
3. Rebuild the Electron native module:
   - `npm run desktop:rebuild-native`
4. Run a preflight check:
   - `npm run desktop:doctor-check`
5. Start the desktop app:
   - `npm run desktop:dev`

## Useful commands

- Preflight while the app is not running:
  - `npm run desktop:doctor-check`
- Verify API and renderer after launch:
  - `npm run desktop:doctor-check:running`
- Trace one bundle, mutation, or device:
  - `npm run desktop:trace-sync -- --bundle <bundle-id>`
  - `npm run desktop:trace-sync -- --mutation <mutation-id>`
  - `npm run desktop:trace-sync -- --device <device-id>`
- Run desktop sync integration coverage:
  - `npm run test:desktop:integration`

## What to inspect when sync looks wrong

### Local desktop SQLite
- `outbox_mutations`: pending, retryable, processed, dead-letter state
- `sync_bundles`: bundle-level progress, retry, conflict, and completion state
- `pull_checkpoints`: latest applied checkpoint
- `sync_runs`: push/pull run history
- `sync_conflicts`: unresolved conflicts
- `sync_dead_letters`: hard failures requiring attention
- `device_entitlements`: local unlock/access state

### Server PostgreSQL
- `processed_bundles`: durable bundle acceptance history
- `processed_mutations`: idempotent mutation acceptance history
- `desktop_devices`: registered devices and last-seen status
- canonical domain tables:
  - `patients`
  - `appointments`
  - `consultation_drafts`
  - `clinical_notes`
  - `patient_documents`

## Quick interpretation

- In local SQLite:
  - `pending` means the bundle or mutation still needs cloud sync
  - `processed` means the mutation was accepted by the server
  - `retryable` means the client will try again
  - `conflict` means sync is blocked until a resolution choice is made
  - `dead_letter` means the item needs investigation
- In server Postgres:
  - a row in `processed_bundles` means the whole bundle committed atomically
  - a row in `processed_mutations` means the server has durably seen that mutation id
  - if the canonical domain row changed too, the sync applied fully

## Retry vs rebuild

- Retry from the desktop app when:
  - the item is `retryable`
  - network or temporary server conditions caused the failure
- Rebuild the cache when:
  - the desktop UI says `rebuild required`
  - the pull checkpoint is invalid or expired
  - local bootstrap state looks inconsistent with the server
- Do not wipe local state first unless:
  - the user is intentionally signing out
  - support has already captured diagnostics

## Conflict-blocked work

- A conflict means the bundle is not synced yet even if some local edits are visible.
- Review the local and server summaries in the desktop sync issues panel.
- Choose one of the explicit resolution actions:
  - drafts: keep local as new draft, or discard local and use server
  - appointments: refresh from server, retry allowed transition, or discard local change
  - patients: use local, use server, then resync
