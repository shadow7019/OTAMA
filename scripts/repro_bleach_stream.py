#!/usr/bin/env python3
"""Reproduce the Bleach S2E1 playback path: hit /api/torrent/stream for a
candidate server, measure bytes flowing, and concurrently measure
/api/torrent/status latency — the poll whose failures trigger the
'connection lost' banner in the player."""

import json
import threading
import time
import urllib.parse
import urllib.request

BASE = "http://localhost:3000"

def get(url, timeout=30, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    return urllib.request.urlopen(req, timeout=timeout)

# 1) fresh scan -> candidate servers
scan = get(f"{BASE}/api/torrent/search?type=tv&id=340620&season=2&episode=1"
           "&title=Bleach%3A%20Thousand-Year%20Blood%20War&year=2022", timeout=90)
servers = json.load(scan)["results"]
cands = [servers[0], servers[1], servers[3]]  # BitSearch-167, NyaaSi-67, TPB-3

for s in cands:
    name = s["releaseName"][:44]
    url = (f"{BASE}/api/torrent/stream?id={s['id']}&dn={urllib.parse.quote(s['releaseName'])}"
           + (f"&file={s['fileIdx']}" if s.get("fileIdx") is not None else "")
           + "&season=2&episode=1")
    lat = {"max": 0.0, "n": 0, "fail": 0}
    stop = threading.Event()
    sent_bytes = {"n": 0}

    def poll():
        while not stop.is_set():
            t0 = time.time()
            try:
                get(f"{BASE}/api/torrent/status?id={s['id']}", timeout=8)
                dt = time.time() - t0
                lat["max"] = max(lat["max"], dt)
                lat["n"] += 1
            except Exception:
                lat["fail"] += 1
            stop.wait(2.0)

    th = threading.Thread(target=poll, daemon=True)
    th.start()
    t0 = time.time()
    total = 0
    first_byte = None
    try:
        r = get(url, timeout=70, headers={"Range": "bytes=0-"})
        while time.time() - t0 < 45:
            chunk = r.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if first_byte is None:
                first_byte = time.time() - t0
    except Exception as e:
        print(f"  stream error: {e}")
    stop.set()
    th.join(timeout=10)
    st = get(f"{BASE}/api/torrent/status?id={s['id']}", timeout=8)
    j = json.load(st)
    kb = total / 1024
    rate = kb / max(time.time() - t0, 1)
    print(f"\n== {s['provider']} seeders={s['seeders']} :: {name}")
    print(f"   stream: {kb:.0f} KB in 45s ({rate:.0f} KB/s), first byte {first_byte and round(first_byte,1)}s")
    print(f"   status polls: ok={lat['n']} fail={lat['fail']} max_latency={lat['max']:.2f}s  (banner triggers at >8s x2)")
    print(f"   engine: found={j.get('found')} ready={j.get('ready')} progress={j.get('progress')} speed={j.get('speed')} peers={j.get('peers')}")
