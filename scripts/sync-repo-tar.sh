#!/bin/bash
# Refresh /home/sync/repo.tar — the archive the platform restores from on
# every sandbox recycle (/start.sh wipes /home/z/my-project and untars it,
# then boots via .zscripts/dev.sh). Without this after every commit, the
# live site reverts to pre-fix code on the next recycle.
#
# Format mirrors the platform's own archive: top-level members WITHOUT a ./
# prefix, including .git, .env, .zscripts, db, download; excluding
# node_modules and .next (boot reinstalls/rebuilds those; ~6 MB budget).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="/home/sync/repo.tar"

cd "$PROJECT_DIR"
# everything at top level except the two heavy generated dirs; -mindepth 1
# also skips "." itself so members come out unprefixed, matching the old tar
mapfile -t MEMBERS < <(find . -mindepth 1 -maxdepth 1 \
  ! -name node_modules ! -name .next -printf '%f\n' | sort)

tar -cf "$OUT" -C "$PROJECT_DIR" \
  --exclude='native/mobile-capacitor/node_modules' \
  --exclude='native/mobile-capacitor/android/.gradle' \
  --exclude='native/mobile-capacitor/android/build' \
  --exclude='native/mobile-capacitor/android/app/build' \
  --exclude='native/mobile-capacitor/android/local.properties' \
  --exclude='native/desktop-tauri/src-tauri/target' \
  "${MEMBERS[@]}"
echo "repo.tar refreshed: $(du -h "$OUT" | cut -f1), ${#MEMBERS[@]} top-level members, $(date -u '+%FT%TZ')"
