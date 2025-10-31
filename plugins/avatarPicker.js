// UMD-style Avatar Picker — window.AvatarPicker (stable, preload + fallback, URL normalize, single-mount)
(function(global){
  function AvatarPicker(opts){
    const preload   = Array.isArray(opts.avatars) ? opts.avatars : null;
    const apiBase   = (opts.apiBase || '').trim();
    const user      = opts.user || {};
    const onChanged = typeof opts.onChanged === 'function' ? opts.onChanged : function(){};

    let state = { avatars: [], selected: (user.avatarId || '').trim() };
    const el = document.createElement('div');
    el.className = 'avatar-picker';

    function h(tag, cls, html){ const x=document.createElement(tag); if(cls) x.className=cls; if(html) x.innerHTML=html; return x; }
    function norm(s){ return (s||'').toString().trim(); }
    function normURL(u){
      u = norm(u);
      if (!u) return '';
      if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/')) return u;
      // Treat bare filenames as /avatars/<filename>
      return 'avatars/' + u;
    }

    function render(){
      el.innerHTML='';
      const title = h('div','avatar-picker__title','Choose your avatar');
      const grid  = h('div','avatar-picker__grid');

      (state.avatars||[]).forEach(a=>{
        const card = h('button','avatar-card'); card.type='button'; card.title=a.avatarId;
        const img = new Image();
        img.src = normURL(a.avatarURL);
        img.alt = a.avatarId;
        img.loading = 'lazy';
        img.onerror = function(){ img.src='avatars/happy-face.png'; };
        const cap = h('div','avatar-card__label', a.avatarId);
        if (a.avatarId === state.selected) card.classList.add('is-selected');
        card.appendChild(img);
        card.appendChild(cap);
        card.addEventListener('click', ()=> selectAvatar(a));
        grid.appendChild(card);
      });

      el.appendChild(title); el.appendChild(grid);
      return el;
    }

    async function fetchAvatars(){
      if (preload) {
        state.avatars = preload.map(a => ({ avatarId: norm(a.avatarId), avatarURL: normURL(a.avatarURL) }));
        render();
        return;
      }
      try{
        const url = new URL(apiBase);
        url.searchParams.set('action','getavatars');
        const res = await fetch(url.toString(), { method:'GET' });
        if(!res.ok) throw new Error('Failed avatars');
        const json = await res.json();
        const seen = new Set();
        state.avatars = (json.avatars || [])
          .map(a => ({ avatarId: norm(a.avatarId), avatarURL: normURL(a.avatarURL) }))
          .filter(a => a.avatarId && a.avatarURL && !seen.has(a.avatarId) && seen.add(a.avatarId));
        render();
      }catch(e){
        el.innerHTML = '<div class="avatar-picker__error">Error loading avatars.</div>';
        console.warn(e);
      }
    }

    async function selectAvatar(a){
      state.selected = a.avatarId;
      render(); // optimistic highlight
      try{
        const body = new URLSearchParams({ action:'setavatar', userId: user.userId || '', avatarId: a.avatarId });
        const res = await fetch(apiBase, {
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
          body
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error||'Avatar update failed');

        // Prefer server URL; fallback to the tile’s URL if absent.
        const finalURL = normURL(json.avatarURL || a.avatarURL);
        user.avatarId = json.avatarId || a.avatarId;
        user.avatarURL = finalURL;

        // Notify host app (profile refresh, leaderboard refresh, etc.)
        onChanged(user.avatarURL, user.avatarId);
      }catch(e){
        console.warn(e);
      }
    }

    return {
      async mount(container){
        if (!container) return;
        // Defensive: prevent duplicate mounts causing double grids.
        if (container.__avatarPickerMounted) return;
        container.__avatarPickerMounted = true;

        container.innerHTML='';
        container.appendChild(render());
        await fetchAvatars();
      }
    };
  }
  global.AvatarPicker = AvatarPicker;
})(window);
