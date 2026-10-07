# Install Treestand TV on your LG

This is an LG webOS test app, not the Android APK and not a browser bookmark. It opens as Treestand TV from the LG home screen. It connects directly to Treestand's guest-display endpoint and bundles the existing welcome player, default photos and branding locally. Internet is required for pairing, refreshed room content and host-uploaded photos.

1. On the LG TV, install **Developer Mode** from LG Apps. Sign in using an LG Developer account, turn **Dev Mode Status** on, and allow the TV to restart. Then enable **Key Server**.
2. On your Windows computer on the same home network, install Node.js and LG's CLI: `npm install -g @webos-tools/cli@3.2.6`.
3. Run `ares-setup-device`. Add a device named `treestand-tv`, using the TV's local IP address, port `9922` and user `prisoner`. No SSH password is needed.
4. Run `ares-novacom --device treestand-tv --getkey`. Enter the six-character passphrase shown in Developer Mode. This is LG's device passphrase, separate from the Treestand pairing code.
5. In the folder containing the downloaded package, run:

```
ares-install --device treestand-tv com.cerbtek.treestand.tv_0.2.2_all.ipk
ares-launch --device treestand-tv com.cerbtek.treestand.tv
```

6. In Treestand **Guest Experience**, create a new pairing code for the room. Enter its four groups in the app. Your browser's existing pairing is separate; this app needs its own code. New codes omit O and 0, expire after 30 minutes and work once.

Use the remote arrows and OK, or the Magic Remote pointer. Back closes house information first; Back on the main screen asks whether to exit. Reopening should restore pairing. Screen settings offers an explicit disconnect confirmation. Host revocation still invalidates the credential.

Developer Mode is temporary: extend its remaining session in the Developer Mode app before expiry. LG removes test-installed apps when Developer Mode is disabled. Permanent customer installation requires LG Seller Lounge submission, acceptance and store publication. This pilot has not been submitted to LG Apps. Installation and native video playback have been verified on an LG 86UQ7590PUD; use the acceptance checks below for each additional TV.

## Acceptance on the LG 86UQ7590PUD

Check the home-screen icon, full-screen launch, pairing keyboard and remote focus, reconnect after closing/restarting, continuous bundled and uploaded photo videos, all four house-information panels, automatic music and volume/pause, Back/exit confirmation, network loss clearing guest content, and host revocation. The app plays full-viewport MP4 video using LG's supported screensaver exception, with a bundled woodland fallback during connection errors. Other TV power settings remain under the TV's control; the app does not force boot launch. Each content refresh uses the existing one-minute interval.

## Build from the repository

```
npm ci --ignore-scripts
python -m pip install Pillow==12.3.0
# Make sure FFmpeg is available on PATH.
python scripts/render-starter-video.py
npm run build:webos
npm install --prefix /tmp/treestand-webos-cli @webos-tools/cli@3.2.6 --ignore-scripts
/tmp/treestand-webos-cli/node_modules/.bin/ares-package webos-tv/build --outdir webos-tv/releases
```

The packaging CLI is an isolated development tool, not a production runtime dependency. The app stores only a device-scoped credential; no host login or administrative key is packaged. HTML uses a classic bundled script and relative assets for local app launches. New app code requires repackaging and installation; room settings continue refreshing from Treestand.

LG references:
- https://webostv.developer.lge.com/develop/getting-started/developer-mode-app
- https://webostv.developer.lge.com/develop/references/appinfo-json
- https://webostv.developer.lge.com/develop/guides/back-button

Uploaded photos are converted privately into video automatically. Conversion can take a few minutes; finished videos appear on the next one-minute refresh. See [photo video setup](../docs/display-video.md).
