# Production Overview

A live view of the Port Klang and Sendayan production lines. Node-RED sends data to the Node.js API; authenticated browser clients receive line updates through Socket.IO. The mobile dashboard puts live line cards first, and `/wallboard` remains available for TVs and desktop displays.

## AI Atom PC (Linux)

The production deployment uses **one service on port 3200** for the API, WebSocket, and built React app. Open `http://<atom-ip>:3200` from a phone or desktop on the same network. Node-RED posts to that same host and port with `x-api-key`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the first installation, database and account migration, Node-RED settings, and update steps. The previous Raspberry Pi instructions are archived in [docs/raspberry-pi-guide.md](docs/raspberry-pi-guide.md) and [docs/raspberry-pi-deployment.md](docs/raspberry-pi-deployment.md).

## Development

```bash
npm ci --prefix main/server
npm ci --prefix main/depan
npm start --prefix main/server
# In another terminal:
npm run dev --prefix main/depan
```

The Vite development app is at `http://localhost:5173`; it connects to the API at `http://localhost:3200`. For access from another device during development, add that origin to `main/server/.env` as `FRONTEND_ORIGINS`. The production build uses the same origin and needs no cross-origin setting.

Backend configuration lives in `main/server/.env` (copy `.env.example`). Do not commit it. The frontend `.env.example` is only for custom development API addresses; do not set it to `localhost` when building for phones.

## Accounts

Database users sign in with a username and password. On the first login after upgrading, existing accounts receive a username from the part of their email before `@`; duplicates receive a numeric suffix. An Admin can open **Manage system** to create users, edit usernames, choose site access, pause sign-in, reset passwords, and control guest access. Site assignments limit live line subscriptions and the dashboard and wallboard views. Viewer, Operator, Line Leader, and Supervisor currently have the same live viewing capability; Admin also manages accounts. The optional local admin in `.env` is a bootstrap account, separate from database users. Its username comes from `LOCAL_ADMIN_USERNAME` or the part of `LOCAL_ADMIN_EMAIL` before `@` when the new setting is absent.

## Add a production line

Sign in as Admin, open **Manage system → Production lines**, and enter a line ID, display name, site, and optional dashboard URL. The line appears in the mobile dashboard and wallboard immediately and is saved in PostgreSQL. Set Node-RED's `line_id` to the registered ID, post to the same API routes, and send the existing shared `API_KEY` in the `x-api-key` header. The line shows offline until Node-RED sends live data. The shared key is kept in `main/server/.env`, never shown in the browser.

Attendance and History remain placeholders in the navigation.
