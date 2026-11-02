#!/usr/bin/env python3
"""Audit real playback for a matrix of content: search → top servers →
try streaming the first bytes through /api/torrent/stream, measure
time-to-first-data and swarm stats. This is the 'are servers working'
ground truth."""
import json
import subprocess
import sys
import time
import urllib.request

BASE = "http://localhost:3000"

SPECS = [
    ("movie", 872585, "Oppenheimer", 2023, 1, 1),
    ("movie", 693134, "Dune Part Two", 2024, 1, 1),
    ("movie", 27205, "Inception", 2010, 1, 1),
    ("tv", 1399, "Game of Thrones", 2011, 1, 1),
    ("tv", 66732, "Stranger Things", 2016, 4, 1),
    ("tv", 30983, "Bleach", 2004, 1, 1),
    ("tv", 37854, "One Piece", 1999, 21, 1),
]


def get(url, timeout=90):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except Exception as e:
        return {"error": str(e)}


def stream_probe(info_hash, dn, seconds=25):
    """curl a 0-1MB range; report status + bytes + time."""
    from urllib.parse import quote
    url = f"{BASE}/api/torrent/stream?id={info_hash}&dn={quote(dn)}&file=0"
    t0 = time.time()
    p = subprocess.run(
        ["curl", "-s", "--max-time", str(seconds), "-r", "0-1000000", "-o", "/dev/null",
         "-w", "%{http_code} %{size_download}", url],
        capture_output=True, text=True, timeout=seconds + 10)
    dt = time.time() - t0
    parts = (p.stdout or "").split()
    code = parts[0] if parts else "000"
    size = int(parts[1]) if len(parts) > 1 else 0
    st = get(f"{BASE}/api/torrent/status?id={info_hash}", timeout=10)
    peers = st.get("peers", 0)
    prog = st.get("progress", 0)
    speed = st.get("speed", 0)
    return code, size, dt, peers, prog, speed


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    rows = []
    for typ, tid, title, year, s, e in SPECS:
        label = f"{title} S{s}E{e}" if typ == "tv" else title
        if only and only.lower() not in label.lower():
            continue
        if typ == "movie":
            q = f"type=movie&id={tid}&title={title.replace(' ', '+')}&year={year}"
        else:
            q = f"type=tv&id={tid}&title={title.replace(' ', '+')}&season={s}&episode={e}"
        d = get(f"{BASE}/api/torrent/search?{q}")
        rs = d.get("results", [])
        if not rs:
            rows.append((label, "NO RESULTS", 0, "", 0))
            continue
        # take the best-scoring 2 servers
        tested = 0
        line_bits = []
        for r in rs[:2]:
            code, size, dt, peers, prog, speed = stream_probe(r["id"], r["releaseName"][:80])
            ok = code == "206" and size > 100000
            tag = "PLAYS" if ok else ("wait" if code == "206" else f"fail{code}")
            line_bits.append(
                f"S[{r['provider']}/{r['quality']}/{r['seeders']}s]={tag}({dt:.0f}s, {size//1024}KB, p{peers}, {prog:.0%})")
            if ok:
                break
            tested += 1
        rows.append((label, f"{len(rs)} srv", tested, " ".join(line_bits), 0))
        print(f"{label:22s} {line_bits}", flush=True)
    print("\n==== summary ====")
    for row in rows:
        print(row)


if __name__ == "__main__":
    main()
