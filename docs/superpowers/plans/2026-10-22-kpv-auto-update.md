# KPV auto-update implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Weekday-Fuel-style GitHub Releases for KPV (APK + Tizen hot bundle + WGT + manifest) with in-app APK updates and Tizen bootstrap hot-load.

**Architecture:** Single `release/version.json` drives CI; public `kpv-releases` hosts artifacts; Android uses `GithubApkReleaseUpdater`; Tizen WGT becomes a thin shell with `bootstrap.js` that fetches `kpv-tv-manifest.json` and cached web bundles.

**Tech Stack:** GitHub Actions, Kotlin/Android Gradle, Tizen web widget (JS), Node build scripts (`tizen/scripts/`).

## Global Constraints

- Release tag format: `v{X.Y.Z}` matching `release/version.json` `version`.
- Public releases repo: `{owner}/kpv-releases`.
- APK signing: shared debug keystore in CI (same certificate for in-app upgrades).
- TV hot bundle must verify `bundleSha256` before apply.
- Blocking WGT screen when `forceWgtInstall === true` OR installed shell `< minWgtShell` (no escape hatch v1).
- Every release publishes: APK, `KPV.wgt`, `kpv-web-bundle.zip`, `kpv-tv-manifest.json`.

**Spec:** [../specs/2026-10-22-kpv-auto-update-design.md](../specs/2026-10-22-kpv-auto-update-design.md)

---

## File map

| Path | Responsibility |
|------|----------------|
| `release/version.json` | Single version source |
| `.github/workflows/release-kpv.yml` | CI build + publish |
| `app/build.gradle.kts` | Read version + UPDATE_GITHUB_* BuildConfig |
| `app/src/main/java/dev/kpv/app/update/*` | APK updater (port from Weekday Fuel) |
| `app/src/main/java/dev/kpv/app/KpvApp.kt` / `MainActivity.kt` | Cold-start update check |
| `tizen/js/bootstrap.js` | Manifest fetch, cache, load, block UX |
| `tizen/index.html` | Load bootstrap first |
| `tizen/scripts/build-web-bundle.mjs` | Zip runtime assets + hash |
| `tizen/scripts/embed-shell-version.mjs` | Inject wgtShellVersion into bootstrap |
| `docs/CI_CD.md` | Operator docs (secrets, cut release) |

---

## Phase 1 — Version source and releases repo

### Task 1: Add unified version file

- [ ] Create `release/version.json` with `version`, `versionCode`, `wgtShellVersion`, `minWgtShell`, `forceWgtInstall`.
- [ ] Wire `app/build.gradle.kts` to read `version` / `versionCode` from JSON (Groovy/Kotlin script or small Node pre-step).
- [ ] Wire `tizen/package.json` `version` from same file in `build-flat.mjs` or npm prepackage script.
- [ ] CI check script: fail if packaged outputs disagree with `release/version.json`.

**Verify:** Local `./gradlew :app:assembleDebug` and `npm run package` show same semver.

### Task 2: Document releases repo setup

- [ ] Add `docs/CI_CD.md` (copy structure from Weekday Fuel `docs/CI_CD.md`, adapt names to KPV / `kpv-releases` / `KPV_RELEASES_TOKEN` / keystore secret names).
- [ ] List required GitHub secrets and first-time `kpv-releases` repo creation.

**Verify:** Doc matches Weekday Fuel pattern; no secrets in repo.

---

## Phase 2 — GitHub Actions publish

### Task 3: Release workflow

- [ ] Add `.github/workflows/release-kpv.yml`:
  - Triggers: push `main`, tag `v*`, `workflow_dispatch`
  - Jobs: JS tests (if any), `assembleDebug`, `npm run package`, `node scripts/build-web-bundle.mjs`, generate manifest JSON
  - Upload artifact on PR; publish to `kpv-releases` on push when tag `v{version}` missing
