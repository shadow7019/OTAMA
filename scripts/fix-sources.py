#!/usr/bin/env python3
"""Fix Sintel + Night of the Living Dead, and inspect file lists of large items
for smaller playable derivatives. Also inspect some episode items for accurate titles."""
import json
import time
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (compatible; StreamChecker/1.0)"}

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def search(q, rows=8):
    import urllib.parse
    qs = urllib.parse.quote(q)
    url = f"https://archive.org/advancedsearch.php?q={qs}&fl%5B%5D=identifier&fl%5B%5D=title&rows={rows}&page=1&output=json"
    d = json.loads(get(url))
    return [(x.get("identifier"), x.get("title")) for x in d.get("response", {}).get("docs", [])]

print("=== Search: Night of the Living Dead full copies ===")
for i, t in search('title:"night of the living dead" AND 1968 AND mediatype:movies', 10):
    print("  ", i, "|", t)
time.sleep(0.3)
print("=== Search: Sintel ===")
for i, t in search('title:"sintel" AND blender AND mediatype:movies', 10):
    print("  ", i, "|", t)

print()
print("=== File lists of items needing smaller file or verification ===")
INSPECT = [
    "turner_video_443",            # NOTLD - what's inside?
    "Sintel-ThirdOpenMovieByBlenderFoundation",
    "sintel-open-movie-by-blender",
    "sintel_20260427",
    "Lucy_Show_Main_Street",       # which episode is this?
    "1954SHERLOCKHOLMESEP1",       # episode name?
    "plan-9-from-outer-space-1957-by-ed-wood",
    "the-cabinet-of-dr-caligari",
    "sherlock-jr_202506",
    "the-kid-1921_202609",
    "nosferatu-1922",
    "gullivers-travels-1939-fleischer",
    "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
]
for ident in INSPECT:
    try:
        meta = json.loads(get(f"https://archive.org/metadata/{ident}"))
        files = meta.get("files", [])
        print(f"\n--- {ident} | title={meta.get('metadata', {}).get('title')}")
        for f in files:
            n = f.get("name", "")
            if n.lower().endswith((".mp4", ".webm", ".ogv", ".m4v", ".mkv", ".avi")):
                sz = int(f.get("size") or 0) / 1e6
                print(f"     {n}  [{f.get('format','?')}]  {sz:.1f}MB")
    except Exception as e:
        print(f"--- {ident}: ERROR {e}")
    time.sleep(0.3)
