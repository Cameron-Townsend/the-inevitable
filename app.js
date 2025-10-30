
// ---- Safe Dashboard Hydration (guarded) ----
function hydrateDashFromCache(){
  try {
    if (cache && cache.profile) {
      try { if (typeof renderProfile === 'function') renderProfile(cache.profile); } catch(e){}
      try { if (typeof bindProfileAvatarFromPayload === 'function') bindProfileAvatarFromPayload(cache.profile); } catch(e){}
    }
    if (cache && cache.lb) {
      try { if (typeof renderLeaderboard === 'function') renderLeaderboard(cache.lb); } catch(e){}
    }
    if (cache && cache.acts) {
      try {
        var done = (cache.done instanceof Set) ? cache.done :
                   new Set(Array.isArray(cache.done) ? cache.done : []);
        if (typeof renderActivities === 'function') renderActivities(cache.acts, done);
      } catch(e){}
    }
  } catch(e){ console.warn('[hydrateDashFromCache] warning:', e); }
}
// ---- End Safe Dashboard Hydration ----


// Render dashboard pieces from cache safely
catch(e){} }
    if (cache && cache.lb)      { renderLeaderboard(cache.lb); }
    if (cache && cache.acts)    { 
      try {
        // Prefer existing renderActivities signature if available
        if (typeof renderActivities === 'function') {
          var done = (cache.done instanceof Set) ? cache.done : new Set(Array.isArray(cache.done) ? cache.done : []);
          renderActivities(cache.acts, done);
        }
      } catch(e){}
    }
  } catch(e){ console.warn('[hydrateDashFromCache] warning:', e); }
}

function setProfileAvatar(url){ const img=document.getElementById('profile-avatar'); if(img) img.src = url || 'avatars/happy-face.png'; }
function updateVisibleLeaderboardAvatar(userId,url){ document.querySelectorAll('img.avatar-chip[data-user="'+userId+'"]').forEach(img=>img.src=url); }
// Classroom Challenge — app v19 (hide completed tiles across reload; archive only)
const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if (!WEB_APP_URL) console.error('Missing WEB_APP_URL in config.js');

const K = { uid:'cc.uid', pin:'cc.pin', prof:'cc.profile', acts:'cc.activities', subs:'cc.subs', lb:'cc.lb', gm:'cc.grading', arch:'cc.archive' };
const $  = (s,root=document)=> root.querySelector(s);
const $$ = (s,root=document)=> Array.from(root.querySelectorAll(s));

// Busy (auth-only)
const Busy = (()=> {
  let count=0, timer=null;
  const el = () => $('#busyOverlay');
  function show(text){
    const e=el(); if(!e) return;
    if(text){ const t=e.querySelector('.busy-text'); if(t) t.textContent=text; }
    count = Math.max(0,count)+1;
    e.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(()=>{ count=0; e.classList.add('hidden'); timer=null; }, 10000);
  }
  function hide(){
    const e=el(); if(!e) return;
    count = Math.max(0, count-1);
    if(count===0){ e.classList.add('hidden'); clearTimeout(timer); timer=null; }
  }
  return { show, hide };
})();

// Storage
const store = {
  set(uid, pin, remember){
    localStorage.setItem(K.uid, uid);
    (remember ? localStorage : sessionStorage).setItem(K.pin, pin);
    if(!remember) localStorage.removeItem(K.pin);
  },
  clear(){
    localStorage.removeItem(K.uid);
    localStorage.removeItem(K.pin);
    sessionStorage.removeItem(K.pin);
    localStorage.removeItem(K.arch);
  },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};

// Net
const jget  = p    => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET'  }).then(r=>r.json());
const jpost = body => fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:new URLSearchParams(body) }).then(r=>r.json());

// State/UI helpers
function setState(s){ document.body.setAttribute('data-state', s); const tt = $('#themeToggle'); if (tt) tt.classList.toggle('hidden', s==='app'); }
const setMsg = (sel, m) => { const el=$(sel); if(el) el.textContent = m||''; };
const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){ const enc=new TextEncoder(); const buf=await crypto.subtle.digest('SHA-256', enc.encode(str)); return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }
function showAuthId(){ setState('auth-id'); }
function showAuthPin(){ setState('auth-pin'); }
function showApp(){ setState('app'); }

// Cache
const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set(), authMode:'login', archive:[] , hideCompleted:true};
function loadArchive(){ try{ cache.archive = JSON.parse(localStorage.getItem(K.arch)||'[]'); }catch{ cache.archive=[]; } }
function saveArchive(){ try{ localStorage.setItem(K.arch, JSON.stringify(cache.archive)); }catch{} }
function loadDoneFromStorage(){ try{ const arr = JSON.parse(localStorage.getItem(K.subs)||'[]'); cache.done = new Set(arr); }catch{ cache.done = new Set(); } }
function persistDone(){ try{ localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }catch{} }

