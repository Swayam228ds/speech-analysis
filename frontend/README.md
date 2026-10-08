# Speech Coach — web frontend

Plain HTML/CSS/JavaScript with no build step and no npm packages. FastAPI serves it from this folder (see `app/main.py`), so it runs on the same address as the API:

```bash
uvicorn app.main:app --reload
```

Then open http://localhost:8000. Remember to run `python worker.py` too, so uploads get processed.

- **Demo mode:** click **Explore with demo data** on the sign-in page to try every screen with simulated data. No database or worker is needed. `js/mock.js` returns the same response shapes as the real routers.
- **Different backend address:** the frontend calls the server it was loaded from. To point it elsewhere (for example, opening `index.html` straight from disk), use the **Backend** row at the bottom of the sign-in page.

## How it maps to the API

| Screen | Endpoints |
|---|---|
| Sign in / register | `POST /login` (form data), `POST /register` (JSON), `GET /me` |
| Dashboard | `GET /videos`, `DELETE /videos/{id}` |
| Upload | `POST /videos/upload` (multipart field `file`; mp4, webm or mov up to 100 MB) |
| Video details | `GET /videos/{id}`: polled every 2.5 s until `job_info.status` is `completed` or `failed` |
| | `GET /videos/{id}/analysis` (visual metrics + all events) and `GET /videos/{id}/events` |
| | `GET /videos/{id}/file`: downloaded with the Bearer token and played from a blob URL |

`js/normalize.js` converts API responses into the shapes the views use. If you rename a column or response key in the backend, update it there.

## Files

```
index.html
css/styles.css          light + dark theme, responsive
js/config.js            API URL, upload limits/formats, polling interval
js/api.js               fetch client (adds the Bearer header), XHR upload with progress
js/auth.js              JWT storage + /me check on load
js/normalize.js         maps API responses into view models
js/mock.js              demo-mode backend
js/views/auth.js        sign in / create account
js/views/dashboard.js   video grid, stats, delete, auto-refresh
js/views/upload.js      drag-and-drop, validation, progress, redirect
js/views/details.js     polling, player, event timeline, metrics, synced transcript
js/app.js               shell + hash router
```
