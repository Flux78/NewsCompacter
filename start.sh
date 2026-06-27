#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== NewsCompacter Production ==="
echo ""

# 1. Frontend bauen (falls nicht vorhanden)
if [ ! -d "$ROOT/frontend/dist" ]; then
  echo "1) Frontend build…"
  cd "$ROOT/frontend"
  npm install 2>&1 | tail -10
  npm run build 2>&1
fi

# 2. Backend starten (serviert auch das Frontend)
echo "2) Backend starten auf Port 8000…"
cd "$ROOT/backend"
rm -f newscompacter.db
pip install -r requirements.txt --break-system-packages -q 2>/dev/null
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