// Renderers
function renderProfile(p){
  $('#displayName') && ($('#displayName').textContent = p.displayName || p.userId || '—');
  $('#coinBalance') && ($('#coinBalance').textContent = p.balance ?? 0);
  try { if (p && p.avatarURL) setProfileAvatar(p.avatarURL); } catch {}
}
function renderLeaderboardPreview(rows){
  const ol = $('#leaderboardPreview'); if(!ol) return; ol.innerHTML='';
  (rows||[]).slice(0,8).forEach((r,i)=>{ const li=document.createElement('li'); const m=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; li.textContent=`${m} ${r.name} — ${r.score}`; ol.appendChild(li); });
}
function renderActivities(list, doneSet){
  const wrap=$('#activities'); if(!wrap) return; wrap.innerHTML='';
  const hide = cache.hideCompleted !== false;
  (list||[]).forEach(a=>{
    const isDone = doneSet.has(a.activityId);
    if (hide && isDone) return; // do not render completed tiles
    const div=document.createElement('div');
    div.className='activity'+(isDone?' done locked':'');
    div.setAttribute('data-tile', a.activityId);
    div.innerHTML=`<h3>🧠 ${a.title}</h3>
      <p>${a.prompt||''}</p>
      <p>Worth <strong>🪙 ${a.points}</strong></p>
      <div class="row stack">
        <input placeholder="Your answer" id="ans-${a.activityId}" ${isDone?'disabled':''}>
        <button data-id="${a.activityId}" ${isDone?'disabled':''}>Submit</button>
      </div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', onSubmit, { passive:true }));
}
function renderArchive(){
  const ul = $('#archiveList'); if(!ul) return; ul.innerHTML='';
  if(!cache.archive.length){ ul.innerHTML = '<li class="muted">No previous activities yet.</li>'; return; }
  cache.archive.forEach(item=>{
    const li=document.createElement('li'); li.className='archive-item'; li.dataset.id=item.activityId; li.setAttribute('aria-expanded','false');
    const pill = item.correct===true?'good':item.correct===false?'bad':'neutral';
    li.innerHTML = `<div class="hdr">
        <div>
          <strong>${item.title||item.activityId}</strong>
          <div class="meta">${new Date(item.timestamp).toLocaleString()} • <span class="pill ${pill}">${item.correct===true?'Correct ✅':item.correct===false?'Incorrect ❌':'Submitted ℹ️'}</span> • 🪙 ${item.points||0}</div>
        </div>
        <button class="secondary small toggle-detail">Details</button>
      </div>
      <div class="detail">
        <div><strong>Your answer:</strong></div>
        <div class="answer">${(item.answer||'—').replace(/[<>&]/g,s=>({ '<':'&lt;','>':'&gt;','&':'&amp;' }[s]))}</div>
        <div class="correct">${item.correctAnswer ? `<strong>Correct answer:</strong> ${item.correctAnswer}` : '<em>Correct answer hidden</em>'}</div>
      </div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.toggle-detail').forEach(btn=> btn.addEventListener('click', e=>{
    const li = e.currentTarget.closest('.archive-item'); const open = li.getAttribute('aria-expanded')==='true';
    li.setAttribute('aria-expanded', open?'false':'true');
  }));
}

// Tile toast helper
function showTileToast(tile, msg, kind='info'){
  if(!tile) return;
  const div = document.createElement('div');
  div.className = `tile-toast ${kind}`;
  div.textContent = msg;
  tile.appendChild(div);
  setTimeout(()=> div.remove(), 2000);
}

// Global toast still available for site-wide notices (login errors, etc.)
let toastTimer=null;
function showToast(msg, kind=''){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.className='toast '+(kind||''); t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400); }

// Data fetching
async function precacheFor(uid){
  const avatarsP = jget({ action: 'getavatars' }).catch,
      onChanged: function(url, id){
        if (window.showToast) showToast('Avatar updated!');
        setProfileAvatar(url);
        try{
          var cached = JSON.parse(localStorage.getItem(K.prof) || '{}');
          cached.avatarId = id; cached.avatarURL = url;
          localStorage.setItem(K.prof, JSON.stringify(cached));
        }catch{}
        updateVisibleLeaderboardAvatar(profile.userId, url);
      }
    });
    picker.mount(mount);
  }
}


/* schedule hydration after all functions are parsed */
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function once(){
      document.removeEventListener('DOMContentLoaded', once);
      try { hydrateDashFromCache(); } catch(e){}
    });
  } else {
    setTimeout(function(){ try { hydrateDashFromCache(); } catch(e){} }, 0);
  }
} catch(e) {}
