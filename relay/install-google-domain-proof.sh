#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
NAME=google7c417f37ae9e7f6f.html
TARGET=/var/www/lull-site
test "$(id -u)" = 0
test -f "$TARGET/index.html"
test "$(tr -d '\r\n' < "$SOURCE/domain-verification/$NAME")" = "google-site-verification: $NAME"
BACKUP="/root/lull-backups/google-domain-$(date +%s)-$$"
mkdir -p "$BACKUP"
existed=0
if [ -e "$TARGET/$NAME" ]; then cp -a "$TARGET/$NAME" "$BACKUP/$NAME"; existed=1; fi
rollback() {
  if [ "$existed" = 1 ]; then cp -a "$BACKUP/$NAME" "$TARGET/$NAME"; else rm -f -- "$TARGET/$NAME"; fi
}
trap rollback ERR
install -m 644 "$SOURCE/domain-verification/$NAME" "$TARGET/$NAME"
curl -fsS --max-time 15 --resolve lull.website:443:127.0.0.1 "https://lull.website/$NAME" > "$BACKUP/served.html"
cmp "$TARGET/$NAME" "$BACKUP/served.html"
trap - ERR
echo 'Google domain verification file installed and verified'
