# Otama Desktop (Tauri)

Native **macOS / Windows / Linux** app around the hosted Otama web app
(`https://otama2.space-z.ai`). The window is a thin system-webview shell, so
app updates ship automatically with the website — the desktop package only
needs rebuilding when the shell itself changes.

## One-time setup

1. Install Rust and the Tauri CLI:

   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   cargo install tauri-cli --version '^2'
   ```

2. Per-OS prerequisites:

   | OS | Prerequisite |
   | --- | --- |
   | macOS | Xcode Command Line Tools (`xcode-select --install`) |
   | Windows | WebView2 (preinstalled on Win 11) + Visual Studio Build Tools (C++ workload) + NSIS |
   | Linux | `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` |

3. Generate the launcher icons (from the repo root, into this project):

   ```bash
   cd native/desktop-tauri
   cargo tauri icon ../../public/icon-512.png
   ```

## Build

Run inside `native/desktop-tauri/` on the target platform
(cross-compiling macOS/Windows from Linux is not supported — build on the OS
itself, or use CI runners):

```bash
cargo tauri build
```

Output:

| OS | Artifacts |
| --- | --- |
| macOS | `src-tauri/target/release/bundle/dmg/Otama_1.0.0_*.dmg` + `.app` |
| Windows | `.../bundle/nsis/Otama_1.0.0_*.exe` installer + `.msi` |
| Linux | `.../bundle/appimage/*.AppImage` + `.deb` |

## Run in dev

```bash
cargo tauri dev
```

## Pointing at a different host

Edit `src-tauri/tauri.conf.json` → `app.windows[0].url`.
