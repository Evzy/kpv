# App unlock code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-time per-device unlock code gating the Android app, offline, revocable by changing the key.

**Architecture:** Pure `UnlockCode` maths (unit tested); `AppUnlock` reads `ANDROID_ID`, holds the key and the stored code; `UnlockActivity` is the lock screen; `MainActivity` gates on launch.

**Tech Stack:** Kotlin, Android Views, SharedPreferences, JUnit 4.

## Global Constraints

- Device code: first 8 bytes of `SHA-256("kpv-unlock:" + id)` unsigned, mod 1,000,000, zero-padded to 6.
- Unlock: `(device[i] + key[i]) mod 10` per digit.
- Prefs `kpv_unlock`: `unlock_code`, `fallback_id`.
- Re-check stored code against the current key on every launch.
- Android only.

---

### Task 1: `UnlockCode` (TDD)

**Files:** Create `unlock/UnlockCode.kt`; Test `unlock/UnlockCodeTest.kt`.

**Produces:** `object UnlockCode { fun deviceCode(id: String): String; fun unlockCode(deviceCode: String, key: String): String; fun matches(input: String, deviceCode: String, key: String): Boolean }`

- [ ] Tests: `unlockCode("482177","305912") == "787089"`; leading zeros (`"000001"+"000009" == "000000"`); `deviceCode` is 6 digits, stable, differs for different ids; `matches` accepts `"787 089"` / `"787-089"`, rejects wrong and short input; changing key invalidates.
- [ ] Run (fail) → implement → run (pass) → commit.

### Task 2: `AppUnlock`, lock screen, gate

**Files:** Create `unlock/AppUnlock.kt`, `UnlockActivity.kt`, `res/layout/activity_unlock.xml`; Modify `MainActivity.kt`, `AndroidManifest.xml`, `strings.xml`.

**Produces:** `object AppUnlock { fun deviceCode(context): String; fun isUnlocked(context): Boolean; fun tryUnlock(context, input): Boolean }`

- [ ] `AppUnlock` with `KEY`, `ANDROID_ID` + stored random fallback.
- [ ] `UnlockActivity`: device code, numeric field (focused), Unlock button, error text; on success start `MainActivity` and finish.
- [ ] `MainActivity.onCreate`: if locked, start `UnlockActivity` and `finish()` before other setup.
- [ ] Build, unit tests, emulator phone + TV check; release; unlock owner devices over adb.
