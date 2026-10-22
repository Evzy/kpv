# KPV auto-update (Android APK + Tizen hot bundle)

**Status:** approved 2026-10-22  
**Scope:** `cows-tv` monorepo — Android app (`app/`) and Samsung Tizen widget (`tizen/`)

## Problem

KPV is sideloaded manually (APK on phone/Android TV, `.wgt` on Samsung TV). Weekday Fuel already auto-updates Android via a public GitHub **releases** repo and an in-app check on cold start. KPV needs the same for APK, plus a practical update path for Tizen that avoids reinstalling `.wgt` for most changes.

## Goals

1. **One version number** per release for both platforms (aligned user-facing version).
2. **Android:** automatic update offer from GitHub Releases (same pattern as Weekday Fuel).
3. **Samsung TV:** **hot update** of web assets (JS/CSS/HTML) over HTTPS; **full `.wgt` reinstall** only when required.
4. **One-time UX** on TV when hot bundle version increases: “Updated to {version}”.
5. **Blocking UX** on TV when hot update is insufficient: instruct manual `.wgt` install with link to release asset.
6. **CI** publishes all artifacts together to **`{owner}/kpv-releases`**.

## Non-goals (v1)

- Samsung Seller Office / store distribution.
- Silent install of `.wgt` without user action (may be blocked on consumer TVs).
- Shared Kotlin/JS runtime for catalog logic (duplicate implementations remain OK; version alignment is the contract).
- iOS or other platforms.

## Architecture overview

```
cows-tv (source repo)
  push main / tag v*
       │
       ▼
GitHub Actions
  ├─ assembleDebug APK
  ├─ npm run package → KPV.wgt
  ├─ zip tizen web assets → kpv-web-bundle.zip
  └─ generate kpv-tv-manifest.json
       │
       ▼
kpv-releases (public)
  Release vX.Y.Z
  ├─ KPV-vX.Y.Z-debug.apk
  ├─ KPV.wgt
  ├─ kpv-web-bundle.zip
  └─ kpv-tv-manifest.json

Android app                          Tizen bootstrap (thin WGT)
  cold start                             launch / refresh
       │                                      │
       ▼                                      ▼
GET releases/latest                   GET manifest (same release)
       │                                      │
       ▼                                      ├─ hot: download bundle → cache → load
Install APK if newer                         ├─ toast once per bundleVersion
                                             └─ block: forceWgtInstall or shell too old
```

## Unified versioning

Single source at repo root: **`release/version.json`** (name TBD in implementation):

| Field | Purpose |
|-------|---------|
| `version` | Semver string `X.Y.Z` — `versionName`, `bundleVersion`, release tag |
| `versionCode` | Android monotonic integer |
| `wgtShellVersion` | Version baked into `config.xml` / bootstrap (changes rarely) |
| `minWgtShell` | Minimum installed shell allowed to hot-update |
| `forceWgtInstall` | If true, TV shows blocking manual WGT screen |

Build scripts read this file; CI fails if Android/Tizen packaged versions disagree.

**Release tag:** `v{version}` on `kpv-releases`, same as Weekday Fuel.

## GitHub releases repo

- **Name:** `{repository_owner}/kpv-releases` (public).
- **Secret on source repo:** `KPV_RELEASES_TOKEN` — fine-grained PAT, Contents read/write on releases repo only.
- **Signing:** Shared debug keystore secrets (same pattern as `WEEKDAY_FUEL_SHARED_DEBUG_*`) so APK updates install over prior sideloads.

## Android in-app update

Port from Weekday Fuel:

- `GithubApkReleaseUpdater` + version compare.
- `BuildConfig.UPDATE_GITHUB_OWNER` / `UPDATE_GITHUB_REPO` → `kpv-releases`.
- Trigger on **cold start** (non-blocking dialog: Update / Later).
- Optional later: Settings → Check for updates.

**Android TV (leanback):** same updater unless product decision hides it; companion UI remains hidden on TV.

## Tizen bootstrap and hot update

### Thin WGT shell

Sideloaded `.wgt` contains:

- `config.xml` with `wgtShellVersion`
- Minimal `index.html`, **`bootstrap.js`** (stable loader)
- Fallback bundled `main.js` / `style.css` (last-resort offline)
- Privileges and AVPlay hooks unchanged in hot path

### Manifest `kpv-tv-manifest.json`

Published on each release (asset or `latest/download`):

```json
{
  "manifestVersion": 1,
  "bundleVersion": "1.0.32",
  "bundleUrl": "https://github.com/OWNER/kpv-releases/releases/download/v1.0.32/kpv-web-bundle.zip",
  "bundleSha256": "<hex>",
  "minWgtShell": "1.0.30",
  "forceWgtInstall": false,
  "wgtUrl": "https://github.com/OWNER/kpv-releases/releases/download/v1.0.32/KPV.wgt",
  "releaseNotes": "Optional short string for one-time TV message"
}
```

