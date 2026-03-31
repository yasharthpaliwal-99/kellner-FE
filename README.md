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
- `/guest` -> Customer voice page
- `/kitchen` -> Kitchen dashboard

## Environment

Create `client/.env` as needed.

Important keys:

- **`VITE_API_BASE_URL`** — Base URL of the FastAPI server **without** a trailing slash (for example `http://74.249.2.119` or `https://api.example.com`). Required for **production static hosting** (Azure Static Web Apps, Netlify, S3, etc.): the dev-only Vite proxy does not run there, so relative `/api/...` calls would hit the static host and fail (often `405` or `404`). Set this in your CI/build pipeline so the bundled app calls your real API.
- `VITE_KELLNER_API_PORT` (optional, default `8000`; used with local proxy when `VITE_API_BASE_URL` is unset)
- `VITE_KELLNER_WS_URL` (optional override for WebSocket URL; if unset, derived from `VITE_API_BASE_URL` in production)
- `VITE_HOTEL_ID` (optional fallback; kitchen now prefers logged-in session hotel)

### HTTPS site + HTTP API

If the frontend is served over **HTTPS** (typical on Azure) and `VITE_API_BASE_URL` is **http://…**, browsers block mixed content. Use an HTTPS API URL, or terminate TLS in front of your API (or put the API behind the same domain via a reverse proxy).

### Azure Static Web Apps

1. In **Application settings** (or your GitHub Actions workflow that runs `npm run build`), set `VITE_API_BASE_URL` to your Kellner API origin.
2. Rebuild and redeploy so Vite inlines the value at build time.
3. Ensure FastAPI allows **CORS** for your static app origin (`https://….azurestaticapps.net`).

## API Contracts Used

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
