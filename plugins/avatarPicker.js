(function(root, factory){
  if(typeof define === 'function' && define.amd){
    define([], factory);
  }else if(typeof module === 'object' && module.exports){
    module.exports = factory();
  }else{
    root.ClassroomPlugins = root.ClassroomPlugins || {};
    root.ClassroomPlugins.avatarPicker = factory();
  }
}(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

  function el(tag, attrs, children){
    const e = document.createElement(tag);
    if(attrs) Object.entries(attrs).forEach(([k,v]) => {
      if(k === 'class') e.className = v;
      else if(k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    });
    (children||[]).forEach(c => e.appendChild(c));
    return e;
  }

  async function fetchAvatars(){
    try{
      const base = (window.ClassroomConfig && window.ClassroomConfig.WEB_APP_URL) || '';
      const url = base + (base.includes('?') ? '&' : '?') + 'fn=getavatars&_ts=' + Date.now();
      const res = await fetch(url, { method: 'GET' });
      const json = await res.json();
      const list = Array.isArray(json) ? json : (json.avatars || []);
      return list.filter(a => a && a.avatarId && a.avatarURL);
    }catch(e){
      console.error('avatarPicker.getavatars failed', e);
      return [];
    }
  }

  function safe(url){
    try{
      if(!url) return null;
      const u = new URL(url, location.origin);
      if(u.protocol === 'http:') u.protocol = 'https:';
      u.searchParams.set('_ts', String(Date.now()));
      return u.toString();
    }catch(e){ return null; }
  }

  function open(opts){
    opts = opts || {};
    return new Promise(async (resolve) => {
      const modal = el('div', { class: 'modal open', id: 'avatarPickerModal' });
      const sheet = el('div', { class: 'sheet' });
      const title = el('h3', { text: 'Choose your avatar' });
      const grid = el('div', { class: 'avatar-grid' });
      const closeBtn = el('button', { class: 'btn small', text: 'Cancel', type: 'button' });

      sheet.appendChild(title);
      sheet.appendChild(grid);
      sheet.appendChild(el('div', { }, [closeBtn]));
      modal.appendChild(sheet);
      document.body.appendChild(modal);

      closeBtn.addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });

      const avatars = await fetchAvatars();
      avatars.forEach(a => {
        const url = safe(a.avatarURL);
        const cell = el('div', { class: 'cell', 'data-id': a.avatarId });
        const img = el('img', { src: url || '', alt: a.avatarId });
        const label = el('div', { class: 'caption', text: a.avatarId });
        cell.appendChild(img);
        cell.appendChild(label);
        if(opts.current && opts.current === a.avatarId){
          cell.style.outline = '2px solid #6cf';
        }
        cell.addEventListener('click', () => {
          modal.remove();
          resolve({ avatarId: a.avatarId, avatarURL: a.avatarURL });
        });
        grid.appendChild(cell);
      });

      // click outside to close
      modal.addEventListener('click', (e) => {
        if(e.target === modal){ modal.remove(); resolve(null); }
      });
    });
  }

  return { open };
}));