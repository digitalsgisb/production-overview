# Production Overview

Live mobile and desktop monitoring for Port Klang and Sendayan. Node-RED sends line events to the API; browsers receive updates over Socket.IO. Admins manage lines from the **Lines** page beside **Progress**. Attendance and History are still placeholders.

Admins can set each line to **Active**, **Commissioning**, or **Maintenance** in **Lines** and add a short note. Commissioning and Maintenance keep receiving Node-RED data but show muted cards with an unverified label. Their OEE, output, target, and rejects are excluded from dashboard and wallboard totals until an admin marks them Active again. Status changes are saved in PostgreSQL and reach open dashboards live.

## Docker migration: Raspberry Pi to AI PC

**Do not stop the Pi now.** Keep the Pi application, PostgreSQL, and Node-RED traffic running while you prepare the AI PC. Pause Node-RED writes and stop the Pi backend only for the final database copy and cutover. After the AI PC is receiving live data and users can sign in, stop and disable the Pi application services. Keep the Pi database as a rollback copy until you are confident in the new system.

This guide assumes the AI PC runs Linux, PostgreSQL currently runs on the Pi, and the repository is `~/production-overview` on both machines. Replace the example usernames, IPs, and paths with your actual values. The app container listens on port **3200**; the database container is private to Docker. Give the AI PC a fixed LAN IP or DHCP reservation before changing Node-RED URLs.

### 1. Record the current Pi setup

On the Pi, identify its application services and database version:

```bash
ssh <pi-user>@<pi-ip>
cd ~/production-overview
sudo systemctl status production-overview-backend production-overview-frontend
# Read DB_HOST, DB_USER, DB_DB and DB_PORT from main/server/.env without posting secrets.
psql -h <current-db-host> -p <current-db-port> -U <current-db-user> -d <current-db-name> -Atc 'SHOW server_version;'
```

