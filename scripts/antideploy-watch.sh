#!/usr/bin/env bash
# Poll an Antideploy deployment until it succeeds or fails; print the verdict.
set -u
TASK_ID="$1"
POLL="${2:-6}"
TOKEN=$(sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.antideploy/config.json")

while true; do
  sleep "$POLL"
  code=$(curl -sS --max-time 30 "https://antideploy.com/api/v1/deployments/$TASK_ID" \
    -H "authorization: Bearer $TOKEN" \
    -o /tmp/adi-deploy-status.json -w '%{http_code}')
  if [ "$code" != "200" ]; then echo "watch http $code"; continue; fi
  st=$(python3 -c "import json;print(json.load(open('/tmp/adi-deploy-status.json')).get('status',''))")
  echo "status: $st"
  case "$st" in
    succeeded|failed) break ;;
  esac
done

python3 - <<'PY'
import json
d = json.load(open('/tmp/adi-deploy-status.json'))
out = {k: d.get(k) for k in ('status', 'error', 'failedStep', 'summary', 'url', 'liveUrl', 'security')}
print(json.dumps({k: v for k, v in out.items() if v is not None}, indent=1)[:2500])
dep = d.get('deployment') or {}
for name in ('buildLog', 'runtimeLog'):
    log = dep.get(name)
    if log:
        print(f'--- {name} tail ---')
        print(log[-1800:])
PY
