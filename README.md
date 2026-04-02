# Kellner Client FE

Frontend for Kellner guest voice and kitchen staff experiences.

## Current Scope

- React + Vite client only (no Node API in this repo)
- Login flow with role selection:
  - User device
  - Kitchen staff
- Guest voice page with WebSocket conversation
- Kitchen dashboard pulling hotel-scoped data

## Run Locally

1. Start backend (FastAPI/Kellner) separately on your API host (default local: `127.0.0.1:8000`).
2. Start frontend:

```bash
npm run dev
```

3. Open `http://localhost:5173`.

## Routing

- `/` -> Login page
- `/guest` -> Guest landing (Face ID or continue without sign-in); requires device login
- `/guest/voice` -> Customer voice session
- `/kitchen` -> Kitchen dashboard

## Environment

Create `client/.env` for local dev if needed.

**VM + nginx (same host for UI and `/api`) — recommended:** do **not** set `VITE_API_BASE_URL` or WS overrides. The built app uses relative `/api/...` and same-origin WebSockets; nginx proxies to uvicorn.

**Optional keys** (only if the UI and API are on different origins):

- `VITE_API_BASE_URL` — FastAPI origin, no trailing slash
- `VITE_WS_BASE_URL` or `VITE_KELLNER_WS_URL` — WebSocket base if not derived from API URL
- `VITE_KELLNER_API_PORT` — local dev only (Vite proxy target, default `8000`)
- `VITE_HOTEL_ID` — optional kitchen fallback

## Deploy on the VM (simple flow)

1. On the VM, create a directory and clone this repo (or only `client/` if you keep FE in a separate repo), e.g. `~/kellner-FE`.
2. Point nginx `root` at `client/dist` and proxy `/api/` and `/api/ws/` to `127.0.0.1:8000` (see your backend team’s nginx snippet).
3. After each frontend change: `git pull`, then from `client/`: `npm ci && npm run build`, then reload nginx if needed.
4. No Azure or special build env required when UI and API share one hostname.

### First-time setup on the VM (example)

Replace user/host/paths with yours. Requires Node 20+ on the VM.

```bash
mkdir -p ~/kellner-FE && cd ~/kellner-FE
git clone https://github.com/yasharthpaliwal-99/kellner-FE.git .
cd client
npm ci
npm run build
sudo mkdir -p /var/www/kellner
sudo cp -r dist/* /var/www/kellner/
# Configure nginx root=/var/www/kellner and proxy /api/ → 127.0.0.1:8000, then:
sudo nginx -t && sudo systemctl reload nginx
```

### Update after a push to GitHub

```bash
cd ~/kellner-FE && git pull
cd client && npm ci && npm run build
sudo cp -r dist/* /var/www/kellner/
sudo systemctl reload nginx
```

## API Contracts Used

- `POST /api/face/local/recognise` — `multipart/form-data` field `image`; header `x-device-session`; returns `customer_id` (used on WebSocket as `customer_id` query param when set)
- `POST /api/device/login`
  - Role `device`: requires `hotel_id`, `password`, `table_number`, `device_id`
  - Role `kitchen`: requires `hotel_id`, `password`, `device_id`
  - Saves returned `session_id` in local storage
- `GET /api/kitchen?hotel_id=<id>[&date=YYYY-MM-DD]`
- `PATCH /api/orders/:id/status`
- `WS /api/ws/conversation?session_id=<SESSION_ID>`

## Session/Data Notes

- Login response is stored in local storage via `authSession` helpers.
- Kitchen hotel resolution priority:
  1. Logged-in session `hotel_id`
  2. URL query `hotel_id`
  3. `VITE_HOTEL_ID` fallback

## Repo Hygiene

- Removed legacy Node server artifacts from this repo.
- Root scripts delegate to client scripts.
