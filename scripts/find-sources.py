#!/usr/bin/env python3
"""Find and verify streamable video sources:
1. Google sample bucket via GET range (HEAD was 403)
2. archive.org advancedsearch + metadata API to find real identifiers with MP4 files
Outputs a JSON of verified sources.
"""
import json
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (compatible; StreamChecker/1.0)"}

def get(url, timeout=20, headers=None):
    req = urllib.request.Request(url, headers=headers or UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def head_status(url):
    """GET with Range 0-0 to check availability like a video player would."""
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except Exception as e:
        return getattr(e, "code", str(e))

print("=== Google bucket via GET Range ===")
for f in ["BigBuckBunny.mp4", "ElephantsDream.mp4", "Sintel.mp4", "TearsOfSteel.mp4", "ForBiggerBlazes.mp4"]:
    u = f"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/{f}"
    print(head_status(u), "|", u)

print()
print("=== archive.org advancedsearch ===")
def search(q, rows=6):
    qs = urllib.parse.quote(q)
    url = f"https://archive.org/advancedsearch.php?q={qs}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows={rows}&page=1&output=json"
    try:
        d = json.loads(get(url, timeout=25))
        docs = d.get("response", {}).get("docs", [])
        return [(x.get("identifier"), x.get("title"), x.get("year")) for x in docs]
    except Exception as e:
        print("  search error:", e)
        return []

QUERIES = [
    'title:"Night of the Living Dead" AND mediatype:movies',
    'title:"Plan 9 from Outer Space" AND mediatype:movies',
    'title:"Cabinet of Dr. Caligari" AND mediatype:movies',
    'title:"Sherlock Jr" AND mediatype:movies',
    'title:"The Kid" AND chaplin AND mediatype:movies',
    'title:"Metropolis" AND lang and mediatype:movies',
    'title:"Charade" AND hepburn AND mediatype:movies',
    'title:"Sherlock Holmes" AND 1954 AND mediatype:movies',
    'title:"One Step Beyond" AND mediatype:movies',
    'title:"The Lucy Show" AND mediatype:movies',
    'title:"Beverly Hillbillies" AND mediatype:movies',
    'title:"Andy Griffith" AND mediatype:movies',
    'title:"Namakura Gatana" OR title:"The Dull Sword" AND mediatype:movies',
    'title:"Momotaro" AND mediatype:movies',
    'title:"Spider and the Tulip" AND mediatype:movies',
    'title:"Cosmos Laundromat" AND mediatype:movies',
    'title:"Caminandes" AND mediatype:movies',
    'title:"Big Buck Bunny" AND mediatype:movies',
    'title:"Popeye" AND mediatype:movies',
    'title:"Betty Boop" AND mediatype:movies',
    'title:"Superman" AND fleischer AND mediatype:movies',
    'title:"Gulliver\'s Travels" AND 1939 AND mediatype:movies',
    'title:"His Girl Friday" AND mediatype:movies',
    'title:"The General" AND keaton AND mediatype:movies',
]

results = {}
for q in QUERIES:
    print("Q:", q)
    for ident, title, year in search(q):
        print(f"   {ident} | {title} | {year}")
