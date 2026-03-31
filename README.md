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

- `VITE_KELLNER_API_PORT` (optional, default `8000`)
- `VITE_KELLNER_WS_URL` (optional override for direct WS URL)
- `VITE_HOTEL_ID` (optional fallback; kitchen now prefers logged-in session hotel)

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