The supplied `compose.db.yaml` uses PostgreSQL **17**. Check that the Pi database is version 17 or older before using it. If the Pi runs a newer major version, change the target image to the same or newer supported major *before creating the Docker volume*; follow that image's documented data-volume path. Use a `pg_dump` client at least as new as the source server. [PostgreSQL's `pg_dump` documentation](https://www.postgresql.org/docs/17/app-pgdump.html) explains version compatibility and the custom archive format.

Check whether Node-RED itself runs on the Pi. This guide moves Production Overview and PostgreSQL. If Node-RED runs on the Pi, keep that Pi running after this cutover or migrate its flows and credentials separately before retiring the Pi.

### 2. Prepare Docker on the AI PC

Install [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/) on the Linux AI PC. Check both commands:

```bash
docker version
docker compose version
```

If this repository is not yet on the AI PC, clone it:

```bash
git clone https://github.com/digitalsgisb/production-overview.git ~/production-overview
cd ~/production-overview
```

If it is already there, run `cd ~/production-overview && git pull --ff-only` instead. Run all following AI PC commands from that repository folder.

Copy the Pi's private settings over an SSH connection, then edit them on the AI PC:

```bash
scp <pi-user>@<pi-ip>:~/production-overview/main/server/.env main/server/.env
chmod 600 main/server/.env
nano main/server/.env
```

Keep `API_KEY` equal to the key Node-RED sends in `x-api-key`. Keep or replace `JWT_SECRET` with a long random value. Set `DB_HOST=db`, `DB_PORT=5432`, and keep the database name, user, and password you intend to restore. Set `PORT=3200`. Add every browser address you will use to the comma-separated `FRONTEND_ORIGINS`, including the AI PC address with port 3200, for example `FRONTEND_ORIGINS=http://100.109.37.96:3200,http://192.168.1.50:3200`. Match the address shown in your browser exactly, without a trailing slash. If `ENABLE_LOCAL_ADMIN=true`, its login is `LOCAL_ADMIN_USERNAME` or the part before `@` in `LOCAL_ADMIN_EMAIL`, and its password is the `LOCAL_ADMIN_PASSWORD` value in this private file. A local admin password of at least eight characters is required when this option is enabled; the server will refuse to start without one. There is no universal admin password; database account passwords remain the same after restoring the database. Change any example or weak local admin password before starting the AI PC. The app's `.env` is ignored by Git and excluded from the Docker image. Do not create a frontend `.env` with a Pi address or `localhost` for this build.

The Docker build serves the website and API from the same app on port 3200. Production browsers call their current website origin for the API and live socket; local Vite development still calls port 3200. Production builds ignore `VITE_API_URL` and `VITE_SOCKET_URL` so an old frontend setting cannot send browser requests to an unreachable public port 3200. `VITE_API_URL` in the backend `.env` does not configure the bundled frontend.

Check the Compose files and build the app image without starting it:

```bash
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml config --quiet
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml build app
```

Open TCP port `3200` on the AI PC's firewall for trusted phones and Node-RED devices. PostgreSQL port `5432` is not published by this Compose setup. [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) lets the app reach the database by the service name `db`.

### 3. Cut over at a shift boundary

Choose a short maintenance window, ideally after `/endShift`. The app keeps current line state in memory; the new container starts with offline cards until Node-RED sends fresh session and line events. Avoid sending the same production event to both servers.

1. Pause the Node-RED flows that write to Production Overview. Keep the flows and their current URL settings for rollback.
2. On the Pi, stop **only the application backend** so it cannot write while the final dump is made:

   ```bash
   sudo systemctl stop production-overview-backend
   ```

3. On the Pi, create a custom-format database archive. Use the Pi database values recorded in step 1. The command prompts for a password if required:

   ```bash
   mkdir -p ~/production-overview/backups
   pg_dump -h <current-db-host> -p <current-db-port> -U <current-db-user> -d <current-db-name> -Fc -f ~/production-overview/backups/production-overview.dump
   pg_restore --list ~/production-overview/backups/production-overview.dump | head
   ```

4. On the AI PC, copy the archive and start **only** the new database container:

   ```bash
   cd ~/production-overview
   mkdir -p backups
   scp <pi-user>@<pi-ip>:~/production-overview/backups/production-overview.dump backups/
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml up -d db
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml ps
   ```

5. Restore into the empty Docker database, then start the app. The restore uses the database name and user from `main/server/.env` passed to the PostgreSQL container:

   ```bash
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < backups/production-overview.dump
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml up -d --build app
   docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml ps
   curl http://127.0.0.1:3200/healthz
   ```

   The app creates the username column and production line registry on first use. Confirm the database restore completed without errors before starting the app. If `pg_restore` fails, fix the cause and restore to a fresh empty database; do not proceed with a partial restore.

6. Open `http://<ai-pc-ip>:3200` on a phone and desktop. Sign in with a username. Existing database accounts receive usernames from their old email prefixes; duplicate prefixes get numeric suffixes. Admins can change usernames in **Accounts & access**. Open `http://<ai-pc-ip>:3200/wallboard` as well. Confirm the sites, registered lines, and account list are present.
7. If your Node-RED devices use Cloudflare hostnames, move the Production Overview published applications from the old Pi tunnel to the AI PC tunnel. On the AI PC tunnel, set `production-api.sugidigital.org` and the website hostname you use (currently `prod-overview.sugidigital.org`) to the service `http://localhost:3200` **when `cloudflared` runs on the AI PC host**. Creating or renaming a tunnel does not by itself publish a hostname; the tunnel route and its DNS record must point to the AI PC tunnel. The Docker app serves both the API and website on port 3200; port 5173 was the old frontend development server. If `cloudflared` runs inside a separate container, use an origin address that container can actually reach instead of its own `localhost`. Move only the Production Overview routes; leave unrelated Pi routes such as `imts.sugidigital.org` in place. A hostname already assigned to the Pi tunnel may need its old route and DNS CNAME removed or updated before the AI PC route can be saved. Confirm `https://production-api.sugidigital.org/healthz` returns `{"status":"ok"}` and the website opens before resuming production flows. The API hostname can remain the same, so Node-RED flows already using it do not need a URL change.
8. For Node-RED HTTP Request nodes still using the Pi's direct IP, change only the base address to `http://<ai-pc-ip>:3200/<same-endpoint>`. Keep the existing method, payload, and shared `x-api-key`. Resume the flows. Start a new line session before sending counts, then confirm live updates on the phone. The endpoints and payloads stay the same, including `/start-session-`, `/update_product_count`, `/machine_mode`, `/setupModel`, `/update_reject`, `/downtime_log`, and `/endShift`.
9. When one complete start, update, and end sequence works, retire the old **application** services on the Pi:

   ```bash
   sudo systemctl stop production-overview-frontend
   sudo systemctl disable production-overview-backend production-overview-frontend
   ```

Leave Pi PostgreSQL and its backup untouched until you have confirmed that the AI PC database contains the latest data and you no longer need rollback. Do not stop Pi PostgreSQL if Node-RED or another application still uses it.

### 4. Verify and operate

On the AI PC:

```bash
cd ~/production-overview
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml ps
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml logs --tail=100 app
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml logs --tail=100 db
```

A healthy `/healthz` response shows that the app process is running; also sign in and check live line changes to verify the database and Node-RED path. A newly registered line appears on mobile and wallboard after an Admin adds its ID, name, site, and optional dashboard URL in **Lines**. Node-RED must then send that exact ID with the same shared API key. An unknown line ID returns HTTP 404.

Admins can drag line cards on **Progress** to set their order, drag the resize control left or right, or choose Compact, Standard, or Wide. The **Lines** page also offers add, edit, reorder, size, and delete controls. These settings are saved in PostgreSQL and broadcast to connected viewers. Deleting a line removes it from the live dashboard and rejects new Node-RED events for that ID; it does not erase historical production records. You can add the same ID again later. Back up PostgreSQL before making large layout or line changes.

Back up the Docker database regularly. This example writes a custom archive to the Git-ignored `backups/` directory:

```bash
mkdir -p backups
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/production-$(date +%F).dump
```

### Pull and deploy later updates on the AI PC

Run these commands **on the AI PC**, from the repository directory shown in your terminal (`/srv/apps/production-overview`). Adjust that path if you installed it elsewhere. The private `main/server/.env` file and the PostgreSQL Docker volume stay in place:

```bash
cd /srv/apps/production-overview
git status --short
git pull --ff-only
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml up -d --build app
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml ps
curl http://127.0.0.1:3200/healthz
```

If `git status --short` lists modified tracked files, review them before pulling; `git pull --ff-only` may refuse to overwrite local changes. After the health check, refresh the dashboard in your browser and confirm a line receives live updates. Compose rebuilds and replaces the app container and keeps the database container and its named volume. Node-RED can continue using the same AI PC API address and shared key.

Never use `docker compose down -v` here: `-v` deletes the database volume. The base `compose.yaml` is for an **external PostgreSQL server**; use it alone only if you intentionally keep the database elsewhere and set `DB_HOST` to a host reachable from inside the app container. `localhost` inside the container means the container itself, not the Pi or AI PC. If PostgreSQL stays on the Pi, the Pi must remain powered on. The full migration above uses both Compose files so the AI PC can eventually replace the Pi.

### Rollback

If the AI PC fails **before it accepts new production writes**, pause Node-RED again, stop the new app, restore the original Node-RED URLs, start both Pi application services, and resume the flows:

```bash
# AI PC:
docker compose --env-file main/server/.env -f compose.yaml -f compose.db.yaml stop app
# Pi:
sudo systemctl start production-overview-backend production-overview-frontend
```

If the AI PC database has already accepted production writes, the old Pi database is stale. Make a fresh backup of the AI PC database and reconcile or migrate those new records before reverting. Simply changing Node-RED back to the Pi would lose the intervening data.

## Development

```bash
npm ci --prefix main/server
npm ci --prefix main/depan
npm start --prefix main/server
# In another terminal:
npm run dev --prefix main/depan
```

The Vite development UI is at `http://localhost:5173` and talks to the API at `http://localhost:3200`. For access from another device in development, add that origin to `FRONTEND_ORIGINS` in `main/server/.env`.
