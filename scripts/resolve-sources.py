#!/usr/bin/env python3
"""Resolve chosen archive.org identifiers -> best browser-playable MP4 file -> verify.
Output: /home/z/my-project/scripts/sources.json
"""
import json
import time
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (compatible; StreamChecker/1.0)"}
PLAYABLE_EXT = (".mp4", ".webm", ".ogv", ".m4v")
MAX_SIZE = 2.0 * 1024 * 1024 * 1024  # 2GB

def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def range_ok(url):
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-1023"})
        with urllib.request.urlopen(req, timeout=30) as r:
            code = r.status
            ct = r.headers.get("Content-Type", "")
            r.read(64)
            return code, ct
    except Exception as e:
        code = getattr(e, "code", None)
        return code or str(e), ""

def best_file(files):
    cands = []
    for f in files:
        name = f.get("name", "")
        low = name.lower()
        if not low.endswith(PLAYABLE_EXT):
            continue
        size = int(f.get("size") or 0)
        if size > MAX_SIZE or size < 100_000:  # skip tiny sample clips
            continue
        fmt = (f.get("format") or "").lower()
        score = 0
        if low.endswith(".mp4"):
            score += 100
        if "512kb" in low or "512 kb" in fmt:
            score += 40
        if "h.264" in fmt or "mpeg4" in fmt or "512kb" in fmt:
            score += 25
        if low.endswith(".m4v"):
            score += 60  # quicktime usually h264
        if low.endswith(".webm"):
            score += 50
        if low.endswith(".ogv"):
            score += 20
        cands.append((score, size, name))
    if not cands:
        return None
    cands.sort(reverse=True)
    return cands[0][2]

CANDIDATES = {
    # ---------- Movies ----------
    "night_of_living_dead": "turner_video_443",
    "plan_9": "plan-9-from-outer-space-1957-by-ed-wood",
    "caligari": "the-cabinet-of-dr-caligari",
    "sherlock_jr": "sherlock-jr_202506",
    "the_kid": "the-kid-1921_202609",
    "metropolis": "metropolis-1927-full-movie-4-k-color-remastered-2023-colorized-with-gottfried-huppertz-score",
    "charade": "charade-1963-cary-grant-audrey-hepburn-comedy-mystery-romance-thriller-full-movie",
    "his_girl_friday": "his_girl_friday",
    "the_general": "TheGeneral1926",
    "nosferatu": "nosferatu-1922",
    "little_shop": "TheLittleShopOfHorrors",
    "gulliver": "gullivers-travels-1939-fleischer",
    # ---------- Animation / cartoons ----------
    "big_buck_bunny": "big-buck-bunny-720p-h264_202403",
    "sintel": "Sintel-ThirdOpenMovieByBlenderFoundation",
    "elephants_dream": "elephants-dream",
    "tears_of_steel": "Tears-of-Steel",
    "cosmos_laundromat": "cosmos-laundromat-first-cycle",
    "caminandes_llamigos": "caminandes-3-llamigos",
    "superman_mechanical": "Superman2.TheMechanicalMonsters",
    "betty_snow_white": "BettyBoopInSnowWhite",
    "popeye_paneless": "Popeye_ThePanelessWindowWasher",
    # ---------- Anime ----------
    "dull_sword": "1917-the-dull-sword-namakura-gatana",
    "momotaro_sea_eagles": "momotaro-no-umiwashi-1943",
    "ugokie_fox": "ugokie-kori-no-tatehiki-1933",
    "benkei_ushiwaka": "benkei-tai-ushiwaka-1939",
    # ---------- Shows: episodes ----------
    "sh_holmes_1": "SherlockHolmes-TheCaseofLadyBeryl",
    "sh_holmes_2": "the-adventures-of-sherlock-holmes-s-03-e-01-reluctant-carpenter",
    "sh_holmes_3": "1954SHERLOCKHOLMESEP1",
    "sh_holmes_4": "4.-the-case-of-the-texas-cowgirl",
    "osb_1": "S3E1TIDALWAVE",
    "osb_2": "OneStepBeyondTheInheritance",
    "osb_3": "S2E16THEJUSTICETREE",
    "osb_4": "S1E20Echo",
    "osb_5": "OneStepBeyondTheStorm",
    "lucy_1": "TheLucyShow5x0191266LucyAndGeorgeBurns",
    "lucy_2": "Lucy_Show_Main_Street",
    "lucy_3": "TheLucyShow-LucyGetsJackBennysAccount",
    "lucy_4": "TheLucyShowLittleOldLucy",
    "burns_1": "TheGeorgeBurnsAndGracieAllenShow-NewCoatssitcom1950s",
    "burns_2": "the-george-burns-and-gracie-allen-show-s-03-e-16-gracie-thinks-shes-not-married",
    "burns_3": "TheGeorgeBurnsAndGracieAllenShow-Football",
    "burns_4": "turner_video_134318",
    "hillbillies_1": "TheBeverlyHillbillies-EllyNeedsAMaw-Ep2x12",
    "hillbillies_2": "Beverly_Hillbillies_Ep06_Trick_Or_Treat",
    "hillbillies_3": "The_Beverly_Hillbillies",
}

out = {}
for key, ident in CANDIDATES.items():
    try:
        meta = json.loads(get(f"https://archive.org/metadata/{ident}"))
        files = meta.get("files", [])
        name = best_file(files)
        if not name:
            out[key] = {"ident": ident, "ok": False, "reason": "no playable file"}
            print(f"[MISS] {key} {ident}: no playable file")
            continue
        url = f"https://archive.org/download/{ident}/{urllib.parse.quote(name)}"
        code, ct = range_ok(url)
        ok = code in (200, 206)
        size_mb = None
        for f in files:
            if f.get("name") == name:
                size_mb = round(int(f.get("size") or 0) / 1e6, 1)
        out[key] = {"ident": ident, "ok": ok, "file": name, "size_mb": size_mb,
                    "status": code, "url": url, "ct": ct}
        print(f"[{'OK ' if ok else 'FAIL'}] {key} {ident} -> {name} ({size_mb}MB) [{code}]")
    except Exception as e:
        out[key] = {"ident": ident, "ok": False, "reason": str(e)}
        print(f"[ERR ] {key} {ident}: {e}")
    time.sleep(0.3)

with open("/home/z/my-project/scripts/sources.json", "w") as fp:
    json.dump(out, fp, indent=2)
print("\nSaved to scripts/sources.json")
ok_count = sum(1 for v in out.values() if v.get("ok"))
print(f"Verified OK: {ok_count}/{len(out)}")
