# Phone companion (paired only)

Stream URLs are **never** exposed on the LAN unless:

1. **Android KPV** → Settings → **TV companion mode** is **ON** (and the app is in the foreground).
2. **Samsung TV KPV** → Settings → **Phone companion** is **ON**, phone URL entered, and **PIN pairing** succeeded.

## Pair

1. Phone: enable companion → note **6-digit PIN** and `http://192.168.x.x:8765`.
2. TV: enable companion, enter that URL, enter PIN, **Save**.
3. TV stores a **bearer token**; all `/resolve`, `/catalog/playback`, `/prefetch` requests require `Authorization: Bearer …`.

## Without pairing

- Phone returns **401** on stream endpoints.
- TV uses the **site API only** (no phone resolve, no companion catalog).

## Unpair

- Phone: **Unpair all TVs** in settings.
- TV: turn companion off and Save (clears token).
