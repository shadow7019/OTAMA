#!/bin/bash
# Self-contained E2E: torrent player disambiguation UI check.
# The dev server only lives inside this call, so everything happens here.
set -u
cd /home/z/my-project

# ---- 1. start server ----
setsid bash -c 'exec bun run dev' > /tmp/cinex-dev.log 2>&1 < /dev/null &
SERVER_PID=$!
ok=""
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && { ok=1; echo "[ok] server ready after ${i}s"; break; }
  sleep 1
done
[ -z "$ok" ] && { echo "[fail] server never became ready"; tail -5 /tmp/cinex-dev.log; exit 1; }

# ---- 2. open home ----
agent-browser open http://localhost:3000 >/dev/null 2>&1
agent-browser wait --load networkidle --timeout 30000 >/dev/null 2>&1
sleep 2
state=$(agent-browser eval "JSON.stringify({cards: document.querySelectorAll('[data-testid=\"media-card\"]').length, iframes: document.querySelectorAll('iframe').length})")
echo "[home] $state"

# ---- 3. search Breaking Bad ----
agent-browser eval "
  const input = document.querySelector('input[aria-label=\"Search movies and TV shows\"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Breaking Bad');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  'typed'
" >/dev/null 2>&1
agent-browser wait --fn "document.querySelectorAll('[data-testid=\"media-card\"]').length > 0" --timeout 30000 >/dev/null 2>&1
sleep 2
clicked=$(agent-browser eval "(() => { const cards = [...document.querySelectorAll('[data-testid=\"media-card\"]')]; const target = cards.find(c => c.innerText.includes('Breaking Bad')) || cards[0]; const btn = target && target.querySelector('button[aria-label^=\"View details for\"]'); if (btn) { btn.click(); return 'card-clicked'; } return 'no-card'; })()")
echo "[search] $clicked"
sleep 2
agent-browser eval "document.querySelector('[aria-label^=\"Play \"]') ? 'detail open, play button present' : document.body.innerText.slice(0,120)"

# ---- 4. open the player (defaults to S01E01) ----
agent-browser eval "document.querySelector('[aria-label^=\"Play \"]')?.click(); 'play clicked'"
agent-browser wait --fn "!!document.querySelector('video') || document.body.innerText.includes('Scanning torrent networks') || document.body.innerText.includes('no healthy torrent')" --timeout 30000 >/dev/null 2>&1
sleep 15   # give the torrent search + auto-pick time to settle

# ---- 5. inspect the player ----
agent-browser eval "JSON.stringify({
  chips: [...document.querySelectorAll('button[title*=\"seeders\"]').values()].map(b => b.innerText.replace(/\n/g, ' ')).slice(0, 8),
  hasVideo: !!document.querySelector('video'),
  iframes: document.querySelectorAll('iframe').length
})"
echo "--- stream requests ---"
agent-browser network requests --filter "/api/torrent/stream" 2>/dev/null | head -5
echo "--- search requests ---"
agent-browser network requests --filter "/api/torrent/search" 2>/dev/null | head -3
echo "--- page errors ---"
agent-browser errors 2>&1 | head -5
agent-browser screenshot /tmp/render/player-e2e.png >/dev/null 2>&1 && echo "[shot] saved"

agent-browser close >/dev/null 2>&1
echo "[done]"
