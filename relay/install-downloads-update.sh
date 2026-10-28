#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")" && pwd)"
SITE=/var/www/lull-site
STAMP="$(date +%s)-$$"
BACKUP="/root/lull-backups/downloads-$STAMP"
RELEASE="/var/www/lull-downloads/build-36-$STAMP"
FILES=(Lull-Setup.exe Lull-mac-arm64.dmg Lull-mac-x64.dmg Lull.apk)
test "$(id -u)" = 0
test ! -L "$SITE"
test -f "$SITE/index.html"
test ! -L "$SITE/index.html"
mkdir -p "$BACKUP" "$RELEASE"
PAGES=(index.html)
if [ -f "$SITE/install.html" ]; then
  test ! -L "$SITE/install.html"
  PAGES+=(install.html)
fi
for PAGE in "${PAGES[@]}"; do
  cp -p "$SITE/$PAGE" "$BACKUP/$PAGE"
  if [ "$PAGE" = index.html ]; then
    python3 "$SOURCE/direct_downloads.py" "$SITE/$PAGE" "$BACKUP/$PAGE.next"
  else
    python3 "$SOURCE/direct_downloads.py" "$SITE/$PAGE" "$BACKUP/$PAGE.next" --partial
  fi
done
for NAME in "${FILES[@]}"; do
  test -s "$SOURCE/downloads/$NAME"
  cp "$SOURCE/downloads/$NAME" "$RELEASE/$NAME"
done
cp "$SOURCE/downloads/SHA256SUMS" "$SOURCE/downloads/manifest.json" "$RELEASE/"
(cd "$RELEASE" && sha256sum -c SHA256SUMS)
chmod -R a+rX "$RELEASE"
old_saved=0
switched=0
rollback() {
  echo 'Download verification failed; restoring the previous landing and files'
  if [ "$switched" = 1 ] && [ -L "$SITE/downloads" ] && [ "$(readlink "$SITE/downloads")" = "$RELEASE" ]; then unlink "$SITE/downloads"; fi
  if [ "$old_saved" = 1 ]; then mv "$BACKUP/downloads" "$SITE/downloads"; fi
  for PAGE in "${PAGES[@]}"; do
    cp -p "$BACKUP/$PAGE" "$SITE/.$PAGE-restore-$STAMP"
    mv -Tf "$SITE/.$PAGE-restore-$STAMP" "$SITE/$PAGE"
  done
}
trap rollback ERR
if [ -e "$SITE/downloads" ] || [ -L "$SITE/downloads" ]; then
  mv "$SITE/downloads" "$BACKUP/downloads"
  old_saved=1
fi
ln -s "$RELEASE" "$SITE/.downloads-next-$STAMP"
mv -Tf "$SITE/.downloads-next-$STAMP" "$SITE/downloads"
switched=1
for PAGE in "${PAGES[@]}"; do
  install -m 644 "$BACKUP/$PAGE.next" "$SITE/.$PAGE-next-$STAMP"
  mv -Tf "$SITE/.$PAGE-next-$STAMP" "$SITE/$PAGE"
  curl -fsS --max-time 15 --resolve lull.website:443:127.0.0.1 "https://lull.website/$PAGE" > "$BACKUP/served-$PAGE"
  cmp "$SITE/$PAGE" "$BACKUP/served-$PAGE"
done
for NAME in "${FILES[@]}"; do
  CODE="$(curl -sS --max-time 30 --resolve lull.website:443:127.0.0.1 --range 0-1023 -D "$BACKUP/$NAME.headers" -o "$BACKUP/$NAME.first" -w '%{http_code}' "https://lull.website/downloads/$NAME")"
  test "$CODE" = 206
  SIZE="$(stat -c %s "$RELEASE/$NAME")"
  tr -d '\r' < "$BACKUP/$NAME.headers" | grep -qi "^content-range: bytes 0-1023/$SIZE$"
  head -c 1024 "$RELEASE/$NAME" > "$BACKUP/$NAME.expected"
  cmp "$BACKUP/$NAME.expected" "$BACKUP/$NAME.first"
done
trap - ERR
echo 'Lull direct downloads installed and verified'
echo "Backup: $BACKUP"
