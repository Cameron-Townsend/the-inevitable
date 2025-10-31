(function(){
  'use strict';

  // --- Utilities ---
  function safeAvatar(url){
    try{
      if(!url || typeof url !== 'string') return null;
      const u = new URL(url, location.origin);
      if(u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      // Force https to avoid mixed content
      if(u.protocol === 'http:') { u.protocol = 'https:'; }
      // Basic path sanitization (no javascript:, data:, blob:)
      const bad = ['javascript:', 'data:', 'blob:'];
      if(bad.some(p => url.trim().toLowerCase().startsWith(p))) return null;
      // cache-bust when user changes avatars
      u.searchParams.set('_ts', String(Date.now()));
      return u.toString();
    }catch(e){
      return null;
    }
  }

  function initials(name){
    if(!name) return '?';
    const parts = String(name).trim().split(/\s+/).slice(0,2);
    return parts.map(s => s[0]?.toUpperCase()||'').join('') || '?';
  }

  function makeAvatarImg(url, alt, sizeClass){
    const img = document.createElement('img');
    img.className = 'avatar-img' + (sizeClass ? ' ' + sizeClass : '');
    img.alt = alt || 'avatar';
    if(url){
      img.referrerPolicy = 'no-referrer';
      img.crossOrigin = 'anonymous';
      img.loading = 'lazy';
      img.src = url;
      img.onerror = function(){
        // swap to fallback
        const fallback = document.createElement('div');
        fallback.className = 'avatar-fallback' + (sizeClass ? ' ' + sizeClass : '');
        fallback.textContent = initials(alt);
        img.replaceWith(fallback);
      };
    }else{
      const fallback = document.createElement('div');
      fallback.className = 'avatar-fallback' + (sizeClass ? ' ' + sizeClass : '');
      fallback.textContent = initials(alt);
      return fallback;
    }
    return img;
  }

  // --- Backend calls ---
  async function api(path, opts){
    const base = (window.ClassroomConfig && window.ClassroomConfig.WEB_APP_URL) || '';
    const url = base + (base.includes('?') ? '&' : '?') + 'fn=' + encodeURIComponent(path) + '&_ts=' + Date.now();
    const res = await fetch(url, Object.assign({ method:'GET' }, opts || {}));
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function getAvatars(){
    try{
      // Support either {avatars:[{avatarId,avatarURL}]} or direct array
      const data = await api('getavatars');
      return Array.isArray(data) ? data : (data.avatars || []);
    }catch(e){
      console.error('getavatars failed', e);
      return [];
    }
  }

  async function setAvatar(avatarId){
    try{
      const base = (window.ClassroomConfig && window.ClassroomConfig.WEB_APP_URL) || '';
      const url = base + (base.includes('?') ? '&' : '?') + 'fn=setavatar&_ts=' + Date.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId })
      });
      const json = await res.json();
      if(!res.ok || (json && json.error)){
        throw new Error(json && json.error || ('HTTP ' + res.status));
      }
      return json;
    }catch(e){
      console.error('setavatar failed', e);
      throw e;
    }
  }

  // --- DOM hooks (non-invasive) ---
  function patchProfile(){
    const nameEl = document.getElementById('displayName');
    if(!nameEl) return;
    const avatarEl = document.getElementById('profileAvatar');
    if(!avatarEl) return;

    // Expect that core app sets window.__profile with {displayName, avatarURL}
    const prof = window.__profile || {};
    const url = safeAvatar(prof.avatarURL);
    const replacement = makeAvatarImg(url, prof.displayName || 'User', '');
    avatarEl.replaceWith(replacement);
    replacement.id = 'profileAvatar';
  }

  function patchLeaderboard(){
    const lb = document.getElementById('leaderboard');
    if(!lb) return;
    // attach avatars to any row missing an avatar
    lb.querySelectorAll('.row').forEach(row => {
      if(row.querySelector('.avatar-img, .avatar-fallback')) return;
      const nameEl = row.querySelector('.name');
      const data = row.dataset || {};
      const display = (nameEl && nameEl.textContent) || data.displayName || 'User';
      const url = safeAvatar(data.avatarUrl || data.avatarURL || '');
      const img = makeAvatarImg(url, display, 'sm');
      row.insertBefore(img, row.firstChild);
    });
  }

  // Observe dashboard renders and attach avatars
  const obs = new MutationObserver(() => {
    patchProfile();
    patchLeaderboard();
  });
  window.addEventListener('load', () => {
    const dash = document.getElementById('dashboard') || document.body;
    obs.observe(dash, { subtree: true, childList: true });
    patchProfile();
    patchLeaderboard();
  });

  // --- Avatar Picker wiring ---
  function ensurePicker(){
    const btn = document.getElementById('openAvatarPicker');
    if(!btn) return;
    btn.addEventListener('click', async () => {
      if(window.ClassroomPlugins && window.ClassroomPlugins.avatarPicker){
        const current = (window.__profile && window.__profile.avatarId) || null;
        const chosen = await window.ClassroomPlugins.avatarPicker.open({ current });
        if(chosen && chosen.avatarId){
          try{
            await setAvatar(chosen.avatarId);
            // optimistic local profile update; refresh UI
            window.__profile = Object.assign({}, window.__profile || {}, {
              avatarId: chosen.avatarId,
              avatarURL: chosen.avatarURL
            });
            patchProfile();
            patchLeaderboard();
            if(window.toast) window.toast('Avatar updated');
          }catch(e){
            if(window.toast) window.toast('Failed to update avatar');
          }
        }
      }
    }, { once: true });
  }
  ensurePicker();
  document.addEventListener('DOMContentLoaded', ensurePicker);

})();