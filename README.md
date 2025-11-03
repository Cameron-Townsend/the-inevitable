# Classroom Challenge — Instant-Feel Frontend (Compat with your Apps Script)

This is the GitHub Pages frontend tailored to your existing backend. It features:
- Two-step login (ID → PIN) that precaches activities/leaderboard/grading map.
- Client pre-grading via salted SHA-256 hashes (`getgradingmap`).
- Optimistic UI for instant feedback with server reconciliation.
- Optional service worker for fast reloads.
- External `config.js` so your Web App URL persists across `app.js` updates.

## Quick Start
1. Set your URL in `config.js`:
   ```js
   window.ClassroomConfig = {
     WEB_APP_URL: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYED_ID/exec',
     USE_SESSION_ONLY: true
   };
   ```
2. Deploy these files to GitHub Pages.
3. Visit the site → enter ID → enter PIN → enjoy the instant flow.

## Files
- `index.html` — layout and script loading (config.js before app.js)
- `style.css` — responsive styling
- `config.js` — persistent Web App URL + PIN storage mode
- `app.js` — logic, precache, client pre-grading, optimistic UI
- `sw.js` — caches static assets (no API caching)
- `README.md` — this file

## Notes
- The frontend uses your Sheets tabs: Users, Activities, Submissions, Ledger.
- All protected calls send `{ userId, pin }` per your backend (no tokens).
- `USE_SESSION_ONLY: true` keeps PIN ephemeral by default; users can still choose to persist PIN if you set it to `false` and they check “Remember PIN.”
