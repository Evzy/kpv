# Testing KPV locally

## Automated (no emulator)

| Command | What it covers |
|---------|----------------|
| `cd tizen && npm run test:tizen` | Stream resolve, embed engine, stream-live, **bundle-cache path logic** |
| `./gradlew :app:testDebugUnitTest` | JVM tests (e.g. release version compare) |

CI runs both on every release workflow.

## Android emulator

**One-time setup** (SDK at `%LOCALAPPDATA%\Android\Sdk`):

```powershell
.\scripts\setup-android-emulator.ps1
```

**Instrumented tests** (Settings Save + keyboard Done):

```powershell
.\scripts\run-android-instrumented.ps1
```

That script starts AVD **`kpv_api34`** if no device is connected, then runs `:app:connectedDebugAndroidTest`.

Manual:

```powershell
.\scripts\start-android-emulator.ps1
.\gradlew :app:connectedDebugAndroidTest
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Use an **Android TV** system image in SDK Manager if you need leanback layout; phone AVD is enough for Settings / IME behavior.

## Samsung Tizen TV

There is **no Tizen TV emulator in CI**. Hot-cache and `tizen.filesystem` need real Tizen (emulator or TV).

### One-time setup on this PC

Base **Tizen Studio 6.0 CLI** is installed under **`%USERPROFILE%\tizen-studio`** (or run):

```powershell
.\scripts\install-tizen-studio.ps1
```

**Samsung TV SDK + TV emulator** (large download; **must run PowerShell as Administrator** once):

```powershell
.\scripts\install-tizen-tv-sdk.ps1
```

If TV extension activation fails, open **`%USERPROFILE%\tizen-studio\package-manager\package-manager.exe`**, add **Samsung Tizen TV SDK**, then install **TV-SAMSUNG-Public-Emulator** packages.

Optional full IDE: [Tizen Studio download](https://developer.tizen.org/development/tizen-studio/download) (same SDK path).

### Run KPV on the TV emulator

```powershell
. .\scripts\set-tizen-env.ps1
# Start a TV emulator from Tizen Device Manager (GUI)
.\scripts\install-kpv-wgt-emulator.ps1
```

Then use **Web Inspector** on the emulator for Settings / Refresh / hot-cache toasts.

**Cloud hardware:** [Samsung Remote Test Lab](https://developer.samsung.com/remotetestlab) if the emulator differs from your Samsung TV.

**Browser-only (partial):** `cd tizen && npm run test:sniff` / `test:play` — embed and playback helpers, not WGT install or hot bundle.

### Reference QA TV (physical — authoritative)

| Field | Value |
|-------|--------|
| Model | **QA55Q60AAWXXY** (2021 Q60A 55″) |
| OS | **Tizen 6.0** (does not upgrade to 7+ on this hardware) |
| Firmware | **T-NKLAUABC-2301.1** (BT - S) |

The installed **T-samsung-10.0-x86_64** emulator is **not** a stand-in for this set (filesystem, keyboard, and performance differ). Use the emulator for smoke tests; sign off **hot Refresh**, **Settings**, and **playback** on this TV.

**Checklist on the reference TV:**

1. Sideload latest **`KPV-v*.wgt`** from [kpv-releases](https://github.com/Evzy/kpv-releases) when the shell/cache fix changes.
2. **Refresh** — progress should move through download → saving → restart; header ends at **`v… · up to date`** matching GitHub.
3. **Settings** — site URL, **Save**; Back/Done should dismiss the keyboard without leaving Settings.
4. Play one live channel (resolved on the TV, "Resolving stream on TV…") and the test stream.

### Install and debug from this PC (replaces Apps2Samsung)

1. TV: **Apps** → **1 2 3 4 5** → Developer mode **On**, **Host PC IP** = this PC → restart TV.
2. Once: `%USERPROFILE%\tizen-studio\tools\certificate-manager\certificate-manager.exe` → **+** → **Samsung** → **TV** → profile name **`Kevy`** → sign in with your Samsung account → include the TV's DUID (pick the connected TV).
3. Deploy: `.\scripts\deploy-tv.ps1` (add `-Reinstall` if KPV on the TV was signed by another certificate; resets the site URL once).
4. Debug: `.\scripts\deploy-tv.ps1 -SkipBuild -Debug` → DevTools on `http://127.0.0.1:9222`.

## What we cannot automate yet

- Tizen **overwrite is not allowed** / hot-bundle install (needs Tizen FS APIs on device or emulator).
- Android **in-app APK update** install UI (manual or future UI test with mocked GitHub).
