#!/usr/bin/env bash
set -euo pipefail

# Run from a local checkout on the Linux Atom PC. Keep secrets in main/server/.env.
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$APP_DIR/main/server"
FRONTEND_DIR="$APP_DIR/main/depan"
SERVICE_NAME="production-overview"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

for command in node npm sudo systemctl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing $command. Install Node.js 22.12+ and systemd tools, then rerun." >&2
    exit 1
  fi
done

if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major>22 || (major===22 && minor>=12) ? 0 : 1)'; then
  echo "Node.js 22.12 or newer is required. Current: $(node --version)" >&2
  exit 1
fi

if [ ! -f "$SERVER_DIR/.env" ]; then
  cp "$SERVER_DIR/.env.example" "$SERVER_DIR/.env"
  chmod 600 "$SERVER_DIR/.env"
  echo "Created $SERVER_DIR/.env. Fill in API_KEY, JWT_SECRET, DB_*, and login settings, then rerun." >&2
  exit 1
fi

npm ci --prefix "$SERVER_DIR"

(
  cd "$SERVER_DIR"
  node - <<'NODE'
require('dotenv').config();
const required = ['API_KEY', 'JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_DB', 'DB_PORT'];
if (process.env.ENABLE_LOCAL_ADMIN === 'true') required.push('LOCAL_ADMIN_PASSWORD');
const missing = required.filter((key) => !process.env[key] || process.env[key].startsWith('replace-with-') || process.env[key] === 'change-this-password');
if (missing.length) {
  console.error(`Complete these values in main/server/.env: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.API_KEY.length < 16 || process.env.JWT_SECRET.length < 32) {
  console.error('API_KEY must have 16+ characters and JWT_SECRET 32+ characters.');
  process.exit(1);
}
NODE
)

npm ci --prefix "$FRONTEND_DIR"
npm run build --prefix "$FRONTEND_DIR"

NODE_BIN="$(command -v node)"
RUN_USER="$(id -un)"
sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=Production Overview API and web app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$SERVER_DIR
ExecStart=$NODE_BIN $SERVER_DIR/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"
echo "Open http://$(hostname -I | awk '{print $1}'):3200 on a phone or PC on this network."
