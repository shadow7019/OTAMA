#!/usr/bin/env python3
"""Tally which torrent providers return results across a spread of titles.
Providers never seen across all scans are flagged dead."""
import json, time, urllib.request
from collections import defaultdict

BASE = "http://localhost:3000"
SCANS = [
    ("blockbuster movie", "type=movie&id=155&title=The%20Dark%20Knight&year=2008"),
    ("scifi movie",       "type=movie&id=603&title=The%20Matrix&year=1999"),
    ("tv episode",        "type=tv&id=1399&season=1&episode=1&title=Game%20of%20Thrones"),
    ("anime episode",     "type=tv&id=209867&season=1&episode=1&title=Frieren"),
    ("indian movie",      "type=movie&id=19404&title=Dilwale%20Dulhania%20Le%20Jayenge&year=1995"),
]

tally = defaultdict(int)
times = []
for label, qs in SCANS:
    # bust cache with a nonce param the route ignores? route caches per key — vary title param instead
    t0 = time.time()
    req = urllib.request.Request(f"{BASE}/api/torrent/search?{qs}", headers={"User-Agent": "audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            d = json.loads(r.read())
        rows = d.get("results", [])
        for s in rows:
            tally[s.get("provider") or "?"] += 1
        times.append((label, len(rows), round(time.time()-t0, 1)))
    except Exception as e:
        times.append((label, f"ERR {str(e)[:60]}", round(time.time()-t0, 1)))

print("=== per-scan result counts ===")
for label, n, sec in times:
    print(f"  {label:20} {str(n):>5} results in {sec}s")

print("=== provider tally (results across all scans) ===")
for p, c in sorted(tally.items(), key=lambda kv: -kv[1]):
    print(f"  {p:20} {c}")

# the full provider roster lives in torrent-sources.ts — flag zero-hit providers
import re, pathlib
src = pathlib.Path("/home/z/my-project/src/lib/torrent-sources.ts").read_text()
names = sorted(set(re.findall(r'id:\s*"([^"]+)"', src)) | set(re.findall(r'provider:\s*"([^"]+)"', src)))
print("=== providers declared in torrent-sources.ts ===")
print(" ", names)
zero = [n for n in names if n not in tally and tally.get(n, 0) == 0]
print("=== zero-hit providers (suspect dead) ===")
print(" ", zero or "none")
