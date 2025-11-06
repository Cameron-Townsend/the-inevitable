// app-avatar-patch.js
// lightweight runtime glue for avatar UI
(function () {
  const cfg = (window.ClassroomConfig || {});
  const BASE = cfg.WEB_APP_URL || '';

  // defensive: make sure we have the same container IDs we added in index.html
  const btnId = 'chooseAvatarBtn';
  const panelId = 'avatarPickerPanel';
  const imgId = 'profileAvatar';

  function safeAvatarUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.origin);
      // force https if possible
      if (u.protocol === 'http:') u.protocol = 'https:';
      return u.toString();
    } catch (e) {
      return null;
    }
  }

  function getProfile() {
    return window.__profile || null;
  }
  function getAvatars() {
    // we normalized this in app.js
    return (window.__avatars && Array.isArray(window.__avatars))
      ? window.__avatars
      : (Array.isArray(window.__avatars?.avatars) ? window.__avatars.avatars : []);
  }

  function renderProfileAvatar() {
    const prof = getProfile();
    const img = document.getElementById(imgId);
    if (!img) return;
    const url = safeAvatarUrl(prof && (prof.avatarURL || prof.avatarUrl));
    if (url) {
      img.src = url;
      img.alt = prof.displayName || prof.userId || 'Avatar';
    } else {
      // fallback: emoji-style circle
      img.removeAttribute('src');
      img.alt = 'Avatar';
    }
  }

  // update leaderboard with tiny avatar next to each name, if profile data includes avatar
  function renderLeaderboardAvatars() {
  const prof = getProfile();
  if (!prof) return;
  const lb = document.getElementById('leaderboard');
  if (!lb) return;

  // find the <li> that belongs to this user and only update that one
  const items = lb.querySelectorAll('li');
  items.forEach(li => {
    const text = li.textContent || '';
    // try to match either displayName or userId
    if (prof.displayName && text.includes(prof.displayName)) {
      // only update this one
      const url = safeAvatarUrl(prof.avatarURL || prof.avatarUrl);
      if (!url) return;
      // if there's already an img.sm in here, update it
      const existing = li.querySelector('img.avatar-img.sm');
      if (existing) {
        existing.src = url;
      } else {
        const img = document.createElement('img');
        img.className = 'avatar-img sm';
        img.src = url;
        img.alt = 'Avatar';
        li.insertBefore(img, li.firstChild);
      }
    }
  });
}

  async function persistAvatar(userId, avatarId) {
    if (!BASE || !userId || !avatarId) return;
    // we used x-www-form-urlencoded in app.js
    const body = new URLSearchParams({
      action: 'setavatar',
      userId: userId,
      avatarId: avatarId
    });
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json && json.ok === false)) {
      throw new Error(json.error || 'setavatar failed');
    }
    return json;
  }

  function mount() {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;

    btn.addEventListener('click', async () => {
      // lazy-fill panel from plugin
      const current = (getProfile() && (getProfile().avatarId || getProfile().avatarID)) || null;

      // if the plugin exists, let it render; otherwise inline-render
      if (window.ClassroomPlugins && window.ClassroomPlugins.avatarPicker) {
        const choice = await window.ClassroomPlugins.avatarPicker.open({
          current,
          avatars: getAvatars()
        });
        if (choice && choice.avatarId) {
          const prof = getProfile() || {};
          try {
            await persistAvatar(prof.userId, choice.avatarId);
            // update global profile so app.js and other code see it
            window.__profile = Object.assign({}, prof, {
              avatarId: choice.avatarId,
              avatarURL: choice.avatarURL
            });
            renderProfileAvatar();
            renderLeaderboardAvatars();
            if (window.showToast) window.showToast('Avatar updated ✅');
          } catch (e) {
            if (window.showToast) window.showToast('Could not update avatar ❌');
          }
        }
      } else {
        // fallback: basic inline render
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
          renderInlinePicker(panel);
        }
      }
    });

    // initial render in case profile was present on load
    renderProfileAvatar();
  }

  function renderInlinePicker(panel) {
    const list = getAvatars();
    panel.innerHTML = '';
    list.forEach(av => {
      const tile = document.createElement('div');
      tile.className = 'avatar-tile';
      const img = document.createElement('img');
      img.src = safeAvatarUrl(av.avatarURL) || '';
      img.alt = av.avatarId || 'Avatar';
      tile.appendChild(img);
      tile.addEventListener('click', async () => {
        const prof = getProfile() || {};
        try {
          await persistAvatar(prof.userId, av.avatarId);
          window.__profile = Object.assign({}, prof, {
            avatarId: av.avatarId,
            avatarURL: av.avatarURL
          });
          renderProfileAvatar();
          renderLeaderboardAvatars();
          if (window.showToast) window.showToast('Avatar updated ✅');
        } catch (e) {
          if (window.showToast) window.showToast('Could not update avatar ❌');
        }
      });
      panel.appendChild(tile);
    });
  }

  // re-render avatars whenever dashboard mutates
  const obs = new MutationObserver(() => {
    renderProfileAvatar();
  });

  window.addEventListener('DOMContentLoaded', () => {
    mount();
    const dash = document.getElementById('dashboard') || document.body;
    obs.observe(dash, { childList: true, subtree: true });
  });
})();
