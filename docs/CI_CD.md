# CI/CD (GitHub Actions)

## Workflow

| Workflow | File | When it runs | Purpose |
|----------|------|--------------|---------|
| **Release KPV** | [`.github/workflows/release-kpv.yml`](../.github/workflows/release-kpv.yml) | PR to `main`, push to `main`, push tag `v*`, `workflow_dispatch` | Tizen JS tests, Android unit tests, **debug APK**, **KPV.wgt**, **kpv-web-bundle.zip**, **kpv-tv-manifest.json**. On push, publishes to **`OWNER/kpv-releases`** when release **`v{version}`** does not exist yet (main) or for an explicit **`v*`** tag. |

Version source: [`release/version.json`](../release/version.json) (`version`, `versionCode`, `wgtShellVersion`, `minWgtShell`, `forceWgtInstall`).

Local emulators and instrumented tests: [`docs/TESTING.md`](TESTING.md).

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

## Platform update model

| Platform | Auto-update mechanism | Hot reload of JS/CSS? |
|----------|----------------------|------------------------|
| **Android** (phone / Android TV) | In-app **APK** from `kpv-releases` on cold start | **No** — full APK only |
| **Samsung Tizen** (`.wgt`) | **`kpv-web-bundle.zip`** via manifest (background) + occasional **manual `.wgt`** | **Yes — Tizen only** |

Android never downloads or applies `kpv-web-bundle.zip` or `kpv-tv-manifest.json`. Those artifacts exist only for the TV widget.

## In-app APK update (Android only)

On **cold start**, the app checks `GET /repos/{owner}/kpv-releases/releases/latest`. If the tag is newer than `versionName`, it shows **Update** / **Later**. Defaults: owner from `release/version.json` → **`kpv-releases`**. Override with `UPDATE_GITHUB_*` in `local.properties` or environment.

## Tizen: hot bundle vs manual `.wgt`

The TV app loads **`boot.js`** first: if a hot bundle was applied before, it loads **`main.js` / `style.css` from `documents/kpv-hot-cache`**, otherwise from the installed `.wgt`. **`bootstrap.js`** (defer) fetches **`kpv-tv-manifest.json`**, may download **`kpv-web-bundle.zip`**, caches it, then **reloads** so the new version runs. A one-time toast can show “Updated to …” after reload. TVs need a **`.wgt` that includes `boot.js`** (shell **1.0.38+**) for hot updates to change the on-screen version and JS behavior.

### When you do **not** need a manual `.wgt` reinstall

Typical releases that only change Tizen **web logic** (files in `tizen/js/`, CSS, catalog/player/companion JS):

- Bump **`version`** (and Android **`versionCode`**) in `release/version.json`.
- Leave **`wgtShellVersion`** / **`minWgtShell`** unchanged (or only bump shell if you also ship a new `.wgt` for other reasons).
- CI publishes a new **`kpv-web-bundle.zip`**; TVs with a recent shell pick it up in the background.

Users on Samsung TV do **not** install a new `.wgt` for these releases once they already have a compatible shell.

### When you **must** sideload a new `.wgt` (manual, one time per shell generation)

Reinstall **`KPV.wgt`** from the release when any of these change:

| Change | What to bump in `release/version.json` |
|--------|----------------------------------------|
| `config.xml` (app id, privileges, content entry) | **`wgtShellVersion`** + **`minWgtShell`** |
| **`bootstrap.js`** loader / blocking UX / manifest URL | **`wgtShellVersion`** + **`minWgtShell`** |
| `index.html` / `watch.html` **shell** (script tags, layout skeleton) | **`wgtShellVersion`** + **`minWgtShell`** |
| New packaged assets only in `.wgt` (e.g. `jszip.min.js`, icons) | **`wgtShellVersion`** + **`minWgtShell`** |
| Emergency “everyone reinstall now” | Set **`forceWgtInstall`: true** in manifest (via release) until TVs are on the new shell; then set back to `false` |

After bumping **`minWgtShell`**, any TV whose installed shell is **older** than `minWgtShell` sees a **blocking screen** with **`wgtUrl`** until someone sideloads the new `.wgt`.

**Rule of thumb:** if it is not inside the hot zip (`tizen/scripts/build-web-bundle.mjs` file list), it requires a new **`.wgt`**, not hot reload alone.

### Operator checklist (Tizen)

1. **JS/CSS-only fix** → bump `version` only → push `main` → TVs hot-cache; no USB step.
2. **Shell / bootstrap / config change** → bump `wgtShellVersion` and `minWgtShell` → push `main` → sideload **`KPV.wgt` once** per TV (or set `forceWgtInstall` if you need to force it).

## Shared debug keystore

APK upgrades require the **same signing certificate**. If Android shows **App not installed** when updating, you usually have an older build (e.g. **v1.0.7** or a PC debug APK) signed with a different key than GitHub Releases (**v1.0.8+**). **Uninstall KPV**, then install the latest `KPV-v*-debug.apk` from [kpv-releases](https://github.com/Evzy/kpv-releases). Newer in-app updaters detect this before install and show a clear message.

In-app updates use the **system install screen** (not silent PackageInstaller sessions). If install still fails, download the APK on a PC and run `adb install -r KPV-v*-debug.apk`, or allow **Install unknown apps** for both **KPV** and your **browser/files** app.

**Important:** Release APKs **v1.0.8–v1.0.17** were signed with a shared keystore whose certificate had **`CA:true`**. Many phones reject that with **App not installed**, while **v1.0.7** (normal Android Debug cert) still installs. From **v1.0.18+**, CI uses a proper app signing keystore (`scripts/generate-kpv-android-keystore.ps1`). Everyone on v1.0.7 or the bad cert must **uninstall once**, then install **v1.0.18+**.

CI and local builds share one debug keystore:

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
