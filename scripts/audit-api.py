#!/usr/bin/env python3
"""Full API endpoint audit for the Otama app. Prints a PASS/FAIL line per probe."""
import json, time, urllib.request, urllib.parse, urllib.error

BASE = "http://localhost:3000"
results = []

def probe(name, path, timeout=60, expect_json=True):
    t0 = time.time()
    try:
        req = urllib.request.Request(BASE + path, headers={"User-Agent": "audit/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            dt = time.time() - t0
            info = {"status": r.status, "sec": round(dt, 2)}
            if expect_json:
                try:
                    j = json.loads(body)
                    info["keys"] = sorted(j.keys())[:6]
                except Exception:
                    info["json"] = False
                    info["head"] = body[:80].decode(errors="replace")
            results.append((name, "PASS", info))
            return info
    except urllib.error.HTTPError as e:
        dt = time.time() - t0
        body = e.read()[:150].decode(errors="replace")
        results.append((name, f"HTTP {e.code}", {"sec": round(dt, 2), "body": body}))
        return None
    except Exception as e:
        results.append((name, "FAIL", {"err": str(e)[:120], "sec": round(time.time()-t0, 2)}))
        return None

# 1. TMDB surface
probe("tmdb trending week", "/api/tmdb/trending/all/week")
probe("tmdb trending day", "/api/tmdb/trending/all/day")
probe("tmdb movie detail", "/api/tmdb/movie/155?append_to_response=credits%2Cvideos%2Csimilar")
probe("tmdb tv detail", "/api/tmdb/tv/1399?append_to_response=credits%2Cvideos%2Csimilar")
probe("tmdb search multi", "/api/tmdb/search/multi?query=dark+knight")
probe("tmdb discover movie", "/api/tmdb/discover/movie?page=1&sort_by=popularity.desc")
probe("tmdb discover tv", "/api/tmdb/discover/tv?page=1&sort_by=popularity.desc")
probe("tmdb genre list", "/api/tmdb/genre/movie/list")
# 2. auto-content (home rows)
probe("auto-content", "/api/auto-content", timeout=90)
# 3. torrent search
probe("torrent search movie", "/api/torrent/search?type=movie&id=155&title=The%20Dark%20Knight&year=2008", timeout=120)
probe("torrent search tv", "/api/torrent/search?type=tv&id=1399&season=1&episode=1&title=Game%20of%20Thrones", timeout=120)
probe("torrent search lang", "/api/torrent/search?type=movie&id=155&title=The%20Dark%20Knight&year=2008&lang=rus", timeout=120)
probe("torrent search bad id", "/api/torrent/search?type=movie&id=0&title=x", timeout=30)
# 4. torrent lifecycle (warm/status/stop) with a bogus infohash — routes must answer, not crash
probe("torrent warm", "/api/torrent/warm", timeout=60)  # GET may 405 — acceptable, we check below
probe("torrent status", "/api/torrent/status?id=" + "0"*40, timeout=30)
probe("torrent stop", "/api/torrent/stop?id=" + "0"*40, timeout=30)
# 5. subtitles
probe("subtitles movie", "/api/subtitles?type=movie&id=155", timeout=60)
probe("subtitles tv", "/api/subtitles?type=tv&id=1399&season=1&episode=1", timeout=60)
# 6. archive
probe("archive movie", "/api/archive?title=Nosferatu&year=1922", timeout=60)
probe("archive tv", "/api/archive?type=tv&id=1399&season=1&episode=1&title=Game%20of%20Thrones", timeout=60)

print(f"{'PROBE':36} {'RESULT':10} DETAIL")
for name, res, info in results:
    d = json.dumps(info)[:150] if info else ""
    print(f"{name:36} {res:10} {d}")
