#!/usr/bin/env bash
# Verify TMDB company & network IDs + logo paths for the Studios page
KEY="b3e1f1893c570b5d072bbb18e4c27c32"
check_company() {
  local json name logo
  json=$(curl -s --max-time 10 "https://api.themoviedb.org/3/company/$1?api_key=$KEY")
  name=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','?'))" 2>/dev/null)
  logo=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('logo_path') or 'NO-LOGO')" 2>/dev/null)
  printf "COMPANY %-8s %-28s %s\n" "$1" "$name" "$logo"
}
check_network() {
  local json name logo
  json=$(curl -s --max-time 10 "https://api.themoviedb.org/3/network/$1?api_key=$KEY")
  name=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name','?'))" 2>/dev/null)
  logo=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('logo_path') or 'NO-LOGO')" 2>/dev/null)
  printf "NETWORK %-8s %-28s %s\n" "$1" "$name" "$logo"
}

echo "=== MOVIE STUDIOS (companies) ==="
for id in 174 33 4 2 5 127928 420 3 521 3492 923 41077 10342 12 21 1632; do check_company "$id"; done
echo ""
echo "=== STREAMING SERVICES & NETWORKS ==="
for id in 213 49 3186 2739 2552 1024 453 4330 3353 33 88 6 2 16 19 67 318 4 52 35 71; do check_network "$id"; done
