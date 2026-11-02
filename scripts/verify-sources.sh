#!/bin/bash
# Verify streaming video sources availability (HEAD requests)
# Checks Google sample bucket (Blender open movies) and archive.org candidates

check() {
  local url="$1"
  local code=$(curl -s -o /dev/null -w "%{http_code}" -I -L --max-time 15 "$url" 2>/dev/null)
  echo "$code | $url"
}

echo "=== Google sample bucket (Blender open movies) ==="
for f in BigBuckBunny.mp4 ElephantsDream.mp4 Sintel.mp4 TearsOfSteel.mp4 ForBiggerBlazes.mp4 ForBiggerEscapes.mp4 ForBiggerFun.mp4 ForBiggerJoyrides.mp4 ForBiggerMeltdowns.mp4; do
  check "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/$f"
done

echo ""
echo "=== archive.org metadata API probes ==="
probe() {
  local id="$1"
  local out=$(curl -s --max-time 15 "https://archive.org/metadata/$id" 2>/dev/null)
  local ok=$(echo "$out" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    files = d.get('files', [])
    mp4s = [f['name'] for f in files if f.get('name','').lower().endswith(('.mp4','.ogv','.webm'))]
    server = d.get('server') or d.get('dir')
    print(f'{len(mp4s)} video files; server={server}' if mp4s else 'NO VIDEO FILES')
except Exception as e:
    print('INVALID')
" 2>/dev/null)
  echo "$id => $ok"
}

for id in night_of_the_living_dead his_girl_friday Plan_9_From_OuterSpace_1959 nosferatu-1922 TheCabinetOfDrCaligari TheGeneral1926 Sherlock_Jr_1924 TheKid1921 metropolis1927 Charade1963 TheLittleShopOfHorrors TheLoneRanger-TheLostEpisodes OneStepBeyond-CheckoutTime; do
  probe "$id"
done
