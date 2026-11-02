#!/usr/bin/env bash
# Push the sandbox project (local branch `main`, the Popcorn Time rebrand) to
# https://github.com/shadow7019/OTAMA as a NEW branch `popcorn-time`.
# NEVER force-pushes and NEVER touches origin/main or its tags — the remote
# main is an unrelated (older, desktop-era) history and must not be clobbered.
#
# Usage:
#   bash scripts/push-github.sh                 # SSH deploy-key path
#   bash scripts/push-github.sh --token <PAT>   # HTTPS fine-grained PAT path
#
# One-time setup for the SSH path: add .ssh-deploy/id_ed25519.pub as a
# Deploy key (Settings → Deploy keys → allow write) on shadow7019/OTAMA.
set -euo pipefail
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT"
REMOTE_BRANCH="popcorn-time"

if [ "${1:-}" = "--token" ]; then
  [ -n "${2:-}" ] || { echo "usage: $0 --token <PAT>" >&2; exit 1; }
  git push "https://x-access-token:${2}@github.com/shadow7019/OTAMA.git" \
    "main:refs/heads/${REMOTE_BRANCH}"
else
  GIT_SSH_COMMAND="$PROJECT/.ssh-deploy/bin/ssh -i $PROJECT/.ssh-deploy/id_ed25519 \
-o IdentitiesOnly=yes -o UserKnownHostsFile=$PROJECT/.ssh-deploy/known_hosts \
-o StrictHostKeyChecking=yes" \
    git push "git@github.com:shadow7019/OTAMA.git" "main:refs/heads/${REMOTE_BRANCH}"
fi
