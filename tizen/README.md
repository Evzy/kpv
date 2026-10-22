# KPV for Samsung Tizen TV (.wgt)

Packaging follows **[NuvioMedia/NuvioTizen](https://github.com/NuvioMedia/NuvioTizen)** (JSZip, `config.xml` shape, `tv-samsung` profile). The `.wgt` is unsigned; it is signed with a Samsung certificate profile at install time.

## Build the widget

```powershell
cd C:\Users\User\kpv\tizen
npm install
npm run package
```

Creates **`KPV.wgt`** (application id **`KpvPlayer1.KPV`**).

## Install from this PC

```powershell
.\scripts\deploy-tv.ps1            # build, sign with profile "Kevy", install, launch
.\scripts\deploy-tv.ps1 -Debug     # same, launched with DevTools on localhost:9222
```

One-time setup is in [DEBUG.md](DEBUG.md#one-time-setup-install-from-this-pc).

## App logic

Same as Android KPV: gear → site URL → catalog API → play (AVPlay or embed iframe).
