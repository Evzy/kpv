# Android Chromecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native Google Cast on Android phone/tablet with catalog + player controls and LAN HLS relay for headers.

**Architecture:** Cast SDK + `MediaRouteButton`; `CastRelayServer` (NanoHTTPD :8767) proxies playlists/segments with `ResolvedStream` headers; default receiver `CC1AD845`.

**Tech Stack:** Kotlin, play-services-cast-framework 22.0.0, mediarouter 1.7.0, NanoHTTPD.

## Global Constraints

- Phone/tablet sender only — hide Cast UI when `TvHelper.isTelevision`.
- Cast button on catalog after `catalogReady`; on player after `STATE_READY`.
- Default media receiver + LAN relay (no custom CAF app in v1).

---

Implementation completed inline in session 2026-10-22.

**Files added:** `CastController.kt`, `CastRelayServer.kt`, `CastHlsRelay.kt`, `CastOptionsProvider.kt`, `CastHlsRelayTest.kt`

**Files modified:** `MainActivity.kt`, `PlayerActivity.kt`, `AndroidManifest.xml`, `build.gradle.kts`, `strings.xml`

**Verify:** `.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest`
