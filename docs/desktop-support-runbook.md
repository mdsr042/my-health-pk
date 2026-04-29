# Desktop Support Runbook

## Purpose

This runbook helps support and engineering decide whether a desktop doctor should:

- retry sync
- rebuild the local cache
- update the desktop app
- revoke a device

Use this with:

- [desktop-local.md](/Users/muhammadmudassar/Desktop/dev/Practice/my-health-pk/docs/desktop-local.md)
- [rollout-100-doctors.md](/Users/muhammadmudassar/Desktop/dev/Practice/my-health-pk/docs/rollout-100-doctors.md)

## First Questions

Collect:

- doctor email
- workspace ID
- device ID
- whether the doctor can still unlock the desktop app
- whether the app shows `restricted`, `locked`, or `rebuild required`

Then gather:

- `npm run desktop:cohort-health`
- `npm run desktop:chaos` for resilience rehearsal in a safe local environment
- `npm run desktop:trace-sync -- --device <device-id>`
- exported diagnostics from the desktop app

## Retry vs Rebuild

Retry when:

- bundles are `retryable`
- there is no `rebuild required` banner
- the issue looks transient:
  - network timeout
  - API restart
  - temporary 5xx

Rebuild when:

- checkpoint status is `unknown_checkpoint`, `expired_checkpoint`, or `rebuild_required`
- the desktop app fails integrity verification
- the doctor sees a persistent rebuild-required banner
- local cache is stale or clearly inconsistent after pull

Do not rebuild first when a simple retryable failure is enough.

## Outdated Client Rejection

If sync fails with `DESKTOP_CLIENT_OUTDATED` or `CLIENT_VERSION_UNSUPPORTED`:

- do not keep retrying sync
- direct the doctor to install the newer desktop release
- use the manual release workflow and release page artifacts

This is an intentional compatibility stop, not a transient sync failure.

## Entitlement and Lock States

- `valid`: full access
- `valid_but_recheck_due`: full access, background recheck
- `grace`: full access with warning
- `restricted`: read-only local access, no new writes
- `locked`: no unlock and no sync

If a doctor reports “I can open records but cannot edit,” check for `restricted` first.

## Device Revocation

Use revocation when:

- a device is lost or stolen
- a machine should no longer sync
- support needs to immediately stop an untrusted desktop client

Admin revoke endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"device lost"}' \
  "http://127.0.0.1:4001/api/admin/offline-sync/devices/<device-id>/revoke"
```

Expected result:

- future desktop bootstrap, entitlement, push, and pull calls for that device are blocked with `DEVICE_REVOKED`

## PHI-Safe Diagnostics

The desktop diagnostics export is intentionally redacted by default.

It should answer:

- what is pending
- what is dead-lettered
- what is conflict-blocked
- current checkpoint
- rebuild-required state
- bundle/mutation counts
- oldest pending bundle age

It should not be your first source for raw patient-level payload inspection.

## Recovery Checklist

1. Ask the doctor to export a local backup.
2. Ask the doctor to export diagnostics.
3. Decide:
   - retry
   - rebuild
   - update app
   - revoke device
4. If rebuilding:
   - confirm backup completed
   - rebuild cache from the desktop issues sheet
5. Trace the result by:
   - `deviceId`
   - `bundleId`
   - `mutationId`

## Escalate To Engineering When

- retryable failures become repeated dead letters
- rebuild does not clear checkpoint issues
- device revocation appears to be bypassed
- integrity verification fails repeatedly on the same doctor machine
- pilot cohort health returns `NO_GO`
