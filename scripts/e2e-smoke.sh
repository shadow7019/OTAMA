#!/usr/bin/env bash
# E2E smoke suite for the Otama streaming app.
# Usage: scripts/e2e-smoke.sh [BASE_URL]   (default http://localhost:3000)
# Drives the real UI with agent-browser and prints PASS/FAIL per flow.
set -u
BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
bad(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
# eval JS in the page; collapse newlines so one-liners stay one-liners
ev(){ agent-browser eval "$1" 2>&1 | head -1; }
wait_for(){ # wait_for <description> <js returning truthy> [tries] [sleep_s]
  local desc="$1" js="$2" tries="${3:-15}" s="${4:-4}"
  for i in $(seq 1 "$tries"); do
    r=$(ev "$js")
    if [ "$r" = "true" ]; then ok "$desc"; return 0; fi
    sleep "$s"
  done
  bad "$desc (last: $r)"
  return 1
}

echo "== 0. open $BASE =="
agent-browser open --autoplay-policy=no-user-gesture-required "$BASE" >/dev/null 2>&1
sleep 6

echo "== 1. home renders hero + rows =="
wait_for "home rows/cards render" \
  "document.querySelectorAll('section').length>=3 && document.querySelectorAll('img').length>=8"

echo "== 2. search Inception -> details -> Watch Now =="
ev "(function(){const s=document.querySelector('input[aria-label*=Search]')||document.querySelector('input');if(!s)return 'no-input';const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(s,'Inception');s.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()"
wait_for "search results show Inception" \
  "[...document.querySelectorAll('button,a')].some(x=>/View details for Inception/i.test(x.getAttribute('aria-label')||''))" 10 3
ev "(function(){const b=[...document.querySelectorAll('button,a')].find(x=>/View details for Inception/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'opened'}return 'nf'})()" >/dev/null
sleep 3
ev "(function(){const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.textContent||'').trim()==='Watch Now');if(b){b.click();return 'playing'}return 'no-btn'})()" >/dev/null
wait_for "Inception video ready (rs>=1)" \
  "(function(){const v=document.querySelector('video');if(!v)return false;v.muted=true;v.play&&v.play().catch(()=>{});return v.readyState>=1})()" 24 5
wait_for "Inception playback advances" \
  "(function(){const v=document.querySelector('video');return v&&v.currentTime>1})()" 18 5

echo "== 3. player UI: subs + servers strip =="
S=$(ev "(function(){const subs=[...document.querySelectorAll('[data-testid^=sub-]')];const srv=[...document.querySelectorAll('[data-testid^=srv-]')];return JSON.stringify({subs:subs.length,srv:srv.length})})()")
echo "  counts: $S"
echo "$S" | grep -q '"subs":0' && bad "subtitle chips present" || ok "subtitle chips present"
echo "$S" | grep -q '"srv":0' && bad "server chips present" || ok "server chips present"
ev "(function(){const b=document.querySelector('[data-testid=sub-eng]');if(b){b.click();return 'sub-eng'}return 'no-eng'})()" >/dev/null
sleep 3
M=$(ev "(function(){const t=[...document.querySelectorAll('video track')].map(x=>x.track.mode);const v=document.querySelector('video');return JSON.stringify({m:t,ct:v?v.currentTime.toFixed(1):null})})()")
echo "$M" | tr -d '\\' | grep -q '"showing"' && ok "english track showing after selection" || bad "english track showing after selection ($M)"

echo "== 4. close player, TV flow: Breaking Bad S01E01 =="
ev "(function(){const b=[...document.querySelectorAll('button')].find(x=>/close/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'closed'}return 'no-close'})()" >/dev/null
sleep 2
ev "(function(){const s=document.querySelector('input[aria-label*=Search]')||document.querySelector('input');const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(s,'Breaking Bad');s.dispatchEvent(new Event('input',{bubbles:true}));return 'typed'})()"
wait_for "Breaking Bad found" \
  "[...document.querySelectorAll('button,a')].some(x=>/View details for Breaking Bad/i.test(x.getAttribute('aria-label')||''))" 10 3
ev "(function(){const b=[...document.querySelectorAll('button,a')].find(x=>/View details for Breaking Bad/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'opened'}return 'nf'})()" >/dev/null
sleep 3
wait_for "season picker renders" \
  "(function(){const d=document.querySelector('[role=dialog]');if(!d)return false;return [...d.querySelectorAll('button')].some(b=>/^Season \\d+/.test((b.textContent||'').replace(/\\s+/g,' ').trim()))})()" 8 3
ev "(function(){const d=document.querySelector('[role=dialog]');const b=[...d.querySelectorAll('button')].filter(x=>/^Season \\d+/.test((x.textContent||'').replace(/\\s+/g,' ').trim()))[0];if(b){b.click();return 's1'}return 'no-btn'})()" >/dev/null
sleep 4
ev "(function(){const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.textContent||'').trim()==='Watch Now');if(b){b.click();return 'playing'}return 'no-btn'})()" >/dev/null
wait_for "Breaking Bad video plays" \
  "(function(){const v=document.querySelector('video');if(!v)return false;v.muted=true;v.play&&v.play().catch(()=>{});return v.readyState>=1&&v.currentTime>1})()" 30 5

echo "== 5. close player, anime view: Bleach =="
ev "(function(){const b=[...document.querySelectorAll('button')].find(x=>/close/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'closed'}return 'no-close'})()" >/dev/null
sleep 2
ev "(function(){const a=[...document.querySelectorAll('a,button')].find(x=>(x.textContent||'').trim()==='Anime');if(a){a.click();return 'nav'}return 'no-nav'})()" >/dev/null
sleep 6
wait_for "anime catalog renders Bleach card" \
  "[...document.querySelectorAll('button,a')].some(x=>/View details for Bleach/i.test(x.getAttribute('aria-label')||''))" 12 4
ev "(function(){const b=[...document.querySelectorAll('button,a')].find(x=>/View details for Bleach/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'opened'}return 'nf'})()" >/dev/null
sleep 3
ev "(function(){const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.textContent||'').trim()==='Watch Now');if(b){b.click();return 'playing'}return 'no-btn'})()" >/dev/null
wait_for "Bleach video plays" \
  "(function(){const v=document.querySelector('video');if(!v)return false;v.muted=true;v.play&&v.play().catch(()=>{});return v.readyState>=1&&v.currentTime>1})()" 40 5
E=$(ev "(function(){const t=document.body.innerText.replace(/\\n+/g,'|');const v=document.querySelector('video');return JSON.stringify({exhausted:/None of the/.test(t),ct:v?+v.currentTime.toFixed(1):null})})()")
echo "  state: $E"
echo "$E" | tr -d '\\' | grep -q '"exhausted":false' && ok "no false exhaustion on Bleach" || bad "exhausted banner on Bleach"

echo "== 6. continue watching row =="
ev "(function(){const b=[...document.querySelectorAll('button')].find(x=>/close/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return 'closed'}return 'no-close'})()" >/dev/null
sleep 2
ev "(function(){const a=[...document.querySelectorAll('a,button')].find(x=>(x.textContent||'').trim()==='Home');if(a){a.click();return 'home'}return 'no-home'})()" >/dev/null
sleep 5
wait_for "continue-watching row has items" \
  "(function(){const t=document.body.innerText.replace(/\\n+/g,'|');return /Continue watching/i.test(t)})()" 8 3

echo "== 7. API smoke =="
AC=$(curl -s --max-time 90 "$BASE/api/auto-content"); echo "$AC" | grep -q '"results":\[{' && ok "auto-content returns playable items" || bad "auto-content returns playable items"
SUB=$(curl -s --max-time 30 "$BASE/api/subtitles?type=movie&id=27205")
echo "$SUB" | grep -q '"lang":"eng"' && ok "Inception subtitles include English" || bad "Inception subtitles include English ($SUB)"
TS=$(curl -s --max-time 60 "$BASE/api/torrent/search?type=movie&id=27205&title=Inception&year=2010")
echo "$TS" | grep -q '"results":\[{' && ok "torrent search returns servers" || bad "torrent search returns servers"

echo "== summary =="
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
