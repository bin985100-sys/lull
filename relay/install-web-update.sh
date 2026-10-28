#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TARGET=/var/www/lull-app
STAMP="$(date +%s)-$$"
STAGE="/var/www/lull-app-next-$STAMP"
PREVIOUS="/var/www/lull-app-previous-$STAMP"
BACKUP="/root/lull-backups/web-$STAMP"
test "$(id -u)" = 0
test -s "$SOURCE/web/index.html"
test -s "$SOURCE/web/sw.js"
test -d "$SOURCE/web/assets"
test ! -L "$TARGET"
mkdir -p "$BACKUP" "$STAGE"
cp -a "$SOURCE/web/." "$STAGE/"
chmod -R a+rX "$STAGE"
switched=0
rollback() {
  echo 'Web verification failed; restoring the previous application'
  if [ "$switched" = 1 ] && [ -d "$TARGET" ]; then mv "$TARGET" "$BACKUP/failed-web"; fi
  if [ -d "$PREVIOUS" ]; then mv "$PREVIOUS" "$TARGET"; fi
}
trap rollback ERR
if [ -d "$TARGET" ]; then mv "$TARGET" "$PREVIOUS"; fi
mv "$STAGE" "$TARGET"
switched=1
curl -fsS --max-time 15 --resolve app.lull.website:443:127.0.0.1 https://app.lull.website/index.html > "$BACKUP/served-index.html"
cmp "$TARGET/index.html" "$BACKUP/served-index.html"
curl -fsS --max-time 15 --resolve app.lull.website:443:127.0.0.1 https://app.lull.website/auth/callback > "$BACKUP/callback.html"
cmp "$TARGET/index.html" "$BACKUP/callback.html"
ASSET="$(grep -oE 'src="/assets/[^" ]+\.js"' "$TARGET/index.html" | head -n 1 | cut -d '"' -f 2)"
test -n "$ASSET"
curl -fsS --max-time 15 --resolve app.lull.website:443:127.0.0.1 "https://app.lull.website$ASSET" > /dev/null
trap - ERR
if [ -d "$PREVIOUS" ]; then mv "$PREVIOUS" "$BACKUP/previous-web"; fi
echo 'Lull web update installed and verified'
echo "Backup: $BACKUP"
