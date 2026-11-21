#!/usr/bin/env bash
# Serve PlatePilot from this PC and expose it through a Cloudflare quick tunnel.
#
# Usage:  bash scripts/serve-local.sh
#
# Notes:
# - The trycloudflare URL is random on every run; this script pins APP_URL to
#   whatever URL the tunnel gets, then (re)starts the dev server so the
#   canonical-host proxy serves tunnel visitors instead of redirecting them.
# - The dev server and cloudflared keep running after this script exits.
#   Stop them with:  kill $(cat dev.pid tunnel.pid 2>/dev/null)
# - Supabase magic-link emails still point at the Netlify site, so sign-in
#   from the tunnel lands on the Netlify deployment after the email click.

set -e
cd "$(dirname "$0")/.."

# 1. dev server (APP_URL cleared first; it is pinned after the tunnel is up)
python - <<'EOF'
lines=[l for l in open('.env.local',encoding='utf-8').read().splitlines() if not l.startswith('APP_URL=')]
open('.env.local','w',encoding='utf-8').write('\n'.join(lines)+'\n')
EOF
kill "$(cat dev.pid 2>/dev/null)" 2>/dev/null || true
sleep 2
nohup pnpm dev > dev.log 2>&1 & echo $! > dev.pid
for _ in $(seq 60); do grep -q "Ready in" dev.log 2>/dev/null && break; sleep 3; done
grep -q "Ready in" dev.log || { echo "dev server failed to start:"; tail -5 dev.log; exit 1; }
echo "dev server: http://localhost:3000"

# 2. tunnel
kill "$(cat .tunnel/tunnel.pid 2>/dev/null)" 2>/dev/null || true
sleep 2
cd .tunnel
./cloudflared.exe tunnel --url http://localhost:3000 > tunnel.log 2>&1 & echo $! > tunnel.pid
cd ..
for _ in $(seq 30); do grep -q "trycloudflare.com" .tunnel/tunnel.log 2>/dev/null && break; sleep 2; done
URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" .tunnel/tunnel.log | head -1)
[ -n "$URL" ] || { echo "tunnel failed to start:"; tail -5 .tunnel/tunnel.log; exit 1; }
echo "tunnel: $URL"

# 3. pin APP_URL and restart the dev server so it serves the tunnel host
python - "$URL" <<'EOF'
import sys
url=sys.argv[1]
lines=[l for l in open('.env.local',encoding='utf-8').read().splitlines() if not l.startswith('APP_URL=')]
lines.append('APP_URL='+url)
open('.env.local','w',encoding='utf-8').write('\n'.join(lines)+'\n')
EOF
kill "$(cat dev.pid)" 2>/dev/null || true
sleep 2
nohup pnpm dev > dev.log 2>&1 & echo $! > dev.pid
for _ in $(seq 60); do grep -q "Ready in" dev.log 2>/dev/null && break; sleep 3; done

echo
echo "PlatePilot is live at: $URL"
echo "Stop everything with:  kill \$(cat dev.pid .tunnel/tunnel.pid 2>/dev/null)"
