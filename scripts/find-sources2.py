#!/usr/bin/env python3
"""Resolve final catalog video sources.
1. Extra archive.org searches (cartoons, more anime, more PD TV shows, Blender films)
2. For chosen identifiers: fetch metadata, pick best MP4, verify with Range GET
3. Save verified results to sources.json
"""
import json
import time
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (compatible; StreamChecker/1.0)"}

def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def search(q, rows=8):
    qs = urllib.parse.quote(q)
    url = f"https://archive.org/advancedsearch.php?q={qs}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows={rows}&page=1&output=json"
    try:
        d = json.loads(get(url))
        return [(x.get("identifier"), x.get("title"), x.get("year")) for x in d.get("response", {}).get("docs", [])]
    except Exception as e:
        print("  search error:", e)
        return []

EXTRA_QUERIES = [
    'title:"Sintel" AND mediatype:movies',
    'title:"Elephants Dream" AND mediatype:movies',
    'title:"Tears of Steel" AND mediatype:movies',
    'title:"Big Buck Bunny" AND bunny AND mediatype:movies',
    'title:"Superman" AND fleischer AND mediatype:movies',
    'title:"Betty Boop" AND "Snow White" AND mediatype:movies',
    'title:"Popeye" AND mediatype:movies AND animation',
    'title:"Gulliver\'s Travels" AND 1939 AND mediatype:movies',
    'title:"Momotaro" AND "Sea Warriors" AND mediatype:movies',
    'title:"Ugokie" AND mediatype:movies',
    'title:"Chikara to Onna" AND mediatype:movies',
    'title:"Kumo to Churippu" OR title:"Tulip" AND anime AND mediatype:movies',
    'title:"Benkei" AND Ushiwaka AND mediatype:movies',
    'title:"George Burns" AND "Gracie Allen" AND mediatype:movies',
    'title:"You Bet Your Life" AND Groucho AND mediatype:movies',
    'title:"One Step Beyond" AND episode AND mediatype:movies',
    'title:"The Beverly Hillbillies" AND episode AND 1962 AND mediatype:movies',
    'title:"The Lucy Show" AND mediatype:movies AND episode',
]

print("======== EXTRA SEARCHES ========")
for q in EXTRA_QUERIES:
    print("Q:", q)
    for ident, title, year in search(q):
        print(f"   {ident} | {title} | {year}")
    time.sleep(0.4)
