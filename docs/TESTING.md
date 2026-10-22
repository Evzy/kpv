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

## What we cannot automate yet

- Tizen **overwrite is not allowed** / hot-bundle install (needs Tizen FS APIs on device or emulator).
- Android **in-app APK update** install UI (manual or future UI test with mocked GitHub).
