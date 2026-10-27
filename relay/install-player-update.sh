#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET=/opt/lull-relay
BACKUP="/root/lull-backups/player-$(date +%s)"
PYTHON="$TARGET/venv/bin/python"
mkdir -p "$BACKUP"
for name in server.py audio_broker.py lull-api.mjs; do
  test -s "$SOURCE/$name"
  if [ -f "$TARGET/$name" ]; then cp -a "$TARGET/$name" "$BACKUP/$name"; fi
done
"$PYTHON" -m py_compile "$SOURCE/server.py" "$SOURCE/audio_broker.py"
node --check "$SOURCE/lull-api.mjs"
rollback() {
  echo 'Update failed; restoring previous server files'
  for name in server.py audio_broker.py lull-api.mjs; do
    if [ -f "$BACKUP/$name" ]; then cp -a "$BACKUP/$name" "$TARGET/$name"; fi
  done
  systemctl restart lull-api lull-relay || true
}
trap rollback ERR
for name in server.py audio_broker.py lull-api.mjs; do install -m 644 "$SOURCE/$name" "$TARGET/$name"; done
systemctl restart lull-api lull-relay
ready=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 https://api.lull.website/api/audio-health -H 'Origin: https://app.lull.website' -D "$BACKUP/headers.txt" -o "$BACKUP/health.json"; then
    if grep -qi '^Access-Control-Allow-Origin: https://app.lull.website' "$BACKUP/headers.txt" && grep -q '"audio_broker": "v1"' "$BACKUP/health.json"; then ready=1; break; fi
  fi
  sleep 1
done
test "$ready" = 1
curl -fsS --max-time 5 https://api.lull.website/api/health > /dev/null
trap - ERR
echo 'Lull player update installed and verified'
echo "Backup: $BACKUP"
