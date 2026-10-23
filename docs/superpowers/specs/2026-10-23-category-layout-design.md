# Category layout: league rows, reorder, hide

## Goal

Under each sport on the home screen, show one collapsible row per league (the catalog `tag`).
Users reorder sports and leagues and hide either from a "Customize categories" screen in
Settings. Everything is remembered per device. Tizen TV app and Android app (phone and TV).

## Home screen

- Sport heading (collapsible, remembered as today).
- Under it, a smaller league heading per league, collapsible and remembered (key
  `Sport › League`), followed by its row of cards.
- A sport with one visible league shows no league heading (Darts, Golf, 24/7 Streams).
- Channels with an empty tag go in league `Other`.
- Hidden sports and leagues are not shown. A sport whose leagues are all hidden is not shown.
- Within a league row, live channels first (as today).
- If everything is hidden: "All categories are hidden — Settings → Customize categories."

## Order

- Default sport order: catalog order (sports with live games first, as today).
- Default league order: `Premier League` first, then catalog order. This replaces the v1.0.54
  "Premier League first in Football" channel sort.
- Once the user moves a sport, the saved sport order wins; once they move a league, that
  sport's saved league order wins. Items not in a saved list go after it, in default order.
- "Reset to default" clears order and hidden items (collapsed state is kept).

## Customize categories

- TV: Settings → "Customize categories" opens a full-screen list. Phone/Android TV: a new screen
  from Settings.
- Rows: each sport, then (if it has 2+ leagues) its leagues indented. First row: Reset to default.
- Each row: label, `Hide`/`Show`, `▲`, `▼`. Hidden rows are dimmed and labelled "Hidden".
- TV keys: ↑/↓ rows, ←/→ buttons, OK presses, Back closes and the home screen re-renders.
- Moving keeps focus on the moved item. Leagues move only within their sport.
- The list comes from the last loaded catalog (saved), so it works before the site responds.

## Storage

- TV `localStorage`: `kpv_category_prefs` `{sportOrder|null, leagueOrder:{sport:[...]}, hidden:[keys]}`,
  `kpv_known_categories` `[{name, leagues:[names]}]`, collapsed in existing
  `kpv_collapsed_categories` (now also league keys).
- Android `SharedPreferences` `kpv_browse`: same JSON under `category_prefs`, `known_categories`;
  collapsed in existing `collapsed_categories`.

## Components

- Tizen `js/category-prefs.js`: storage, `group`, `arrange`, `editorRows`, `moveSport`,
  `moveLeague`, `toggleHidden`, `reset`, `rememberKnown`, `loadKnown`, `leagueKey`.
- Tizen `js/category-editor.js`: the customize panel.
- Tizen `app.js` renders sports → leagues; `catalog-nav.js` navigates a flat list of stops
  (sport heads, league heads, rows) in DOM order, skipping collapsed content.
- Android `CategoryLayout.kt` (pure logic), `CategoryPrefsStore.kt` (storage),
  `CategoryEditorActivity.kt`; `BrowseItem.Header` gains `key` and `level`.

## Testing

Pure logic tested on both platforms without network or DOM; TV checked over CDP; Android on
the emulator.
