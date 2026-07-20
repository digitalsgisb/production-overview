# Production Overview

Live production dashboard with:

- React/Vite frontend in `main/depan`
- Node.js backend in `main/server`
- Raspberry Pi setup and update script in `scripts/setup-pi.sh`

Production lines send data to the backend through HTTP. The backend saves the
data to PostgreSQL and sends successful updates to the React dashboard through
WebSocket.

## Daily update workflow: PC to GitHub to Raspberry Pi

Use these steps whenever a change is ready to deploy.

### 1. Push the change from the development PC

Open PowerShell and enter the repository folder:

```powershell
cd "C:\Users\haffizol\Desktop\Code\Production overview (adam)\production-overview"
```

Review the changed files before committing:

```powershell
git status
git diff
```

Stage the changes and check the list again:

```powershell
git add -A
git status
```

Do not continue if `.env`, passwords, API keys, or database credentials appear
in the staged file list.

Commit and push to the `main` branch:

```powershell
git commit -m "Describe what was changed"
git push origin main
```

Example:

```powershell
git commit -m "Improve mobile production dashboard"
git push origin main
```

If GitHub asks you to sign in, use the browser sign-in or a GitHub personal
access token. A normal GitHub account password does not work for Git pushes.

### 2. Pull and deploy the update on the Raspberry Pi

Connect to the Pi:

```bash
ssh <pi-user>@<pi-ip>
```

Example:

```bash
ssh pi@192.168.1.50
```

Run the project update script:

```bash
cd ~/production-overview
bash scripts/setup-pi.sh
```

For an existing installation, this script will:

1. Pull the newest code from GitHub with `git pull --ff-only`.
2. Keep the existing `main/server/.env` file.
3. Install the backend and frontend dependencies.
4. Build the frontend.
5. Restart the backend and frontend services.

When it finishes, open:

```text
http://<pi-ip>:5173
```

If the phone still shows the old version, close and reopen the installed app or
refresh the browser. The dashboard is a PWA and may briefly keep a cached copy.

## Short copy-and-paste version

On the development PC, from the repository folder:

```powershell
git status
git add -A
git status
git commit -m "Describe what was changed"
git push origin main
```

On the Raspberry Pi:

```bash
cd ~/production-overview
bash scripts/setup-pi.sh
```

## First-time Raspberry Pi installation

Run this once from a clean Raspberry Pi terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/digitalsgisb/production-overview/main/scripts/setup-pi.sh)"
```

The installer will clone the repository to `~/production-overview`, install
Git and Node.js when needed, ask for the environment settings, install the
dependencies, build the frontend, and start both services.

Important environment values are stored in `main/server/.env` on the Pi:

- `API_KEY` must match the `x-api-key` value used by Node-RED.
- `FRONTEND_ORIGINS` must include `http://<pi-ip>:5173`.
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_DB`, and `DB_PORT` configure PostgreSQL.
- `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` configure the local login.

Never commit `main/server/.env` to GitHub.

## Check the Raspberry Pi services

Check whether both services are running:

```bash
sudo systemctl status production-overview-backend production-overview-frontend
```

Restart them manually:

```bash
sudo systemctl restart production-overview-backend production-overview-frontend
```

Show recent backend logs:

```bash
sudo journalctl -u production-overview-backend -n 100 --no-pager
```

Show recent frontend logs:

```bash
sudo journalctl -u production-overview-frontend -n 100 --no-pager
```

Follow live logs and stop with `Ctrl+C`:

```bash
sudo journalctl -u production-overview-backend -f
```

## Manual Raspberry Pi update

Use this only if `scripts/setup-pi.sh` cannot be used:

```bash
cd ~/production-overview
git pull --ff-only origin main
npm ci --prefix main/server
npm ci --prefix main/depan
npm run build --prefix main/depan
sudo systemctl restart production-overview-backend production-overview-frontend
sudo systemctl status production-overview-backend production-overview-frontend
```

## Common Git problems

### Push rejected because GitHub has newer changes

On the development PC:

```powershell
git pull --rebase origin main
git push origin main
```

If Git reports a conflict, do not force-push. Resolve the named files, stage
them with `git add`, then continue with:

```powershell
git rebase --continue
git push origin main
```

### Raspberry Pi has local changes and cannot pull

Check what changed:

```bash
cd ~/production-overview
git status
git diff
```

Do not delete or overwrite the changes until you know why they are there. The
Pi should normally keep configuration in `.env`, which Git ignores, rather
than editing tracked source files.

### Confirm the Pi received the latest commit

Run this on both the PC and the Pi:

```bash
git log -1 --oneline
```

The commit ID and message should match.

## Project notes

To add or remove production lines, edit `main/depan/src/pages/dashboard.jsx`.
The `PORT_KLANG_LINES` and `SENDAYAN_LINES` arrays control which lines appear:

```js
const PORT_KLANG_LINES = ["ABB4", "ABB7", "ABB2"];
const SENDAYAN_LINES = ["SDY1", "SDY2"];
```

For ports, Node-RED endpoints, API keys, and database deployment details, see
`DEPLOYMENT.md`.
