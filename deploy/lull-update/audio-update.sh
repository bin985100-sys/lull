#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/lull-relay
PY="$APP/venv/bin/python"
BACKUP="$APP/backups/audio-$(date -u +%Y%m%dT%H%M%SZ)"
echo 'Checking Python, Node and offline regression tests'
"$PY" -m py_compile "$HERE/server.py"
node --check "$HERE/lull-api.mjs"
"$PY" "$HERE/test_server.py"
mkdir -p "$BACKUP"
cp "$APP/server.py" "$BACKUP/server.py"
cp "$APP/lull-api.mjs" "$BACKUP/lull-api.mjs"
rollback() {
  echo "Update failed; restoring $BACKUP"
  cp "$BACKUP/server.py" "$APP/server.py"
  cp "$BACKUP/lull-api.mjs" "$APP/lull-api.mjs"
  systemctl restart lull-api lull-relay
}
trap 'rollback' ERR
install -m 644 "$HERE/server.py" "$APP/server.py.new"
install -m 644 "$HERE/lull-api.mjs" "$APP/lull-api.mjs.new"
mv "$APP/server.py.new" "$APP/server.py"
mv "$APP/lull-api.mjs.new" "$APP/lull-api.mjs"
systemctl restart lull-api lull-relay
ready=0
for n in $(seq 1 15); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health >/dev/null 2>&1 && curl -fsS --max-time 2 http://127.0.0.1:8480/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
trap - ERR
echo "Updated audio services. Backup: $BACKUP"
for n in $(seq 1 15); do
  if curl -fsS --max-time 2 'http://127.0.0.1:8787/internal/stream/x?state=1' | grep -q '"ready":true'; then break; fi
  sleep 1
done
echo 'HTTP first byte / full file / repeat / ffmpeg decode (phone latency is additional):'
"$PY" "$HERE/benchmark.py"
