#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== NewsCompacter Production Build ==="
echo ""

# 1. Frontend bauen
echo "1) Frontend build…"
NODE_VER=$(node -e "console.log(process.version.slice(1).split('.')[0])" 2>/dev/null || echo "0")
if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
  echo "   Node.js 18+ erforderlich (aktuell: $(node --version 2>/dev/null || echo 'nicht installiert'))"
  echo "   Update: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
cd "$ROOT/frontend"
npm install 2>&1 | tail -10
npm run build 2>&1
echo "   → dist/ erstellt"

# 2. Backend vorbereiten
echo "2) Backend dependencies…"
cd "$ROOT/backend"
pip install -r requirements.txt --break-system-packages -q 2>/dev/null

# 3. Start (ein Prozess, Port 8000)
echo ""
echo "=== Start ==="
echo "URL: http://$(hostname -I | awk '{print $1}'):8000"
echo "Drücke Ctrl+C zum Beenden"
cd "$ROOT/backend"
rm -f newscompacter.db
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
