# Production Overview Deployment

## Ports

- Frontend: `5173`
- Backend API and WebSocket: `3200` by default

## Raspberry Pi Setup

Fast start from a clean Raspberry Pi terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/digitalsgisb/production-overview/main/scripts/setup-pi.sh)"
```

The script installs Git/Node if needed, clones or updates the repo, creates `main/server/.env` if missing, installs dependencies, builds the frontend, creates systemd service files if missing, and starts both services.

1. Install Node.js LTS on the Raspberry Pi.
2. Clone the repository.
3. Install backend dependencies:
   ```bash
   cd production-overview/main/server
   npm ci
   cp .env.example .env
   ```
4. Update `main/server/.env`:
   - `API_KEY` must match the key used by Node-RED in the `x-api-key` header.
   - `FRONTEND_ORIGINS` must include the frontend URL, for example `http://<pi-ip>:5173`.
   - Add the PostgreSQL `DB_*` values.
5. Start the backend:
   ```bash
   npm start
   ```
6. Install and start the frontend:
   ```bash
   cd ../depan
   npm ci
   npm run dev
   ```
7. Open the dashboard from another device with:
   ```text
   http://<pi-ip>:5173
   ```

The frontend automatically talks to `http://<same-host>:3200` when `VITE_API_URL` is not set. For a custom API host, create `main/depan/.env` from `.env.example` and set `VITE_API_URL`.

## Node-RED Notes

- Keep using the backend HTTP endpoints such as `/start-session-`, `/update_product_count`, `/machine_mode`, `/setupModel`, `/update_reject`, `/downtime_log`, and `/endShift`.
- Every protected Node-RED request must send `x-api-key`; it must match `API_KEY` in `main/server/.env`.
- For Raspberry Pi deployment, change Node-RED HTTP Request URLs from the cloud API host to `http://<pi-ip>:3200/<endpoint>` unless the cloud API remains the target.
- Keep `line_id` aligned with the dashboard line IDs: `ABB4`, `ABB7`, `ABB2`, `SDY1`, or `SDY2`.
- `/update_product_count` accepts `product_count` and optional OEE metrics: `oee`, `availability_pct` or `availability_pctm`, `quality_pct`, and `performance_pct`.
- A line must have an active session before count updates are accepted. Send `/start-session-` first, then `/update_product_count`, and finally `/endShift`.
- If the dashboard is opened from a phone or another PC, do not use `localhost` in Node-RED or frontend env values unless the service is running on that same device.
