#!/usr/bin/env bash
# Deploy dashboard di server (aaPanel/PM2):
#   git pull -> npm ci -> build -> restart -> (opsional) purge Cloudflare
#
# Pakai:
#   bash scripts/deploy.sh
# Auto-purge Cloudflare (opsional):
#   CF_ZONE_ID=xxxx CF_API_TOKEN=xxxx bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> git pull"
git pull origin main

echo "==> install deps"
npm ci

echo "==> build"
npm run build

echo "==> restart app"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart hermes-dashboard || pm2 start npm --name hermes-dashboard -- start
else
  echo "!! pm2 tidak ditemukan — restart manual lewat aaPanel (Node Project)."
fi

# Opsional: purge semua cache Cloudflare (butuh Zone ID + API Token dengan izin Cache Purge)
if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
  echo "==> purge Cloudflare"
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | head -c 200; echo
else
  echo "==> (opsional) purge Cloudflare dilewati — set CF_ZONE_ID & CF_API_TOKEN untuk auto purge."
fi

echo "==> Deploy selesai."
