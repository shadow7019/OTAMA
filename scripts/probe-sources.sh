#!/usr/bin/env bash
# Probe candidate embed sources: HTTP status, latency, X-Frame-Options
MOVIE_ID=550   # Fight Club
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

check() {
  local name="$1" url="$2"
  local tmp code t size xfo frameable
  tmp=$(mktemp)
  t0=$(date +%s%N)
  code=$(curl -s -o "$tmp" -w "%{http_code}" --max-time 8 -A "$UA" -L "$url" 2>/dev/null)
  t1=$(date +%s%N)
  t=$(( (t1 - t0) / 1000000 ))
  xfo=$(rg -i "x-frame-options" "$tmp" | head -1 | tr -d '\r' || true)
  size=$(wc -c < "$tmp" | tr -d ' ')
  frameable="yes"
  [ -n "$xfo" ] && frameable="NO"
  if [ "$code" = "000" ]; then
    printf "%-14s DEAD   (%5sms)  %s\n" "$name" "$t" "$url"
  else
    printf "%-14s %s %5sms  frame=%s  body=%7sB  %s\n" "$name" "$code" "$t" "$frameable" "$size" "$url"
  fi
  rm -f "$tmp"
}

echo "=== CURRENT SOURCES (movie url) ==="
check "vidlink.org"  "https://vidlink.org/embed/movie/$MOVIE_ID"
check "vidlink.pro"  "https://vidlink.pro/movie/$MOVIE_ID"
check "vidfast"      "https://vidfast.pro/movie/$MOVIE_ID?autoPlay=true"
check "vidsrc.xyz"   "https://vidsrc.xyz/embed/movie?tmdb=$MOVIE_ID"
check "videasy"      "https://player.videasy.net/movie/$MOVIE_ID"
check "autoembed"    "https://autoembed.cc/embed/movie/$MOVIE_ID"
check "embed.su"     "https://embed.su/embed/movie?tmdb=$MOVIE_ID"
check "vidora"       "https://vidora.su/movie/$MOVIE_ID"
check "moviesapi"    "https://moviesapi.club/movie/$MOVIE_ID"
check "spencerdevs"  "https://spencerdevs.xyz/movie/$MOVIE_ID"
check "2embed"       "https://www.2embed.cc/embed/$MOVIE_ID"
check "multiembed"   "https://multiembed.mov/?video_id=$MOVIE_ID&tmdb=1"
check "vidsrc.vip"   "https://vidsrc.vip/embed/movie?tmdb=$MOVIE_ID"

echo ""
echo "=== NEW CANDIDATES ==="
check "vidsrc.to"    "https://vidsrc.to/embed/movie/$MOVIE_ID"
check "vidsrc.su"    "https://vidsrc.su/embed/movie/$MOVIE_ID"
check "111movies"    "https://111movies.com/movie/$MOVIE_ID"
check "vidsrc.icu"   "https://vidsrc.icu/embed/movie?tmdb=$MOVIE_ID"
check "smashystream" "https://player.smashy.stream/movie/$MOVIE_ID"
check "rivestream"   "https://rivestream.org/embed?type=movie&id=$MOVIE_ID"
check "vidsrc.me"    "https://vidsrc.me/embed/movie?tmdb=$MOVIE_ID"
