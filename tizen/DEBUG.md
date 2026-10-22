# Installing and debugging KPV on the TV

KPV uses its own package id **`KpvPlayer1`** (app **`KpvPlayer1.KPV`**). It used to share `NuvioTV001` with Nuvio TV so Apps2Samsung's certificate would accept it, but apps in one package share localStorage, which exposed Nuvio's tokens to KPV. Install from this PC with your own Samsung certificate instead.

## One-time setup (install from this PC)

1. **TV:** Apps → type `12345` → Developer Mode **On**, Host PC IP = this PC's IP → restart the TV.
2. **Samsung certificate extension:** run `C:\Users\User\tizen-studio\package-manager\package-manager.exe` **as administrator** → Extension SDK → install **Samsung Certificate Extension** (and **TV Extensions** if offered).
3. **Certificate:** run `C:\Users\User\tizen-studio\tools\certificate-manager\certificate-manager.exe` → **+** → **Samsung** → **TV** → profile name **`Kevy`** (the default in `deploy-tv.ps1`) → create a new author certificate (any name/password) → log in with your Samsung account → distributor certificate with privilege level **Public**, adding the TV's DUID (`sdb -s <tv>:26101 shell 0 getduid`; reference TV: `U7CFC353OCISU`).
4. **First install:** `.\scripts\deploy-tv.ps1`. If an old KPV signed by a different certificate is on the TV, add `-Reinstall`.

The certificate is tied to the DUIDs listed in it; a new TV needs its DUID added to the distributor certificate.

## Install errors

| Code | Meaning |
|------|---------|
| `118, -12` | Signature / certificate mismatch: wrong profile, DUID not in the distributor cert, or an existing install signed by another certificate (`-Reinstall`) |
| `118, -19` | Parsing error: bad zip layout or `config.xml` ids |

## DevTools

`.\scripts\deploy-tv.ps1 -SkipBuild -Debug` or, without reinstalling:

```powershell
sdb -s 192.168.68.53:26101 shell 0 debug KpvPlayer1.KPV   # prints a port
sdb -s 192.168.68.53:26101 forward tcp:9222 tcp:<port>
node scripts/tv-cdp.mjs eval "location.href"
```
