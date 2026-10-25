# App unlock code (Android APK) — design

## Goal

Stop casual sharing of the release APK: a fresh install (or the first launch after this feature
ships) shows a lock screen until a per-device unlock code is entered once. No server. The owner
works out each device's code in their head. Updates keep a device unlocked; shipping a new key
revokes every device.

## Threat model

Casual sharing only (someone forwards the APK to a friend). The key is in the app, so a determined
person could extract it, or derive it from one device code / unlock code pair. Accepted.

## The rule

- **Device code** — 6 digits shown on the lock screen, stable per device: the first 8 bytes of
  `SHA-256("kpv-unlock:" + ANDROID_ID)` as an unsigned number, mod 1,000,000, zero-padded.
  `ANDROID_ID` is per device + signing key (Android 8+), so it survives updates and reinstalls.
  Empty `ANDROID_ID` falls back to a random id generated once and stored in prefs.
- **Key** — 6-digit owner secret, a constant in the code (private repo). Never shown.
- **Unlock code** — device code plus key, digit by digit, no carry:
  `unlock[i] = (device[i] + key[i]) mod 10`.

Example: device `482177` + key `305912` → unlock `787089`.

## Behaviour

- `MainActivity` checks `AppUnlock.isUnlocked(context)` before anything else; if locked it shows
  the lock screen (`UnlockActivity`) and finishes until unlocked.
- Lock screen (phone and TV): title, "Device code: 482 177", a 6-digit numeric field, Unlock
  button, short hint ("Ask the app owner for your unlock code"). TV: field focused on open; remote
  number keys and the on-screen keyboard work; IME Done submits.
- Wrong code: inline error "That code doesn't match this device." No lockout.
- Right code: store the entered code in prefs (`kpv_unlock` / `unlock_code`) and open the catalog.
- Every launch re-checks: stored code == expected code for this device with the current key.
  - Same key in an update → still unlocked.
  - New key in an update → locked again (revokes everyone).
  - Prefs restored onto another device → device code differs → locked.
- Existing installs lock on the first update that includes this (no grandfathering).

## Components

- **`UnlockCode`** (pure Kotlin, unit tested): `deviceCode(id: String): String`,
  `unlockCode(deviceCode: String, key: String): String`, `matches(input, deviceCode, key)`
  (ignores spaces/dashes).
- **`AppUnlock`**: reads `ANDROID_ID` (or stored fallback), holds `KEY`, `isUnlocked(context)`,
  `tryUnlock(context, input): Boolean`, `deviceCode(context)`.
- **`UnlockActivity`** + `activity_unlock.xml` + strings.
- **`MainActivity`**: gate at the top of `onCreate` (runs on every cold launch).

## Testing

- Unit: digit-wise add with no carry, leading zeros preserved, same id → same code, different ids
  → different codes, `matches` accepts spaced/dashed input and rejects wrong codes, key change
  invalidates a previously valid code.
- Manual: emulator phone + TV: lock screen appears, wrong code error, right code unlocks, relaunch
  stays unlocked. Owner's real phone and TV unlocked remotely over adb after release.

## Out of scope

Tizen WGT, per-person revocation, attempt limits, server checks.
