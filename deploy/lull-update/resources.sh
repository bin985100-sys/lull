#!/usr/bin/env bash
set -euo pipefail
# Bound the combined resolvers on the 2 GB VPS, including native buffers.
cat > /etc/systemd/system/lull.slice <<'UNIT'
[Unit]
Description=Lull service memory budget
[Slice]
MemoryHigh=700M
MemoryMax=950M
MemorySwapMax=768M
UNIT
for service in lull-api lull-region-api lull-us-api lull-relay; do
  if systemctl cat "$service" >/dev/null 2>&1; then
    mkdir -p "/etc/systemd/system/$service.service.d"
    cat > "/etc/systemd/system/$service.service.d/resources.conf" <<'UNIT'
[Service]
Slice=lull.slice
MemoryAccounting=yes
UNIT
    if [ "$service" != lull-relay ]; then
      echo 'Environment=NODE_OPTIONS=--max-old-space-size=384' >> "/etc/systemd/system/$service.service.d/resources.conf"
    fi
  fi
done
systemctl daemon-reload
