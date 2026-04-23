# Agent Rules

## Desktop-Behind-Web Backward Compatibility (Mandatory)

The desktop app can run behind the online web app version in production. All product and sync changes must preserve backward compatibility for older desktop clients.

### Required rules

1. Never ship a server or web change that silently breaks sync for supported older desktop versions.
2. Keep sync APIs additive-first:
   - add new fields without removing old ones in the same release window
   - keep old response shapes available until desktop rollout catches up
3. Treat unknown client fields and missing optional fields as non-fatal on both server and desktop.
4. Maintain idempotent processing by `mutationId` and bundle-level safety by `bundleId`.
5. Keep pull delta contracts backward compatible:
   - older checkpoints must be handled or return explicit `rebuild_required`
   - never return partial committed clinical state as if it were final
6. Use explicit compatibility gates instead of silent failures:
   - return clear compatibility errors or `rebuild_required`
   - show user-safe UI messaging for blocked sync states
7. Schema and migration changes must support rolling upgrades:
   - avoid destructive server assumptions about immediate desktop upgrade
   - keep migration paths recoverable
8. Every sync-contract change must include tests for:
   - current client behavior
   - previous supported desktop contract behavior
   - mixed-version push/pull scenarios

### Definition of done for sync-affecting changes

- Works for latest desktop and web.
- Does not break supported older desktop clients.
- Includes compatibility tests and recovery behavior (`retry`, `conflict`, `rebuild_required`).
- Is traceable by `deviceId`, `bundleId`, and `mutationId`.

## Policy Precedence and Scoped Guides

Root `agent.md` is the canonical policy for this repository.

### Precedence

1. Root policy is the default for all directories.
2. Scoped `agent.md` files may narrow behavior inside their own subtree.
3. If a scoped guide conflicts with root policy, root policy wins unless root explicitly allows an override.

### Scoped guides (first wave)

- `electron/agent.md`
- `server/agent.md`
- `src/agent.md`
- `scripts/agent.md`
