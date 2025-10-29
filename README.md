# Classroom Challenges — Deployable Package

This bundle contains a ready-to-deploy **frontend (GitHub Pages)** and **backend (Apps Script)** for your classroom challenge system with simple login/register, activities, instant client-side grading, and a leaderboard.

## Files
- `index.html` — Landing page with login/register, Activities (shown after login), and Leaderboard
- `style.css` — Light/Dark theme; flat, modern styles (no glow)
- `config.js` — Put your Apps Script Web App `/exec` URL here
- `app.js` — All frontend logic with caching, busy overlays, and client-side pregrading
- `backend/code.gs` — Full Apps Script backend to paste into your project

## 1) Backend Setup (Apps Script)
1. Create/choose a Google Sheet. Copy its **Sheet ID** (long string in the URL).
2. In **Apps Script**, create a new project and paste the **contents of `backend/code.gs`**.
3. Set `SPREADSHEET_ID` at the top of `code.gs`.
4. **Deploy → New deployment → Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL (ends with `/exec`).

### (Optional) Script property for salt
- In **Project Settings → Script properties**, add `ANSWER_SALT` with any random string. If omitted, the script auto-generates one.

## 2) Frontend Setup (GitHub Pages)
1. Put `index.html`, `style.css`, `config.js`, `app.js` in your repo.
2. Edit `config.js` and set `API` to your Web App `/exec` URL.
3. Commit & push. Enable **GitHub Pages** on the repo (Settings → Pages).

## 3) Sheets Structure
The backend will **auto-create** these tabs and headers if missing:

- **Users**: `userId, displayName, pinHash, createdAt`
- **Activities**: `activityId, title, prompt, expectedAnswer, points, openIso, closeIso`
- **Submissions**: `timestamp, userId, activityId, answer, correct, pointsAwarded`
- **Ledger**: `timestamp, userId, amount, reason, activityId`

Add some starter activities in the **Activities** sheet (leave `openIso/closeIso` blank initially or use ISO datetimes).

## 4) Caching & Performance
- **Pre-caches** activities for faster initial load.
- Uses **URL-encoded POST** to avoid CORS preflights for critical endpoints.
- Instant **client-side pre-grading** via salted hashes from `getgradingmap`.
- **Busy overlays** on tiles and a subtle spinner on **Refresh**.

## 5) Common Gotchas
- After any Apps Script change: **Deploy → Manage deployments → Edit → Deploy** again.
- If frontend changes don’t show: bump versions (e.g., `app.js?v=2`) and hard refresh (Ctrl/Cmd+Shift+R).
- If “Network error” on login step: confirm Web App “Who has access” = **Anyone**, and test:
  - `.../exec?action=ping`
  - `.../exec?action=checkuser&userId=test`
  - `.../exec?action=getactivities`

## 6) Privacy & Security
- PINs are stored as **SHA‑256 hashes** in the Sheet.
- Answers are hidden client-side via salted hash comparison (obfuscation, not real security).
- No sensitive PII is stored beyond userId/displayName.

Enjoy, and ping me if you want a **storefront**, **achievements**, or **profile** tab added later!
