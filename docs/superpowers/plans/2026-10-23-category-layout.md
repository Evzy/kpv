# Category Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** League rows under each sport, user reorder/hide via a Customize screen, remembered.

**Architecture:** Pure layout module per platform (group → arrange with prefs; editor ops),
thin storage, then UI (home render + navigation, customize screen).

**Tech Stack:** Tizen ES2017 JS (`node:vm` tests), Android Kotlin (JUnit 4, org.json).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-23-category-layout-design.md`.
- League key: `"$sport › $league"`. Empty tag → `Other`. Default league order: Premier League first.
- No optional chaining in Tizen JS.

### Task 1: Tizen `CategoryPrefs` (TDD)
- Create `tizen/js/category-prefs.js`, `tizen/scripts/test-category-prefs.mjs`; add to `test:tizen`, `build-flat.mjs` jsOrder.
- Tests: grouping + `Other`; default league order; arrange with saved sport/league order and new items appended; hidden sport/league; `showLeagues` only for 2+ visible; editor rows; move up/down incl. edges; toggleHidden; reset; known round-trip.
- Revert the v1.0.54 pinned-tag channel sort (live-first only) and move its test here.

### Task 2: Tizen home screen + navigation + customize panel
- `app.js` renders via `CategoryPrefs.arrange`; `catalog-nav.js` stop-based navigation and league toggles; CSS for `.league`, `.league-head`, editor.
- `index.html`: Settings button `#btn-categories`, `#category-editor` section; `category-editor.js` panel; `settings.js` row; `app.js` key routing and Back.
- Verify: `npm run test:tizen`, deploy, CDP check of sections/leagues and editor.

### Task 3: Android `CategoryLayout` + store (TDD)
- `CategoryLayout.kt` mirroring Task 1; `CategoryPrefsStore.kt`; `CategoryLayoutTest.kt`.
- Revert pinned sort in `StreamLive.kt` and its test.

### Task 4: Android UI
- `BrowseItem.Header(key, title, collapsed, level)`; `flattenForBrowse(sports, television, collapsed)`; header holder level styling; `CatalogBrowseView.refreshLayout()`; `MainActivity.onResume` refresh.
- `CategoryEditorActivity` + layouts; Settings button; manifest.
- Verify: `./gradlew :app:assembleDebug :app:testDebugUnitTest`, emulator.

### Task 5: Release 1.0.55, push
