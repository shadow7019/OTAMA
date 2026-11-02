#!/usr/bin/env bash
# Poll Antideploy device-token endpoint until the user approves.
# On success write {"token": ...} to ~/.antideploy/config.json (mode 0600).
# Never prints the token or the raw 200 body.
set -u
DEVICE_CODE="$(cat /tmp/adi-device-code 2>/dev/null)"
INTERVAL="${1:-5}"
CFG="$HOME/.antideploy/config.json"

if [ -z "$DEVICE_CODE" ]; then echo "no device code"; exit 5; fi

while true; do
  sleep "$INTERVAL"
  resp=$(curl -sS --max-time 20 -X POST https://antideploy.com/api/v1/device/token \
    -H 'Content-Type: application/json' \
    -d "{\"deviceCode\":\"$DEVICE_CODE\"}" -w '\n%{http_code}')
  code=$(printf '%s' "$resp" | tail -n1)
  body=$(printf '%s' "$resp" | sed '$d')

  if [ "$code" = "200" ]; then
    printf '%s' "$body" | python3 -c "
import json, sys, os
d = json.load(sys.stdin)
tok = d.get('token') or d.get('access_token')
if not tok:
    print('NO_TOKEN_IN_RESPONSE'); sys.exit(6)
cfg = os.path.expanduser('~/.antideploy/config.json')
os.makedirs(os.path.dirname(cfg), exist_ok=True)
fd = os.open(cfg, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, json.dumps({'token': tok}).encode())
os.close(fd)
os.chmod(cfg, 0o600)
acct = d.get('account') or {}
print('CONNECTED account:', acct.get('label', 'unknown'))
"
    exit $?
  fi

  status=$(printf '%s' "$body" | python3 -c "
import json, sys
try: print(json.load(sys.stdin).get('error', ''))
except Exception: print('')
" 2>/dev/null)

  case "$status" in
    authorization_pending) continue ;;
    slow_down) INTERVAL=$((INTERVAL + 2)); continue ;;
    expired_token) echo "EXPIRED"; exit 2 ;;
    access_denied) echo "DENIED"; exit 3 ;;
    *) echo "UNEXPECTED http=$code"; exit 4 ;;
  esac
done
