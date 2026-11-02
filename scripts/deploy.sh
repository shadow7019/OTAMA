#!/usr/bin/env bash
# One-command deploy of the Popcorn Time web app to Antideploy.
#
#   bash scripts/deploy.sh [--force]
#
# Packages the tree (minus heavy/local-only dirs), uploads it to the
# Antideploy application recorded in .antideploy.json, then polls the build
# until it succeeds or fails and prints the verdict + log tails.
# The device token lives in ~/.antideploy/config.json (see
# scripts/antideploy-poll.sh for the login flow).
#
# --force rebuilds even when the content hash is unchanged.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="$(python3 -c "import json;print(json.load(open('$PROJECT_DIR/.antideploy.json'))['applicationId'])")"
TOKEN="$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.antideploy/config.json')))['token'])")"

cd "$PROJECT_DIR"
echo "==> packaging tree…"
ARCHIVE="$(mktemp /tmp/otama-deploy.XXXXXX.tar.gz)"
trap 'rm -f "$ARCHIVE"' EXIT
tar czf "$ARCHIVE" \
  --exclude=.git --exclude=node_modules --exclude=.next \
  --exclude=download --exclude=upload --exclude=tool-results \
  --exclude=.torrent-cache --exclude=dev.log --exclude=server.log \
  --exclude=tsconfig.tsbuildinfo --exclude=repo.tar \
  --exclude=native \
  .
echo "    archive: $(du -h "$ARCHIVE" | cut -f1) (platform limit: 28 MB)"

echo "==> uploading…"
RESP="$(curl -sS -m 300 -X POST "https://antideploy.com/api/v1/deploy?applicationId=$APP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -F "archive=@$ARCHIVE" \
  ${1:+-F force=true} \
  -F "env=<.env")"

TASK_ID="$(printf '%s' "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('taskId',''))" 2>/dev/null || true)"
if [ -z "$TASK_ID" ]; then
  echo "deploy rejected: $RESP"
  exit 1
fi
STATUS="$(printf '%s' "$RESP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('status',''))")"
echo "    task: $TASK_ID ($STATUS)"
if [ "$STATUS" = "unchanged" ]; then
  echo "content hash unchanged — build skipped; use --force to rebuild"
  exit 0
fi

echo "==> building (live watch)…"
bash "$PROJECT_DIR/scripts/antideploy-watch.sh" "$TASK_ID" 10
