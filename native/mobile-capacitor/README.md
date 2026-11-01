# Otama Mobile (Capacitor)

Native **Android** and **iOS** app shells around the hosted Otama web app
(`https://otama2.space-z.ai`). Website updates ship to the installed apps
automatically; the store binary only changes when the shell config changes.

## One-time setup

```bash
cd native/mobile-capacitor
npm install
npm run assets          # generates app icons + splash from assets/icon.png
```

## Android

Prereq: Android Studio (or Android SDK + Gradle), JDK 17.

```bash
npx cap add android     # first time only (creates android/)
npm run sync            # after any config change
npm run open:android    # opens Android Studio
```

Then in Android Studio: **Build → Build Bundle(s)/APK(s)** —
`android/app/build/outputs/`:
- `apk/release/app-release.apk` (sideload)
- `bundle/release/app-release.aab` (Play Store — needs signing config)

## iOS

Prereq: a Mac with Xcode 15+.

```bash
npx cap add ios         # first time only (creates ios/)
npm run sync
npm run open:ios        # opens Xcode
```

Then in Xcode: set Team + bundle identifier (`space.otama.app`) under the app
target, and **Product → Archive** for App Store / TestFlight.

## Where to change things

- Host URL: `capacitor.config.ts` → `server.url` + `server.allowNavigation`
- App name / id: `capacitor.config.ts` → `appName` / `appId`
- Icons & splash: `assets/icon.png` → rerun `npm run assets`

`android/` and `ios/` are generated and gitignored — never hand-edit them
except through Xcode/Android Studio project settings.