**Manifest URL for TV:**  
`https://github.com/{owner}/kpv-releases/releases/latest/download/kpv-tv-manifest.json`  
(or pinned by bootstrap config for debugging).

### Bootstrap algorithm

1. Fetch manifest (timeout ~10s).
2. Read installed `wgtShellVersion` from embedded constant (set at WGT build).
3. If `forceWgtInstall === true` OR `wgtShellVersion < minWgtShell` → **blocking screen** (manual WGT install instructions + `wgtUrl`). No catalog until resolved (no “continue anyway” in v1).
4. Else if `bundleVersion` > cached `bundleVersion` in `localStorage`:
   - Download `bundleUrl`, verify SHA-256.
   - Extract to Tizen app storage (or apply single-file bundle strategy).
   - On success: load app from cache; set `localStorage` bundle version.
   - If `localStorage.kpv_last_announced_bundle !== bundleVersion`: show **one-time** message (“Updated to {bundleVersion}”), then set `kpv_last_announced_bundle`.
5. On manifest/network failure: use **last good cached bundle**; if none, use **embedded fallback** in WGT.
6. On corrupt bundle: discard attempt, keep previous cache; log/show non-blocking error once.

### Hot bundle contents

Zip built from packaged tizen web runtime files, e.g.:

- `main.js` (flat bundle)
- `style.css`
- `watch.js`, `stream-resolve.js`, … as needed by watch/hls pages OR single consolidated bundle per page entry

Exact file list locked in implementation plan; must match what bootstrap can inject (script tags / dynamic import pattern Tizen 6 supports).

## CI workflow (source repo)

Mirror `weekday-fuel/.github/workflows/release-android.yml`:

| Step | Output |
|------|--------|
| Tests (JS unit tests for tizen scripts if present; Android unit tests) | gate |
| Read `release/version.json` | version |
| `:app:assembleDebug` | APK |
| `tizen/npm run package` | KPV.wgt |
| Build `kpv-web-bundle.zip` + SHA-256 | bundle |
| Write `kpv-tv-manifest.json` | manifest |
| Publish to `kpv-releases` if tag missing | release |

**Every release publishes:** APK + WGT + hot bundle + manifest (even if only one platform’s logic changed) so version strings stay aligned.

## Platform capability matrix

| Capability | Android | Tizen TV |
|------------|---------|----------|
| Site URL / catalog API | ✅ | ✅ |
| Playback (WebView / AVPlay) | ✅ WebView | ✅ AVPlay + hls-shell |
| LAN companion + PIN | ✅ phone; hidden leanback | ✅ JS (optional hide) |
| APK auto-update | ✅ | — |
| Hot JS/CSS update | — | ✅ |
| Full WGT reinstall | — | ✅ manual when blocked |
| Pull-to-refresh | ✅ phone | — |

**Same release version** applies to both; platform-specific code may no-op on the other platform.

## Error handling

| Failure | Android | Tizen |
|---------|---------|-------|
| No network on check | Silent skip | Use cache / embedded fallback |
| New APK download fails | Keep current app | — |
| Manifest fetch fails | — | Cache → embedded |
| Bundle verify fail | — | Keep previous cache |
| Blocking WGT required | — | Full-screen instructions |

## Testing

1. **Android:** Install vN from releases → publish vN+1 → cold start → Update → verify install over same signing key.
2. **Tizen:** Sideload shell WGT → publish hot bundle only (same `minWgtShell`) → TV updates → one-time message.
3. **Tizen block:** Set `forceWgtInstall: true` → blocking screen with `wgtUrl`.
4. **CI:** Dry-run workflow on PR (build artifacts, skip publish); publish on main/tag only.

## Security

- HTTPS only for manifest and bundle (GitHub release assets).
- Verify `bundleSha256` before applying hot bundle.
- Do not execute remote code without checksum verification.
- GitHub API for APK: public releases repo, no token on device.

## Rollout

1. Create `kpv-releases` + secrets + shared keystore.
2. Add `release/version.json` and wire builds.
3. Ship Android updater (users on manual APK get one more manual install, then auto).
4. Ship Tizen bootstrap in next `.wgt` shell bump; subsequent releases mostly hot-only.

## Open decisions (defaults chosen)

| Question | Decision |
|----------|----------|
| Skip APK when only TV JS changed? | **No** — always publish both for same version |
| Escape hatch on blocking WGT screen? | **No** in v1 |
| Manifest via `latest/download`? | **Yes** for TV |
