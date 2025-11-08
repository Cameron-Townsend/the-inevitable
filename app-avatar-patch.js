// app-avatar-patch.js
// Avatar UI glue — instant-open picker, lazy background refresh,
// panel-busy only on SAVE, plus safer rendering for empty/missing avatars.

(function () {
  const cfg  = (window.ClassroomConfig || {});
  const BASE = cfg.WEB_APP_URL || '';

  const BTN_ID        = 'chooseAvatarBtn';
  const PANEL_ID      = 'avatarPickerPanel';
  const IMG_ID        = 'profileAvatar';
  const AV_CACHE_KEY  = 'cc.avatars';
  const AV_CACHE_TTL  = 24 * 60 * 60 * 1000; // 24h

  // --- busy helper: ONLY for real network work (saving), not for opening the picker ---
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

  // ---- avatar cache helpers ----
  function getAvatarsFromMemory() {
    if (Array.isArray(window.__avatars)) {
      return window.__avatars;
    }
    if (window.__avatars && Array.isArray(window.__avatars.avatars)) {
      return window.__avatars.avatars;
    }
    return [];
  }

  function getAvatarsFromLocalStorage() {
    try {
      const raw = localStorage.getItem(AV_CACHE_KEY);
      if (!raw) return { avatars: [], ts: 0 };
      const parsed = JSON.parse(raw);
      return {
        avatars: Array.isArray(parsed.avatars) ? parsed.avatars : [],
        ts: parsed.ts || 0
      };
    } catch (e) {
      return { avatars: [], ts: 0 };
    }
  }

  function saveAvatarsToLocalStorage(list) {
    try {
      localStorage.setItem(AV_CACHE_KEY, JSON.stringify({ avatars: list, ts: Date.now() }));
    } catch (e) {
      // ignore
    }
  }

  function setGlobalAvatars(list) {
    window.__avatars = Array.isArray(list) ? list : [];
  }

  /**
   * Try to hydrate the current profile's avatarURL from whatever avatar list we already have.
   * This helps the "new account, no avatarURL yet" case.
   */
  function resolveCurrentAvatarURLFromCaches() {
    const prof = getProfile();
    if (!prof || !prof.avatarId || prof.avatarURL) return;

    // look in memory first
    const mem = getAvatarsFromMemory();
    let hit = mem.find(a => a.avatarId === prof.avatarId);
    if (!hit || !hit.avatarURL) {
      // try localStorage cache
      const ls = getAvatarsFromLocalStorage();
      hit = (ls.avatars || []).find(a => a.avatarId === prof.avatarId);
    }
    if (hit && hit.avatarURL) {
      prof.avatarURL = hit.avatarURL;
      window.__profile = prof;
    }
  }

  // background refresh — NO panel busy, purely silent
  async function refreshAvatarsInBackground() {
    if (!BASE) return;
    try {
      const res = await fetch(BASE + '?' + new URLSearchParams({ action: 'getavatars' }), {
        method: 'GET'
      });
      const json = await res.json();
      const list = json.avatars || json.list || json || [];
      const clean = Array.isArray(list) ? list : [];
      setGlobalAvatars(clean);
      saveAvatarsToLocalStorage(clean);

      // Try to hydrate current profile's avatarURL now that we have fresh data
      const prof = getProfile();
      if (prof && prof.avatarId && !prof.avatarURL) {
        const match = clean.find(a => a.avatarId === prof.avatarId);
        if (match && match.avatarURL) {
          prof.avatarURL = match.avatarURL;
          window.__profile = prof;
          renderProfileAvatar();
          renderLeaderboardAvatars();
        }
      }

      // if the panel is open right now, re-render with the fresh list
      const panel = document.getElementById(PANEL_ID);
      if (panel && !panel.classList.contains('hidden')) {
        renderAvatarGrid(panel, clean, getCurrentAvatarId());
      }
    } catch (e) {
      // stay silent
    }
  }

  function getCurrentAvatarId() {
    const prof = getProfile();
    return (prof && (prof.avatarId || prof.avatarID)) || null;
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

    // try to hydrate from cached avatar lists first
    resolveCurrentAvatarURLFromCaches();

    const url = safeAvatarUrl(prof && (prof.avatarURL || prof.avatarUrl));
    if (url) {
      img.src = url;
      img.alt = prof.displayName || prof.userId || 'Avatar';
    } else {
      // don't show broken image
      img.removeAttribute('src');
      img.alt = 'Avatar';
    }
  }

  function renderLeaderboardAvatars() {
    const prof = getProfile();
    if (!prof || !prof.userId) return;
    if (prof.avatarId && !prof.avatarURL) {
      // try to hydrate if we can
      resolveCurrentAvatarURLFromCaches();
    }
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

  // render the picker panel with a given list
  function renderAvatarGrid(panel, avatars, currentId) {
    panel.innerHTML = '';
    panel.classList.remove('hidden');

    // filter out bad entries that cause layout gaps
    const usable = (avatars || []).filter(av => av && av.avatarId && av.avatarURL);

    if (!usable.length) {
      const msg = document.createElement('div');
      msg.className = 'avatar-empty';
      msg.textContent = 'Loading avatars…';
      panel.appendChild(msg);
      return;
    }

    usable.forEach(av => {
      const tile = document.createElement('div');
      tile.className = 'avatar-tile';
      if (currentId && av.avatarId === currentId) {
        tile.classList.add('selected');
      }
      const img = document.createElement('img');
      img.src = safeAvatarUrl(av.avatarURL);
      img.alt = av.avatarId || 'Avatar';
      tile.appendChild(img);
      tile.addEventListener('click', async () => {
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
      panel.appendChild(tile);
    });
  }

  function mount() {
    const btn = document.getElementById(BTN_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!btn) return;

    btn.addEventListener('click', () => {
      const pickerPanel = document.getElementById(PANEL_ID) || panel;

      // toggle off if already visible
      if (pickerPanel && !pickerPanel.classList.contains('hidden')) {
        pickerPanel.classList.add('hidden');
        return;
      }

      // 1) open INSTANTLY with whatever we have
      const memAvatars = getAvatarsFromMemory();
      const lsAv = getAvatarsFromLocalStorage();
      const now = Date.now();
      const haveRecentLS = lsAv.avatars.length && (now - lsAv.ts) < AV_CACHE_TTL;

      let initial = [];
      if (memAvatars.length) {
        initial = memAvatars;
      } else if (haveRecentLS) {
        initial = lsAv.avatars;
        // populate globals so other parts can read it
        setGlobalAvatars(initial);
      }

      const p = pickerPanel || (() => {
        const temp = document.createElement('div');
        temp.id = PANEL_ID;
        temp.className = 'avatar-picker';
        document.body.appendChild(temp);
        return temp;
      })();

      renderAvatarGrid(p, initial, getCurrentAvatarId());

      // 2) kick off a background refresh if we had nothing or the cache is old
      if (!initial.length || !haveRecentLS) {
        refreshAvatarsInBackground();
      }

      // 3) plugin path — still instant, still no busy
      if (window.ClassroomPlugins && window.ClassroomPlugins.avatarPicker) {
        window.ClassroomPlugins.avatarPicker.open({
          current: getCurrentAvatarId(),
          avatars: initial
        }).then(choice => {
          if (!choice || !choice.avatarId) return;
          const prof = getProfile() || {};
          const stop = startProfileBusy('Updating avatar…');
          (async () => {
            try {
              await persistAvatar(prof.userId, choice.avatarId);
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
          })();
        });
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

    // also try to render once on load in case profile was already set
    renderProfileAvatar();
  });
})();
