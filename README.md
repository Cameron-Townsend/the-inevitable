# Classroom Challenge — v19.2.1

Stable build with:
- Promise-based `precacheFor` (no async/await parse issues)
- Guarded `hydrateDashFromCache` (runs after functions exist)
- Emoji leaderboard with 🥇/🥈/🥉 and 🪙 coin, plus avatar chips
- Avatar Picker plugin with preload + fallback

## Deploy
1. Update `config.js` → `WEB_APP_URL` to your Apps Script deployment.
2. Upload all files to GitHub Pages repo.
3. Commit & push. Use an Incognito window or hard refresh to load cache-busted assets (`?v=v1921`).
