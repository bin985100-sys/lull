#!/usr/bin/env bash
# Обновление сервера Lull: каталог + вход (Telegram/Google) + веб-приложение на app.lull.website.
# Запуск на сервере:  sudo bash update.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/lull-relay
DATA=/var/lib/lull-relay
ENVF=$DATA/auth.env
UNIT=/etc/systemd/system/lull-api.service

echo "== 1. Каталог и вход"
cp "$HERE/lull-api.mjs" "$APP/lull-api.mjs"
if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<'ENV'
# Секреты входа. Заполни и перезапусти: systemctl restart lull-api
# Токен бота от @BotFather:
LULL_TG_TOKEN=
# Google Cloud → APIs & Services → Credentials → OAuth client (Web application):
LULL_GOOGLE_ID=
LULL_GOOGLE_SECRET=
LULL_PUBLIC_URL=https://api.lull.website
LULL_APP_URL=https://app.lull.website
ENV
fi
chown lull:lull "$ENVF" && chmod 600 "$ENVF"
grep -q "EnvironmentFile=-$ENVF" "$UNIT" || sed -i "s#^ExecStart=#EnvironmentFile=-$ENVF\nExecStart=#" "$UNIT"
systemctl daemon-reload
systemctl restart lull-api
sleep 2
curl -fsS http://127.0.0.1:8787/api/health >/dev/null && echo "  каталог работает"
echo "  вход: $(curl -fsS http://127.0.0.1:8787/api/auth/config)"

echo "== 2. Звук: быстрый старт треков"
if [ -f "$HERE/server.py" ]; then
  cp "$APP/server.py" "$APP/server.py.bak-$(date +%s)" 2>/dev/null || true
  cp "$HERE/server.py" "$APP/server.py"
  [ -f "$DATA/yt-cookies.txt" ] && chown lull:lull "$DATA/yt-cookies.txt" && chmod 600 "$DATA/yt-cookies.txt" && echo "  аккаунт YouTube для звука: подключён (cookies)"
  systemctl restart lull-relay
  sleep 2
  systemctl is-active --quiet lull-relay && echo "  звук работает" || { echo "  !! relay не стартовал, возвращаю прошлую версию"; cp "$(ls -t $APP/server.py.bak-* | head -1)" "$APP/server.py"; systemctl restart lull-relay; }
fi
echo "  проверка звука (до 30 с):"
for id in kJQP7kiw5Fk JGwWNGJdvx8; do
  echo "   $id: $(curl -s -o /dev/null -m 40 -H 'Range: bytes=0-1' -w '%{http_code} за %{time_total}s' http://127.0.0.1:8480/api/stream/$id?q=aac 2>/dev/null || echo ошибка)"
done
journalctl -u lull-relay --since "-2 min" --no-pager -o cat 2>/dev/null | grep -E "resolve|ERROR|error|WARN" | tail -12 | sed 's/^/    /' 

echo "== 3. Веб-приложение"
mkdir -p /var/www/lull-app
rm -rf /var/www/lull-app/*
tar xzf "$HERE/web.tgz" -C /var/www/lull-app
CF=/etc/caddy/Caddyfile
MYIP=$(curl -4 -fsS https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
if [ "$(getent ahostsv4 app.lull.website | awk 'NR==1{print $1}')" = "$MYIP" ]; then
  if ! grep -q "^app.lull.website" "$CF"; then
    cp "$CF" "$CF.bak-lull-$(date +%s)"
    cat >> "$CF" <<'BLOCK'

app.lull.website {
	encode zstd gzip
	root * /var/www/lull-app
	header /_expo/* Cache-Control "public, max-age=31536000, immutable"
	header /sw.js Cache-Control "no-cache"
	header /index.html Cache-Control "no-cache"
	try_files {path} /index.html
	file_server
}
BLOCK
  fi
  systemctl reload caddy
  echo "  веб-приложение: https://app.lull.website"
else
  echo "  !! app.lull.website не указывает на этот сервер ($MYIP). Добавь A-запись app → $MYIP и запусти скрипт снова."
fi
echo "== 4. Лендинг lull.website"
if [ -f "$HERE/landing.tgz" ]; then
  SITE=/var/www/lull-site
  mkdir -p "$SITE"
  # старое убираем, папку downloads (APK и прочие файлы) оставляем
  find "$SITE" -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {} +
  tar xzf "$HERE/landing.tgz" -C "$SITE"
  chmod -R a+rX "$SITE"
  if grep -q "^lull.website" /etc/caddy/Caddyfile; then systemctl reload caddy; echo "  лендинг обновлён: https://lull.website"; else echo "  !! lull.website не настроен в Caddy на этом сервере — файлы лежат в $SITE"; fi
  [ -f "$SITE/downloads/Lull.apk" ] && echo "  APK: $(du -h "$SITE/downloads/Lull.apk" | cut -f1), от $(date -r "$SITE/downloads/Lull.apk" '+%d.%m %H:%M')" || echo "  !! нет $SITE/downloads/Lull.apk — положи туда APK"
fi

echo
echo "Готово. Секреты входа: nano $ENVF  →  systemctl restart lull-api"
