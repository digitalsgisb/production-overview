#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/digitalsgisb/production-overview.git}"
APP_DIR="${APP_DIR:-$HOME/production-overview}"
BACKEND_SERVICE="/etc/systemd/system/production-overview-backend.service"
FRONTEND_SERVICE="/etc/systemd/system/production-overview-frontend.service"
RUN_USER="${SUDO_USER:-$USER}"

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    return 1
  fi
}

prompt_value() {
  local label="$1"
  local default_value="${2:-}"
  local secret="${3:-false}"
  local value=""

  if [ "$secret" = "true" ]; then
    read -r -s -p "$label" value
    echo >&2
  else
    read -r -p "$label" value
  fi

  if [ -z "$value" ]; then
    value="$default_value"
  fi

  printf '%s' "$value"
}

get_primary_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

ensure_node() {
  local node_major="0"

  if need_command node; then
    node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  fi

  if [ "$node_major" -ge 20 ] 2>/dev/null && need_command npm && need_command git; then
    return
  fi

  echo "Installing Git and Node.js 22.x..."
  sudo apt-get update
  sudo apt-get install -y curl ca-certificates gnupg git
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
}

prepare_repo() {
  if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repo at $APP_DIR"
    git -C "$APP_DIR" pull --ff-only
    return
  fi

  if [ -e "$APP_DIR" ]; then
    echo "ERROR: $APP_DIR already exists but is not a Git repo. Move it first or set APP_DIR to a new path."
    exit 1
  fi

  echo "Cloning $REPO_URL into $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
}

write_server_env() {
  local env_file="$APP_DIR/main/server/.env"
  local pi_ip
  local default_origins

  if [ -f "$env_file" ]; then
    echo "Keeping existing $env_file"
    return
  fi

  pi_ip="$(get_primary_ip)"
  default_origins="http://localhost:5173,http://127.0.0.1:5173"
  if [ -n "$pi_ip" ]; then
    default_origins="$default_origins,http://$pi_ip:5173"
  fi

  echo "Creating $env_file"
  local api_key db_host db_user db_pass db_name db_port admin_email admin_pass
  api_key="${API_KEY:-$(prompt_value 'Node-RED API_KEY: ' '' true)}"
  db_host="${DB_HOST:-$(prompt_value 'DB_HOST (blank to skip): ' '')}"
  db_user="${DB_USER:-$(prompt_value 'DB_USER (blank to skip): ' '')}"
  db_pass="${DB_PASS:-$(prompt_value 'DB_PASS (blank to skip): ' '' true)}"
  db_name="${DB_DB:-$(prompt_value 'DB_DB/name (blank to skip): ' '')}"
  db_port="${DB_PORT:-$(prompt_value 'DB_PORT [5432]: ' '5432')}"
  admin_email="${LOCAL_ADMIN_EMAIL:-$(prompt_value 'Local admin email [admin@local.test]: ' 'admin@local.test')}"
  admin_pass="${LOCAL_ADMIN_PASSWORD:-$(prompt_value 'Local admin password [admin123]: ' 'admin123' true)}"

  cat > "$env_file" <<EOF
PORT=3200
API_KEY=$api_key
FRONTEND_ORIGINS=${FRONTEND_ORIGINS:-$default_origins}

DB_HOST=$db_host
DB_USER=$db_user
DB_PASS=$db_pass
DB_DB=$db_name
DB_PORT=$db_port

ENABLE_LOCAL_ADMIN=true
LOCAL_ADMIN_EMAIL=$admin_email
LOCAL_ADMIN_PASSWORD=$admin_pass
LOCAL_ADMIN_NAME=Local Admin
EOF
}

install_dependencies() {
  echo "Installing backend dependencies..."
  npm ci --prefix "$APP_DIR/main/server"

  echo "Installing frontend dependencies..."
  npm ci --prefix "$APP_DIR/main/depan"

  echo "Building frontend..."
  npm run build --prefix "$APP_DIR/main/depan"
}

write_service_if_missing() {
  local service_path="$1"
  local service_name="$2"
  local working_dir="$3"
  local npm_script="$4"
  local npm_bin

  if [ -f "$service_path" ]; then
    echo "Keeping existing $service_path"
    return
  fi

  npm_bin="$(command -v npm)"
  echo "Creating $service_path"
  sudo tee "$service_path" >/dev/null <<EOF
[Unit]
Description=$service_name
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$working_dir
ExecStart=$npm_bin run $npm_script
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
}

start_services() {
  write_service_if_missing "$BACKEND_SERVICE" "Production Overview Backend" "$APP_DIR/main/server" "start"
  write_service_if_missing "$FRONTEND_SERVICE" "Production Overview Frontend" "$APP_DIR/main/depan" "preview"

  sudo systemctl daemon-reload
  sudo systemctl enable --now production-overview-backend.service
  sudo systemctl enable --now production-overview-frontend.service
  sudo systemctl restart production-overview-backend.service
  sudo systemctl restart production-overview-frontend.service
}

print_done() {
  local pi_ip
  pi_ip="$(get_primary_ip)"

  echo
  echo "Production Overview is installed."
  echo "Frontend: http://${pi_ip:-<pi-ip>}:5173"
  echo "Backend:  http://${pi_ip:-<pi-ip>}:3200"
  echo
  echo "Check status:"
  echo "sudo systemctl status production-overview-backend production-overview-frontend"
  echo
  echo "Node-RED HTTP Request URL example:"
  echo "http://${pi_ip:-<pi-ip>}:3200/update_product_count"
}

ensure_node
prepare_repo
write_server_env
install_dependencies
start_services
print_done
