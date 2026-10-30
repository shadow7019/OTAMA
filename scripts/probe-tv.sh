#!/usr/bin/env bash
# Verify TV url formats + inspect small bodies (JS shells?)
TV_ID=1399   # Game of Thrones
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
check() {
  local name="$1" url="$2"
  local tmp code t size
  tmp=$(mktemp)
  t0=$(date +%s%N)
  code=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 8 -A "$UA" -L "$url" 2>/dev/null)
  t1=$(date +%s%N); t=$(( (t1 - t0) / 1000000 ))
  size=$(wc -c < "$tmp" | tr -d ' ')
  if [ "$code" = "000" ]; then
    printf "%-22s DEAD   (%5sms)  %s\n" "$name" "$t" "$url"
  else
    printf "%-22s %s %5sms  body=%7sB  %s\n" "$name" "$code" "$t" "$size" "$url"
    [ "$size" -lt 900 ] && echo "   BODY: $(tr -d '\n' < "$tmp" | head -c 220)"
  fi
  rm -f "$tmp"
}
echo "=== TV url format checks ==="
check "vidlink.pro/tv"      "https://vidlink.pro/tv/$TV_ID/1/1"
check "vidfast tv"          "https://vidfast.pro/tv/$TV_ID/1/1?autoPlay=true"
check "videasy tv"          "https://player.videasy.net/tv/$TV_ID/1/1"
check "vidsrc.to tv"        "https://vidsrc.to/embed/tv/$TV_ID/1-1"
check "vidsrc.su tv"        "https://vidsrc.su/embed/tv/$TV_ID/1-1"
check "vidsrc.me tv"        "https://vidsrc.me/embed/tv?tmdb=$TV_ID&season=1&episode=1"
check "2embed tv"           "https://www.2embed.cc/embedtv/$TV_ID&s=1&e=1"
check "multiembed tv"       "https://multiembed.mov/?video_id=$TV_ID&tmdb=1&s=1&e=1"
check "spencerdevs tv"      "https://spencerdevs.xyz/tv/$TV_ID/1/1"
check "111movies tv"        "https://111movies.com/tv/$TV_ID/1/1"
echo ""
echo "=== archive.org public domain lookup sanity ==="
curl -s --max-time 10 "https://archive.org/advancedsearch.php?q=title%3A%28%22night+of+the+living+dead%22%29+AND+mediatype%3A%28movies%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=licenseurl&rows=5&output=json" | head -c 900
