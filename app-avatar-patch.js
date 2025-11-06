// app-avatar-patch.js
// Avatar UI glue with lazy avatar loading (fetch only when first needed)
// Uses panel-scoped busy overlay if available (CCPanelBusy)

(function () {
  const cfg  = (window.ClassroomConfig || {});
  const BASE = cfg.WEB_APP_URL || '';

  const BTN_ID   = 'chooseAvatarBtn';
  const PANEL_ID = 'avatarPickerPanel';
  const IMG_ID   = 'profileAvatar';

  // --- busy helper: ONLY for real network work, not for just opening UI ---
  function startProfileBusy(message) {
    // prefer new panel-scoped busy
    if (window.CCPanelBusy) {
      window.CCPanelBusy.show('profile');
      return () => window.CCPanelBusy.hide('profile');
    }
    // fallback to legacy inline overlay
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

  // return current in-memory avatar list (may be empty if never fetched)
  function getAvatarsFromMemory() {
    if (Array.isArray(window.__avatars)) {
      return window.__avatars;
    }
    if (window.__avatars && Array.isArray(window.__avatars.avatars)) {
      return window.__avatars.avatars;
    }
    return [];
  }

  // lazy fetch: only call backend if we don't already have avatars in memory
  async function ensureAvatarsLoaded() {
    // option 2: use cached avatars if present; only fetch once per session
    const current = getAvatarsFromMemory();
    if (current && current.length) {
      return current;
    }
    if (!BASE) {
      console.warn('No WEB_APP_URL, cannot load avatars');
      return [];
    }

    const stop = startProfileBusy('Loading avatars…');
    try {
      const res = await fetch(BASE + '?' + new URLSearchParams({ action: 'getavatars' }), {
        method: 'GET'
      });
      const json = await res.json();
      const list = json.avatars || json.list || json || [];
      // cache in global so future opens are instant
      window.__avatars = Array.isArray(list) ? list : [];
      return window.__avatars;
    } catch (e) {
      console.warn('Failed to load avatars on demand', e);
      return [];
    } finally {
      stop();
    }
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
    const img = document.getElementById(IMG_ID);
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
    const btn = document.getElementById(BTN_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const pickerPanel = document.getElementById(PANEL_ID);

      // toggle off if already visible
      if (pickerPanel && !pickerPanel.classList.contains('hidden')) {
        pickerPanel.classList.add('hidden');
        return;
      }

      // at this moment, we may or may not have avatars → ensure them
      const avatars = await ensureAvatarsLoaded();

      const current = (getProfile() && (getProfile().avatarId || getProfile().avatarID)) || null;

      // if plugin exists, let it build the UI
      if (window.ClassroomPlugins && window.ClassroomPlugins.avatarPicker) {
        const choice = await window.ClassroomPlugins.avatarPicker.open({
          current,
          avatars
        });

        // user canceled
        if (!choice || !choice.avatarId) return;

        // now do network (show busy)
        const prof = getProfile() || {};
        const stop = startProfileBusy('Updating avatar…');
        try {
          await persistAvatar(prof.userId, choice.avatarId);
          // update globals
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
          stop();
        }
      } else {
        // fallback inline picker
        if (!panel) return;
        panel.innerHTML = '';
        avatars.forEach(av => {
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