- [ ] Apply shared debug keystore from secrets (same as Weekday Fuel).
- [ ] Asset names: `KPV-v{version}-debug.apk`, `KPV.wgt`, `kpv-web-bundle.zip`, `kpv-tv-manifest.json`.

**Verify:** Manual `workflow_dispatch` on fork produces artifact zip; publish step skipped without token.

### Task 4: Web bundle builder

- [ ] Implement `tizen/scripts/build-web-bundle.mjs`: input flat `main.js`, `style.css`, watch-page scripts listed in spec; output zip + print SHA-256 for manifest.
- [ ] Manifest generator script (or CI step) fills `bundleUrl` / `wgtUrl` using known release tag URLs.

**Verify:** Local run produces zip; checksum stable for same inputs.

---

## Phase 3 — Android in-app updater

### Task 5: Port updater module

- [ ] Copy/adapt from `weekday-fuel`: `GithubApkReleaseUpdater.kt`, `ReleaseVersionCompare.kt`, tests.
- [ ] Package `dev.kpv.app.update`; set `BuildConfig.UPDATE_GITHUB_OWNER/REPO/TOKEN` in `app/build.gradle.kts`.
- [ ] Add `file_paths.xml` / FileProvider if missing for APK install intent.

**Verify:** Unit tests for version compare pass.

### Task 6: Cold-start UX

- [ ] In `KpvApp` or `MainActivity`, launch coroutine on cold start: fetch latest release; if newer, show dialog (Update / Later).
- [ ] Update downloads asset to cache; `ensureInstallFromUnknownSources` then install.

**Verify:** Point `UPDATE_GITHUB_*` at a test release; emulator shows dialog; install succeeds over same-signed APK.

---

## Phase 4 — Tizen bootstrap and hot load

### Task 7: Bootstrap loader

- [ ] Add `tizen/js/bootstrap.js`:
  - Embedded `WGT_SHELL_VERSION` constant (from build script)
  - Fetch manifest from `https://github.com/{owner}/kpv-releases/releases/latest/download/kpv-tv-manifest.json` (owner configurable in bootstrap or build-time inject)
  - Blocking UI for `forceWgtInstall` / shell too old
  - Download + SHA-256 verify + extract/write cache (Tizen filesystem APIs)
  - Inject scripts/styles from cache or fallback
  - One-time “Updated to {bundleVersion}” via `localStorage`
- [ ] Change `index.html` / `watch.html` entry to bootstrap-first pattern (watch may share bootstrap or separate thin entry — keep one cache namespace).

**Verify:** On TV or Tizen simulator: bump manifest on test host; confirm load from cache and toast once.

### Task 8: Package shell vs bundle

- [ ] Ensure `npm run package` includes bootstrap + embedded fallback bundle (current flat build).
- [ ] Document: changing bootstrap or `config.xml` → bump `wgtShellVersion` and `minWgtShell` in `version.json`; set `forceWgtInstall` for emergency full reinstall.

**Verify:** Fresh sideload shell v1; hot bundle v2 applies without new WGT.

---

## Phase 5 — Integration and first release

### Task 9: First published release

- [ ] Create `kpv-releases` on GitHub; configure secrets on `cows-tv`.
- [ ] Bump `release/version.json`; push main; confirm release assets.
- [ ] Install previous APK manually; confirm auto-update to new release.
- [ ] Sideload WGT shell; confirm hot update + one-time message from published bundle.

### Task 10: Operator copy on blocking screen

- [ ] Blocking screen strings: link to `wgtUrl`, short steps (Developer Mode / USB / PC), reference Desktop sideload habit.

**Verify:** Set `forceWgtInstall: true` in test manifest; TV shows block; after manual WGT install, app runs.

---

## Dependency order

```
Phase 1 → Phase 2 → Phase 3 (parallel with Phase 4 after Task 4) → Phase 5
```

Phase 3 and 4 can proceed in parallel once Task 4 defines bundle layout.

## Out of scope (follow-ups)

- Settings → “Check for updates” on Android
- QR code on TV blocking screen
- Shared Kotlin/JS catalog test fixtures
