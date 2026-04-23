# Desktop Release Runbook (Manual Trigger)

## Goal

Release Windows desktop installers only when you decide, not on every commit.

This project uses a manual GitHub Actions workflow (`workflow_dispatch`) for desktop releases.

## What this gives you

- No automatic desktop build on each push.
- You choose exactly when to create a new installer version.
- Release artifacts are attached to a GitHub Release for easy download.

## One-time setup

1. Ensure the repository has GitHub Actions enabled.
2. Ensure maintainers have permission to run workflows and create releases.
3. Optional for production trust:
   - add Windows code-signing secrets before broad rollout (not required for internal pilot builds).

## How to create a new desktop release

1. Open GitHub -> `Actions` -> `Desktop Release (Manual)`.
2. Click `Run workflow`.
3. Fill inputs:
   - `version_tag`: example `v1.0.3`
   - `release_name`: example `My Health Desktop v1.0.3`
   - `prerelease`: set `true` for test rollout, `false` for production candidate
4. Run workflow.
5. Wait for completion.

## What the workflow does

1. Checks out the repo.
2. Installs dependencies (`npm ci`).
3. Builds desktop distribution (`npm run desktop:dist`).
4. Creates/pushes the git tag if missing.
5. Uploads Windows installer artifacts to a GitHub Release.

## Where files are uploaded

The generated installer artifacts are uploaded to the matching GitHub Release tag:

- `https://github.com/<org-or-user>/<repo>/releases/tag/<version_tag>`

Typical files include:

- NSIS installer `.exe`
- blockmap/yml metadata files emitted by `electron-builder`

## Recommended release rhythm for first 100 doctors

- Use `prerelease=true` for pilot test builds.
- Promote only stable builds to `prerelease=false`.
- Keep a short release note with:
  - sync fixes
  - conflict handling changes
  - known limitations

## Rollback guidance

If a release has issues:

1. Stop rollout of the new installer.
2. Point doctors to the previous release asset.
3. Patch and publish a new version tag.

Do not overwrite old release artifacts; keep versions immutable for auditability.
