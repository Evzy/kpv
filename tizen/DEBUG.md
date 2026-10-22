# Debugging KPV `.wgt` install (Apps2Samsung)

## Reading your log (`debug_2026-10-22_01-24-41-071.log`)

| Step | Log line | Meaning |
|------|----------|---------|
| TV OK | `platform_version: 6.0`, `can_launch: tv-samsung` | TV is fine for sideload |
| Cert OK | `[sdb] resign ... → exit 0` | Apps2Samsung **signed** the WGT |
| **Failure** | `install failed[118, -19], reason: Parsing error` | TV rejected **package contents**, not signing |
| Compare | `NuvioTV001.NuvioTV` installed same session | Same tool + TV + cert path **works** for Nuvio |

So this is **not** “unsigned” or “Developer Mode off”. It is **widget manifest / package id vs certificate author id**, or invalid archive layout.

### Likely cause (from your log)

Install target: `KpvTV001.KPV` with `package="KpvTV001"`.

Your TV already has sideload apps signed with author prefix **`NuvioTV001`** (Nuvio TV). Samsung expects `config.xml` **`package="..."`** to match the **author id on the certificate** Apps2Samsung uses when re-signing. A mismatch often surfaces as **118 / -19 Parsing error** (not -12 cert signature).

**Fix in this repo:** default ids are now **`NuvioTV001.KPV`** / `package="NuvioTV001"` (separate app from Nuvio TV, same author prefix as your working install).

If you use a **new** author id, set env when building:

```powershell
$env:TIZEN_PACKAGE_ID = "YourAuthorPrefix"
$env:TIZEN_APP_ID = "YourAuthorPrefix.KPV"
npm run package
```

Find author prefixes on the TV in Apps2Samsung **Installed apps** → `app_tizen_id` (e.g. `NuvioTV001.NuvioTV` → prefix `NuvioTV001`).

## Install checklist

1. Build: `npm install` then `npm run package`
2. Apps2Samsung → Custom WGT → pick `KPV.wgt`
3. Version **`1.0.0`** (not the filename)
4. If a failed `KpvTV001` / `NuvioTV001.KPV` remains, remove it on TV first
5. Share debug log again if it still fails

## Binary search

1. **`KPV-Hello.wgt`** (minimal; build with hello config — ask if you need this packaged)
2. If Hello installs → full KPV issue is app files
3. If Hello fails → ids/cert/zip still wrong

## What -19 is not

- **-12** → signature / wrong certificate  
- **118 alone** → often space or generic (your subcode **-19** is parsing)

## Export log (Android Apps2Samsung)

Settings → **Share debug log** after a failed install.
