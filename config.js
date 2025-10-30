// config.js
// Set your deployed Google Apps Script Web App URL here.
// This file persists across app.js updates.
window.ClassroomConfig = {
  WEB_APP_URL: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYED_ID/exec',
  // If true, PIN is stored only for the current browser session (safer default).
  // If false, and the user checks "Remember PIN", the PIN will persist in localStorage.
  USE_SESSION_ONLY: true
};
