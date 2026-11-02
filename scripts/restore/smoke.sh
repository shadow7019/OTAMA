#!/bin/bash
# Smoke test for the restored (28b8ae9-era) player stack:
# boot dev server -> Bleach search -> Range-stream the top result (206 + bytes)
# -> status endpoint answers. Engine + routes are untouched by the restore;
# this proves the restored player's wire path still works end to end.
set -u
cd /home/z/my-project

setsid bash -c 'exec bun run dev' > /tmp/otama-dev.log 2>&1 < /dev/null &
ok=""
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && { ok=1; echo "[ok] server ready after ${i}s"; break; }
  sleep 1
done
[ -z "$ok" ] && { echo "[fail] server never became ready"; tail -8 /tmp/otama-dev.log; exit 1; }

python3 - <<'PY'
import json, urllib.parse, urllib.request

BASE = "http://localhost:3000"

def get(url, timeout=90, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    return urllib.request.urlopen(req, timeout=timeout)

# 1) scan Bleach: Thousand-Year Blood War S02E01 (the title the user tests with)
scan = get(f"{BASE}/api/torrent/search?type=tv&id=340620&season=2&episode=1"
           "&title=Bleach%3A%20Thousand-Year%20Blood%20War&year=2022")
servers = json.load(scan)["results"]
print(f"[search] {len(servers)} servers")
if not servers:
    print("[fail] empty server list"); raise SystemExit(1)
s = servers[0]
print(f"[top] {s['provider']} · {s['quality']} · seeders={s['seeders']} · match={s['match']}")

# 2) stream it like the player does: Range request, expect 206 + real bytes
url = (f"{BASE}/api/torrent/stream?id={s['id']}&dn={urllib.parse.quote(s['releaseName'])}"
       + (f"&file={s['fileIdx']}" if s.get("fileIdx") is not None else "")
       + "&season=2&episode=1")
import time
t0 = time.time()
r = get(url, timeout=80, headers={"Range": "bytes=0-2097151"})
code = r.status
total = 0
while time.time() - t0 < 60:
    chunk = r.read(65536)
    if not chunk:
        break
    total += len(chunk)
print(f"[stream] HTTP {code}, {total} bytes in {time.time()-t0:.1f}s")
assert code == 206 and total > 0, "stream did not produce data"

# 3) status endpoint the restored player polls every 2s
st = json.load(get(f"{BASE}/api/torrent/status?id={s['id']}", timeout=15))
print(f"[status] found={st.get('found')} progress={st.get('progress')} peers={st.get('peers')}")
assert st.get("found") is True
print("[PASS] restored player wire path verified end to end")
PY
rc=$?

curl -s -X POST http://localhost:3000/api/torrent/stop \
  -H 'Content-Type: application/json' -d "{\"id\":\"${s_id:-x}\"}" >/dev/null 2>&1 || true
exit $rc
