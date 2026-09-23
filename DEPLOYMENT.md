# Deploy to the AI Atom PC (Linux)

This guide assumes a Debian or Ubuntu style Linux installation with systemd. Keep the Raspberry Pi running until the Atom PC has received live data and users can sign in. The setup script does not move the PostgreSQL database, change Node-RED, or stop the Pi.

## 1. Prepare the PC

Install Node.js **22.12 or newer**, npm, Git, and PostgreSQL access. Give the PC a stable LAN address or DHCP reservation so phone and Node-RED URLs do not change. Allow TCP port `3200` from the trusted plant network. If Node-RED is on another device, it must be able to reach the PC on that port.

Clone the repository on the Atom PC:

```bash
git clone https://github.com/digitalsgisb/production-overview.git
cd production-overview
```

## 2. Database and configuration

The app uses PostgreSQL. For continuity, point `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_DB`, and `DB_PORT` at the existing database if the Atom PC can reach it. If moving PostgreSQL too, back it up on the old host, restore it on the new host, and test the restored users and production tables before switching Node-RED. On first use, the app adds a `username` column to existing users, assigns unique usernames from email prefixes, and creates the production line registry and guest setting tables. The database user needs table creation and user-table alteration permissions. Back up the database before the first upgrade.

Copy the example and edit it on the Atom PC:

```bash
cp main/server/.env.example main/server/.env
chmod 600 main/server/.env
nano main/server/.env
```

Set a unique shared `API_KEY` (at least 16 characters) and configure the same value in every Node-RED flow's `x-api-key` header. Set a random `JWT_SECRET` (at least 32 characters), for example with `openssl rand -hex 32`. Keep the existing `JWT_SECRET` during migration if you want existing signed sessions to remain valid. Set `ENABLE_LOCAL_ADMIN=true` only if you need the bootstrap login, and give it a strong `LOCAL_ADMIN_PASSWORD`. Set `LOCAL_ADMIN_USERNAME` for the bootstrap login; if absent, the part before `@` in `LOCAL_ADMIN_EMAIL` is used. The local admin does not appear in the database user list. Set `PORT=3200`. `FRONTEND_ORIGINS` is only needed for a separate development frontend or an existing external frontend.

There is no need to copy `main/depan/.env` for the production build. If it contains a Pi address or `localhost`, remove it before building so phones use the Atom PC's own address. No secrets belong in the frontend `.env`.

## 3. Install and start

From the repository directory:

```bash
bash scripts/setup-atom.sh
```

The script checks configuration, installs locked dependencies, builds the frontend, and creates one `production-overview` systemd service. It does not pull code or overwrite `.env`. Then verify:

```bash
sudo systemctl status production-overview
curl http://127.0.0.1:3200/healthz
sudo journalctl -u production-overview -n 100 --no-pager
```

Open `http://<atom-ip>:3200` on a phone and desktop. Sign in, check both sites, and verify the live feed indicator and line changes. The wallboard is at `http://<atom-ip>:3200/wallboard`. HTTP on a local LAN is for a trusted network; use an HTTPS reverse proxy if this must be reachable over the internet.

## 4. Move Node-RED traffic

Point Node-RED HTTP Request nodes at `http://<atom-ip>:3200/<endpoint>` and send the matching `x-api-key`. Existing routes and payloads remain the same: `/start-session-`, `/update_product_count`, `/machine_mode`, `/setupModel`, `/update_reject`, `/downtime_log`, and `/endShift`. `line_id` must match a line registered under **Manage system → Production lines**. Existing IDs are added to the registry automatically. Send `/start-session-` before count updates and `/endShift` at shift end. Register a new line before switching its Node-RED flow; a correct key with an unknown ID receives a 404 response.

Do not have Node-RED send the same event to both old and new servers unless both point at the same database and duplicate database writes are acceptable. Check one full start, update, and end sequence on the Atom PC before retiring the Pi. Line state is currently held in process memory, so a restart starts with offline cards until Node-RED sends fresh session and line data; plan the cutover at a shift boundary or replay current state.

## Updates and rollback

```bash
cd ~/production-overview
git pull --ff-only
bash scripts/setup-atom.sh
```

Before changing a live system, back up PostgreSQL and `main/server/.env`. If the Atom deployment fails during cutover, restore the previous Node-RED target and reopen the Pi dashboard while diagnosing `journalctl -u production-overview`.
