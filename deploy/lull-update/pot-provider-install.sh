#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/lull-pot
PY=/opt/lull-relay/venv/bin/python
REV=26475e9d3665b972c4aeb83b4dbaafcf64b88438
mkdir -p "$ROOT"
if [ ! -d "$ROOT/bgutil/.git" ]; then
  git clone --single-branch --depth 1 --branch 2.0.2 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git "$ROOT/bgutil"
fi
test "$(git -C "$ROOT/bgutil" rev-parse HEAD)" = "$REV"
if [ ! -s "$ROOT/bgutil/server/build/main.js" ]; then
  (cd "$ROOT/bgutil/server" && npm ci && npx tsc)
fi
if ! "$PY" -c 'import importlib.metadata as m; assert m.version("bgutil-ytdlp-pot-provider")=="2.0.2"' 2>/dev/null; then
  "$PY" -m pip install -q 'bgutil-ytdlp-pot-provider==2.0.2'
fi
install -d -o lull -g lull -m 700 /var/lib/lull-pot
cat > /etc/systemd/system/lull-pot.service <<'UNIT'
[Unit]
Description=Lull GVS proof-of-origin token provider
After=network-online.target
Wants=network-online.target
[Service]
User=lull
Group=lull
WorkingDirectory=/opt/lull-pot/bgutil/server
ExecStart=/usr/bin/node /opt/lull-pot/bgutil/server/build/main.js --host 127.0.0.1
Environment=HOME=/var/lib/lull-pot
Restart=on-failure
RestartSec=5
Slice=lull.slice
MemoryMax=192M
MemorySwapMax=64M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/lull-pot
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now lull-pot
ready=0
for n in $(seq 1 12); do
  if curl -fsS --max-time 1 http://127.0.0.1:4416/ping >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
echo 'GVS token provider ready on loopback only'
