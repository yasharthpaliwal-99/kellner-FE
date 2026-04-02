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

The UI does **not** include the API. Vite proxies `/api/*` to **`http://127.0.0.1:8000`** by default. If nothing listens there, you will see **`ECONNREFUSED 127.0.0.1:8000`** and **`[vite] http proxy error`** for `/api/device/login` etc.

### Steps (order matters)

1. **Start the FastAPI backend** on the same machine (from your Kellner backend repo), for example:

   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Check the API is up** (optional):

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/health
   ```

   You should get `200` (or whatever your app returns for `/health`), not a connection error.

3. **Start the frontend** from this repo root:

   ```bash
   npm run dev
   ```

4. Open the URL Vite prints (often `http://localhost:5173`; another port if 5173 is busy).

### After `git pull` — common mistake

- Pulling this repo **does not** start the backend. Each developer must run **uvicorn** (or their backend) **before** `npm run dev`.
- If `client/.env` sets **`VITE_API_BASE_URL`** to a **remote** server, local `npm run dev` will call that host for API URLs **unless** you override for local testing. To use the Vite proxy to **localhost:8000**, add **`client/.env.local`** with:

  ```env
  VITE_API_BASE_URL=
  ```

  (Empty value = same-origin `/api` → proxied to `127.0.0.1:8000`.)

### Troubleshooting

| Symptom | Cause |
|--------|--------|
| `ECONNREFUSED 127.0.0.1:8000` | Backend not running, or wrong port. Start uvicorn on **8000** or set `VITE_KELLNER_API_PORT` in `client/.env` to match your port. |
| Proxy error on `/api/...` | Same as above — fix backend first. |
| Calls go to wrong host | Check `VITE_API_BASE_URL` in `client/.env`; use `.env.local` to override locally. |

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
