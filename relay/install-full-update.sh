#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
bash "$SOURCE/install-player-update.sh"
curl -fsS --max-time 10 https://api.lull.website/api/audio-health |
  /opt/lull-relay/venv/bin/python -c 'import json,sys; assert json.load(sys.stdin).get("prepared_cache") == "persistent-v1", "Prepared audio cache was not updated"'
bash "$SOURCE/install-web-update.sh"
echo 'Lull 1.0.1 server and web update verified'
