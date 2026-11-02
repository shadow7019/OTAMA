#!/usr/bin/env python3
"""Finalize: pick best playable file for remaining items (prefer <1.5GB), verify."""
import json
import time
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (compatible; StreamChecker/1.0)"}
PLAYABLE = (".mp4", ".webm", ".m4v")

def get(url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def range_ok(url):
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-1023"})
        with urllib.request.urlopen(req, timeout=40) as r:
            r.read(64)
            return r.status
    except Exception as e:
        return getattr(e, "code", None) or str(e)

def pick(files, max_gb=1.6):
    cands = []
    for f in files:
        n = f.get("name", "")
        if not n.lower().endswith(PLAYABLE):
            continue
        if n.endswith(".ia.mp4"):
            continue  # prefer original mp4
        size = int(f.get("size") or 0)
        if size > max_gb * 1024**3 or size < 1_000_000:
            continue
        score = size  # smaller is better (lower score)
        if n.lower().endswith(".mp4"):
            score -= 50_000_000  # slight preference for mp4
        cands.append((score, n, size))
    return sorted(cands)[0] if cands else None

FINAL = {
    "night_of_living_dead": ["night-of-the-living-dead-1968-hd", "night-of-the-living-dead-1968-full-movie", "NightOfTheLivingDead1968-Restored"],
    "sintel": ["sintel-open-movie-by-blender", "sintel_202207", "sintel_cc_by_2010"],
    "plan_9": ["plan-9-from-outer-space-1957-by-ed-wood", "plan-9-from-outer-space-1959-640-x-480.webm.-480p.vp-9"],
    "sherlock_jr": ["sherlock-jr_202506", "sherlock-jr.-1924", "sherlockjr1924_201909"],
    "nosferatu": ["nosferatu-1922"],
    "gulliver": ["gullivers-travels-1939-fleischer", "GulliversTravels1939_201707"],
}

result = {}
for key, idents in FINAL.items():
    best = None
    for ident in idents:
        try:
            meta = json.loads(get(f"https://archive.org/metadata/{ident}"))
            p = pick(meta.get("files", []))
            if p:
                score, name, size = p
                url = f"https://archive.org/download/{ident}/{urllib.parse.quote(name)}"
                code = range_ok(url)
                if code in (200, 206):
                    if best is None or size < best["size_mb"] * 1e6:
                        best = {"ident": ident, "file": name, "size_mb": round(size / 1e6, 1),
                                "status": code, "url": url}
                        print(f"[OK  ] {key}: {ident} -> {name} ({best['size_mb']}MB)")
                        break
                    else:
                        print(f"[skip] {key}: {ident} larger than current best")
                else:
                    print(f"[FAIL] {key}: {ident} -> {name} [{code}]")
            else:
                print(f"[MISS] {key}: {ident} -> no playable file under limit")
        except Exception as e:
            print(f"[ERR ] {key}: {ident}: {e}")
        time.sleep(0.3)
    result[key] = best or {"ok": False}

with open("/home/z/my-project/scripts/sources-final.json", "w") as fp:
    json.dump(result, fp, indent=2)
print("\nDone -> scripts/sources-final.json")
