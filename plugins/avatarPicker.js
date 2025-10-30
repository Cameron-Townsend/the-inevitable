// UMD-style Avatar Picker — window.AvatarPicker
(function(global){
  function AvatarPicker(opts){
    const preload = Array.isArray(opts.avatars) ? opts.avatars : null;
    const apiBase = opts.apiBase;
    const user = opts.user || {};
    const onChanged = typeof opts.onChanged === 'function' ? opts.onChanged : function(){};

    let state = { avatars: [], selected: user.avatarId || '' };
    const el = document.createElement('div');
    el.className = 'avatar-picker';

    function h(tag, cls, html){ const x=document.createElement(tag); if(cls) x.className=cls; if(html) x.innerHTML=html; return x; }

    function render(){
      el.innerHTML='';
      const title = h('div','avatar-picker__title','Choose your avatar');
      const grid = h('div','avatar-picker__grid');
      (state.avatars||[]).forEach(a=>{
        const card = h('button','avatar-card'); card.type='button'; card.title=a.avatarId;
        const img = new Image(); img.src=a.avatarURL; img.alt=a.avatarId; img.loading='lazy';
        img.onerror = function(){ img.src='avatars/happy-face.png'; };
        const cap = h('div','avatar-card__label', a.avatarId);
        if (a.avatarId===state.selected) card.classList.add('is-selected');
        card.appendChild(img); card.appendChild(cap);
        card.addEventListener('click', ()=> selectAvatar(a));
        grid.appendChild(card);
      });
      el.appendChild(title); el.appendChild(grid);
      return el;
    }

    async function fetchAvatars(){
      if (preload) { state.avatars = preload; render(); return; }
      try{
        const url = new URL(apiBase);
        url.searchParams.set('action','getavatars');
        const res = await fetch(url.toString(), { method:'GET' });
        if(!res.ok) throw new Error('Failed avatars');
        const json = await res.json();
        state.avatars = json.avatars || [];
        render();
      }catch(e){
        el.innerHTML = '<div class="avatar-picker__error">Error loading avatars.</div>';
      }
    }

    async function selectAvatar(a){
      state.selected = a.avatarId; render(); // optimistic
      try{
        const res = await fetch(apiBase, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'setavatar', userId: user.userId, avatarId: a.avatarId })
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error||'Avatar update failed');
        user.avatarId = json.avatarId;
        user.avatarURL = json.avatarURL || a.avatarURL;
        onChanged(user.avatarURL, user.avatarId);
      }catch(e){
        console.warn(e);
      }
    }

    return {
      async mount(container){
        if (!container) return;
        container.innerHTML='';
        container.appendChild(render());
        await fetchAvatars();
      }
    };
  }
  global.AvatarPicker = AvatarPicker;
})(window);
