# KPV

Android + Samsung Tizen player for IPTV-style catalogs (e.g. example.com).

## Open in Cursor

**File → Open Folder →** `C:\Users\User\kpv`

Use this repo root for all KPV work — not inside `weekday-fuel`.

## Layout

| Path | What |
|------|------|
| `app/` | Android KPV (phone + Android TV) |
| `tizen/` | Samsung Tizen widget (`npm run package` → `KPV.wgt`) |
| `docs/superpowers/` | Design specs and implementation plans |
| `release/` | (planned) unified version for CI releases |

## Build

```powershell
# Android
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
.\gradlew.bat :app:assembleDebug

# Tizen WGT
cd tizen
npm install
npm run package
```

## Releases

Published artifacts (APK, `KPV.wgt`, hot bundle, manifest) go to **[kpv-releases](https://github.com/Evzy/kpv-releases)** via GitHub Actions. See [`docs/CI_CD.md`](docs/CI_CD.md) for secrets and cutting a release.

## Docs

- CI/CD: [`docs/CI_CD.md`](docs/CI_CD.md)
- Auto-update design: `docs/superpowers/specs/2026-10-22-kpv-auto-update-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-22-kpv-auto-update.md`
