// app-avatar-patch.js
// lightweight runtime glue for avatar UI
(function () {
  const cfg = (window.ClassroomConfig || {});
  const BASE = cfg.WEB_APP_URL || '';

  // defensive: make sure we have the same container IDs we added in index.html
  const btnId = 'chooseAvatarBtn';
  const panelId = 'avatarPickerPanel';
  const imgId = 'profileAvatar';

  // NEW: use global panel-scoped busy if available, otherwise fall back to legacy profile-busy
  function startProfileBusy(message) {
    if (window.CCPanelBusy) {
      window.CCPanelBusy.show('profile');
      return () => window.CCPanelBusy.hide('profile');
    }
    const card = document.getElementById('profileCard');
    if (!card) return () => {};
    let ov = card.querySelector('.profile-busy');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'profile-busy';
      ov.innerHTML = '<div class="profile-busy-text"></div>';
      card.appendChild(ov);
    }
    const txt = ov.querySelector('.profile-busy-text');
    if (txt) txt.textContent = message || 'Updating…';
    ov.classList.remove('hidden');
    return () => {
      ov.classList.add('hidden');
    };
  }

  function safeAvatarUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url, location.origin);
      return u.href;
    } catch (_) {
      return url;
    }
  }

  function getProfile() {
    return window.__profile || null;
  }

  function getAvatars() {
    // we normalized this in app.js
    return (window.__avatars && Array.isArray(window.__avatars))
      ? window.__avatars
      : (window.__avatars && Array.isArray(window.__avatars.avatars))
        ? window.__avatars.avatars
        : [];
  }

  async function persistAvatar(userId, avatarId) {
    if (!userId || !avatarId) throw new Error('missing_fields');
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        action: 'setavatar',
        userId: userId,
        avatarId: avatarId
      })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Avatar update failed');
    return json;
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
      img.removeAttribute('src');
      img.alt = 'Avatar';
    }
  }

  function renderLeaderboardAvatars() {
    const prof = getProfile();
    if (!prof || !prof.userId) return;
    const rows = document.querySelectorAll('#leaderboard li .lb-row, #leaderboard li div.lb-row');
    rows.forEach(row => {
      if (!row.classList.contains('me')) return;
      const nameEl = row.querySelector('.lb-name');
      const currentImg = row.querySelector('img.avatar-img');
      if (prof.avatarURL) {
        const finalUrl = safeAvatarUrl(prof.avatarURL);
        if (!currentImg) {
          const pic = document.createElement('img');
          pic.className = 'avatar-img sm';
          pic.src = finalUrl;
          pic.alt = prof.displayName || prof.userId || 'Avatar';
          row.insertBefore(pic, nameEl || row.firstChild);
        } else {
          currentImg.src = finalUrl;
        }
      }
    });
  }

  function mount() {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    if (!btn || !panel) return;

    btn.addEventListener('click', async () => {
      const panel = document.getElementById(panelId);

      // toggle behavior — second click hides the panel if open
      if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        return;
      }

      const current = (getProfile() && (getProfile().avatarId || getProfile().avatarID)) || null;

      // if the plugin exists, let it render; otherwise inline-render
      if (window.ClassroomPlugins && window.ClassroomPlugins.avatarPicker) {
        // show panel busy while we open/fetch
        const stop = startProfileBusy('Loading avatars…');
        try {
          const choice = await window.ClassroomPlugins.avatarPicker.open({
            current,
            avatars: getAvatars()
          });
          if (choice && choice.avatarId) {
            const prof = getProfile() || {};
            const stop2 = startProfileBusy('Updating avatar…');
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
            } finally {
              stop2();
            }
          }
        } finally {
          stop();
        }
      } else {
        // fallback: basic inline render
        panel.innerHTML = '';
        const list = getAvatars();
        list.forEach(av => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = av.avatarId;
          b.addEventListener('click', async () => {
            const prof = getProfile() || {};
            const stop = startProfileBusy('Updating avatar…');
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
            } finally {
              stop();
            }
            panel.classList.add('hidden');
          });
          panel.appendChild(b);
        });
        panel.classList.remove('hidden');
      }
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
