# KPV for Samsung Tizen TV (.wgt)

Packaging follows **[NuvioMedia/NuvioTizen](https://github.com/NuvioMedia/NuvioTizen)** (JSZip, `config.xml` shape, `tv-samsung` profile). Apps2Samsung signs at install time.

## Build the widget

```powershell
cd C:\Users\User\cows-tv\tizen
npm install
npm run package
```

Creates **`KPV.wgt`** (application id **`KpvTV001.KPV`**).

## Install

1. TV **Developer Mode** on, **Host PC IP** set, TV restarted.
2. **Apps2Samsung** → Custom WGT → select `KPV.wgt`.
3. Version field: **`1.0.0`** (not the filename).
4. If an old KPV install exists, remove it on the TV first.

Parsing errors usually meant bad zip paths; use **`npm run package`** (not the old PowerShell zip).

## App logic

Same as Android KPV: gear → site URL → catalog API → play (AVPlay or embed iframe).
