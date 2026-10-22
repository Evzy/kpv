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

There is **no Tizen TV emulator in CI**. Hot-cache and `tizen.filesystem` need real Tizen.

1. Install **[Tizen Studio](https://developer.tizen.org/development/tizen-studio/download)** with **TV** platform and **TV emulator** extension.
2. Build: `cd tizen && npm run package`
3. Sideload **`KPV.wgt`** to the TV emulator (Certificate Manager + Device Manager, same flow as Apps2Samsung on hardware).
4. **Web Inspector**: Tizen Studio → your emulator → debug `index.html` (Refresh, Settings, cache toasts).

**Cloud hardware:** [Samsung Remote Test Lab](https://developer.samsung.com/remotetestlab) for filesystem quirks that differ from the emulator.

**Browser-only (partial):** `cd tizen && npm run test:sniff` / `test:play` — embed and playback helpers, not WGT install or hot bundle.

## What we cannot automate yet

- Tizen **overwrite is not allowed** / hot-bundle install (needs Tizen FS APIs on device or emulator).
- Android **in-app APK update** install UI (manual or future UI test with mocked GitHub).
