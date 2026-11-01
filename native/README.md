# Otama Apps — macOS · Windows · Android · iOS

Three ways to get Otama as an app on every platform. All of them load the same
hosted app (`https://otama2.space-z.ai`), so playback, search, subtitles and
continue-watching stay identical everywhere.

## 0. PWA — install right now, no build step

The web app is a full PWA (offline shell + `beforeinstallprompt` chip).

| Platform | How to install | Result |
| --- | --- | --- |
| macOS | Chrome/Edge → address-bar install icon → "Install" | Dock app, own window |
| Windows | Chrome/Edge → address-bar install icon → "Install" | Start-menu app, own window |
| Android | Chrome → ⋮ menu → "Install app" / "Add to Home screen" | Home-screen app, fullscreen |
| iOS | Safari → Share → "Add to Home Screen" | Home-screen app, fullscreen |

For most users this is all they need.

## 1. Desktop — `desktop-tauri/` (Tauri, Rust)

Real `.dmg` (macOS), `.exe` installer (Windows), `.AppImage` (Linux) with a
tiny system-webview shell (~5 MB). Build on the target OS — see its README.

```bash
cd native/desktop-tauri && cargo tauri build
```

## 2. Mobile — `mobile-capacitor/` (Capacitor, Android/iOS)

Store-grade APK/AAB (Android) and IPA (iOS). Android builds anywhere with
Android Studio; iOS requires a Mac with Xcode — see its README.

```bash
cd native/mobile-capacitor
npx cap add android && npm run open:android   # Android
npx cap add ios    && npm run open:ios        # iOS (Mac only)
```

## Updating

Because every shell just wraps `https://otama2.space-z.ai`, site fixes ship to
all four platforms instantly — rebuild a shell only for icon/name/config
changes.
