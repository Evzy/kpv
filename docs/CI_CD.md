# CI/CD (GitHub Actions)

## Workflow

| Workflow | File | When it runs | Purpose |
|----------|------|--------------|---------|
| **Release KPV** | [`.github/workflows/release-kpv.yml`](../.github/workflows/release-kpv.yml) | PR to `main`, push to `main`, push tag `v*`, `workflow_dispatch` | Tizen JS tests, Android unit tests, **debug APK**, **KPV.wgt**, **kpv-web-bundle.zip**, **kpv-tv-manifest.json**. On push, publishes to **`OWNER/kpv-releases`** when release **`v{version}`** does not exist yet (main) or for an explicit **`v*`** tag. |

Version source: [`release/version.json`](../release/version.json) (`version`, `versionCode`, `wgtShellVersion`, `minWgtShell`, `forceWgtInstall`).

## Releases repo + token

Artifacts live in **`kpv-releases`** (public, same owner as the source repo). The workflow publishes with secret **`KPV_RELEASES_TOKEN`**.

1. Create **`kpv-releases`** with a `main` branch (README is enough).
2. Fine-grained PAT: repository access → only **`kpv-releases`**; Permissions → **Contents: Read and write**.
3. On the **KPV source repo**: Settings → Secrets → Actions → **`KPV_RELEASES_TOKEN`**.

   ```bash
   gh secret set KPV_RELEASES_TOKEN -R YOUR_OWNER/kpv
   ```

## Cut a release

1. Bump fields in [`release/version.json`](../release/version.json). If bootstrap / `config.xml` / TV privileges change, bump **`wgtShellVersion`** and usually **`minWgtShell`**. Set **`forceWgtInstall`: true** only when TVs must reinstall `.wgt`.
2. Merge to **`main`**. CI creates release **`v{version}`** with all four assets if that tag is missing on **`kpv-releases`**.
3. Optional: `git tag v1.0.8 && git push origin v1.0.8` to force publish for that tag.

## In-app APK update

On **cold start**, the app checks `GET /repos/{owner}/kpv-releases/releases/latest`. If the tag is newer than `versionName`, it shows **Update** / **Later**. Defaults: owner from `release/version.json` → **`kpv-releases`**. Override with `UPDATE_GITHUB_*` in `local.properties` or environment.

## Tizen hot update

The sideloaded WGT runs **`bootstrap.js`**, which loads **`kpv-tv-manifest.json`** from the latest GitHub release, verifies **`bundleSha256`**, caches **`kpv-web-bundle.zip`**, and shows a one-time “Updated to …” toast. If **`forceWgtInstall`** or the installed shell is below **`minWgtShell`**, the app shows a blocking screen with **`wgtUrl`**.

## Shared debug keystore

APK upgrades require the **same signing certificate**. CI and local builds can share one debug keystore:

| Secret | Purpose |
|--------|---------|
| `KPV_SHARED_DEBUG_KEYSTORE_B64` | Base64 keystore file |
| `KPV_SHARED_DEBUG_STORE_PASSWORD` | Keystore password |
| `KPV_SHARED_DEBUG_KEY_ALIAS` | Key alias |
| `KPV_SHARED_DEBUG_KEY_PASSWORD` | Key password |

Local: copy keystore to `app/ci-shared-debug.keystore` (gitignored) and set `debug.storeFile`, `debug.storePassword`, `debug.keyAlias`, `debug.keyPassword` in `local.properties`.

## Secrets summary

| Secret | Required | Purpose |
|--------|----------|---------|
| `KPV_RELEASES_TOKEN` | For publishing | PAT with Contents write on `kpv-releases` |
| `KPV_SHARED_DEBUG_*` (4) | Recommended | Stable signing for in-app updates |
