
// === Avatar helpers (v19.1) ===
function setProfileAvatar(url){
  var img = document.getElementById('profile-avatar');
  if (img) img.src = url || 'avatars/happy-face.png';
}
function updateVisibleLeaderboardAvatar(userId, url){
  document.querySelectorAll('img.avatar-chip[data-user="'+userId+'"]').forEach(function(img){ img.src = url; });
}

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
function renderProfile(p){ $('#displayName') && ($('#displayName').textContent = p.displayName||p.userId); $('#coinBalance') && ($('#coinBalance').textContent = p.balance??0);   try{ if(p && p.avatarURL) setProfileAvatar(p.avatarURL); }catch{} }

function renderLeaderboard(rows){
  const ol = $('#leaderboard'); if(!ol) return; ol.innerHTML='';
  (rows||[]).forEach((r,i)=>{
    const li = document.createElement('li');
    const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';
    const img = document.createElement('img');
    img.className='avatar-chip';
    img.alt=(r.name||r.userId)+' avatar';
    img.src = r.avatarURL || 'avatars/happy-face.png';
    img.setAttribute('data-user', r.userId);
    const text = document.createElement('span');
    text.textContent = ` ${m} ${r.name} — 🪙 ${r.score}`;
    li.appendChild(img);
    li.appendChild(text);
    ol.appendChild(li);
  });
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
  const avatarsP = jget({action:'getavatars'});
  return (async ()=>{
  const [acts, lb, gm, subs, prof] = await Promise.all([
    jget({action:'getactivities'
  const avatars = await avatarsP; if(avatars.ok){ cache.avatars = avatars.avatars; try{ localStorage.setItem('cc.avatars', JSON.stringify(cache.avatars)); }catch{} }
  return true; })();
}),
    jget({action:'leaderboard'}),
    jget({action:'getgradingmap'}),
    uid ? jget({action:'getsubmissions', userId:uid}) : Promise.resolve({ok:true, submissions:[]}),
    uid ? jget({action:'getprofile', userId:uid}) : Promise.resolve({ok:true, userId:uid, balance:0})
  ]);
  if(acts.ok){ cache.acts = acts.activities; try{ localStorage.setItem(K.acts, JSON.stringify(cache.acts)); }catch{} }
  if(lb.ok){   cache.lb   = lb.leaderboard; try{ localStorage.setItem(K.lb,   JSON.stringify(cache.lb)); }catch{} renderLeaderboardPreview(cache.lb); }
  if(gm.ok){   cache.gm   = gm; try{ localStorage.setItem(K.gm,   JSON.stringify(gm)); }catch{} }
  if(subs.ok){
    cache.done = new Set((subs.submissions||[]).map(s=>s.activityId));
    try{ localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }catch{}
  } else {
    // Fallback to previously stored done set
    loadDoneFromStorage();
  }
  if(prof.ok){ cache.profile = { userId:uid, balance:prof.balance, displayName:prof.displayName }; try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch{} }
  loadArchive(); renderArchive();
}

function renderDash(){
  showApp();
  // Ensure done set is loaded even if offline
  if (!cache.done || cache.done.size===0) loadDoneFromStorage();
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderLeaderboard(cache.lb||[]);
  renderActivities(cache.acts||[], cache.done||new Set());
  renderArchive();
  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboard(lb.leaderboard); } }).catch(()=>{});
}

// Auth flow
async function goToPin(mode){
  cache.authMode = mode;
  const uid = $('#idOnly')?.value.trim();
  if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); localStorage.setItem(K.uid, uid);
  showAuthPin();
  const primaryBtn = $('#primaryAuthBtn'); if(primaryBtn) primaryBtn.textContent = (mode==='login'?'Login':'Register');
  try{
    Busy.show('Checking ID…');
    if(!cache.lb){ const lb = await jget({action:'leaderboard'}); if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(cache.lb); } }
    const check = await jget({action:'checkuser', userId:uid});
    const exists = check.ok && check.exists;
    const name = exists ? (check.displayName||uid) : uid;
    const hello = $('#helloName');
    if(hello){
      hello.textContent = (mode==='login')
        ? (exists ? `Welcome back, ${name}!` : `Not registered yet — let's create your account, ${name}.`)
        : `Create your account, ${name}`;
    }
    if(mode==='login' && !exists){ cache.authMode='register'; if(primaryBtn) primaryBtn.textContent='Register'; }
    precacheFor(uid).catch(()=>{});
  } catch(e){
    setMsg('#idMsg', e.message||'Network error'); showAuthId();
  } finally { Busy.hide(); }
}

async function onPrimaryAuth(){
  const uid = store.uid() || $('#idOnly')?.value.trim();
  const pin = $('#pin')?.value.trim();
  const remember = $('#rememberPin')?.checked && !USE_SESSION_ONLY;
  if(!uid || !pin){ setMsg('#loginMsg','Enter PIN'); return; }
  const button=$('#primaryAuthBtn'); if(button) button.setAttribute('disabled','');
  Busy.show(cache.authMode==='register' ? 'Creating account…' : 'Signing in…');
  try{
    if(cache.authMode==='register'){
      const r=await jpost({ action:'register', userId:uid, pin, displayName:uid });
      if(!r.ok) throw new Error(r.error||'Register failed');
    }
    const lg=await jpost({ action:'login', userId:uid, pin });
    if(!lg.ok) throw new Error(lg.error||'Login failed');
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    await precacheFor(uid);
    cache.profile = cache.profile || { userId:uid, balance:0 };
    cache.profile.displayName = lg.displayName || cache.profile.displayName || uid;
    renderDash();
  } catch(e){
    setMsg('#loginMsg', e.message||'Auth error');
  } finally {
    Busy.hide();
    if(button) button.removeAttribute('disabled');
  }
}

// Submit (hide-on-reload: add to done set immediately)
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`); }
function addClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.add(x)); }
function removeClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.remove(x)); }

async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin();
  if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$(`#ans-${id}`); const answer=(inp?.value||'').trim(); if(!answer){ const t=tileEl(id); showTileToast(t,'Enter an answer','info'); return; }
  const btn=ev.currentTarget; const tile=tileEl(id); if(!tile) return;

  // Immediately record this tile as completed client-side to hide on future reloads
  cache.done.add(id); persistDone();

  // Lock + dim (no spinner), keep tile for toast, then slide to end later
  removeClasses(tile,'success','fail','neutral','done'); addClasses(tile,'processing','locked');
  if(inp) inp.disabled=true; btn.disabled=true;

  // Client-side quick verdict
  let verdict='neutral', points=0;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ verdict='success'; points=Number(entry.points||0); } else { verdict='fail'; }
    }
  }catch{}

  // Shimmer verdict
  const SWITCH_MS = 150;
  setTimeout(()=>{ removeClasses(tile,'processing'); addClasses(tile, verdict); }, SWITCH_MS);

  // Toast (2s), then move to end
  const TOAST_MS = 2000;
  if(verdict==='success'){
    const bal = Number($('#coinBalance')?.textContent||0) + points;
    $('#coinBalance') && ($('#coinBalance').textContent = bal);
    showTileToast(tile, `✅ Correct! +🪙 ${points}`, 'good');
  } else if(verdict==='fail'){ showTileToast(tile, '❌ Not quite — recorded.', 'bad'); }
  else { showTileToast(tile, 'ℹ️ Submitted.', 'info'); }

  setTimeout(()=>{ addClasses(tile,'moving'); tile.style.order='999'; }, TOAST_MS);

  // Submit to server
  const SHIMMER_TOTAL = 700 + 600;
  setTimeout(()=> addClasses(tile,'done'), SHIMMER_TOTAL);

  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok) throw new Error(res.error||'Submit failed');
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok && $('#coinBalance')) $('#coinBalance').textContent = prof.balance;
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);

    const act = (cache.acts||[]).find(a => a.activityId === id) || { title:id, points:0 };
    cache.archive = cache.archive.filter(x => x.activityId !== id);
    cache.archive.unshift({ activityId:id, title: act.title || id, points: res.pointsAwarded ?? (verdict==='success'? (act.points||0) : 0), correct: (res.correct !== undefined ? res.correct : (verdict==='success'?true: verdict==='fail'?false:null)), answer, correctAnswer: act.correctAnswer || null, timestamp: new Date().toISOString() });
    saveArchive(); renderArchive();

    setTimeout(()=>{
      tile.style.transform='scale(0.98)';
      tile.style.opacity='0.0';
      setTimeout(()=> tile.remove(), 260);
    }, SHIMMER_TOTAL + 400);
  } catch(e){
    // If server failed, revert done state so tile can be retried after reload
    cache.done.delete(id); persistDone();

    removeClasses(tile,'processing','success','fail','neutral','done','locked','moving');
    tile.style.order = '';
    if(inp) inp.disabled=false; btn.disabled=false; showTileToast(tile, e.message || 'Error', 'bad');
  }
}

// Events
function wireEvents(){
  const on = (sel, fn) => { const el=$(sel); if(el){ el.addEventListener('click', fn, { passive:true }); return true; } return false; };
  on('#idLoginBtn',     ()=>goToPin('login'));
  on('#idRegisterBtn',  ()=>goToPin('register'));
  on('#primaryAuthBtn', onPrimaryAuth);
  on('#backToIdBtn',    showAuthId);
  on('#logoutBtn',      ()=>{ store.clear(); location.reload(); });
  const archBtn = $('#archiveToggle');
  if(archBtn){
    archBtn.addEventListener('click', ()=>{
      const p = $('#archivePanel'); const open = !p.hasAttribute('hidden');
      if(open){ p.setAttribute('hidden',''); archBtn.setAttribute('aria-expanded','false'); }
      else { p.removeAttribute('hidden'); archBtn.setAttribute('aria-expanded','true'); }
    }, { passive:true });
  }
}

// Boot
async function boot(){
  if(!document.body.getAttribute('data-state')) setState('auth-id');
  wireEvents();
  const y=$('#year'); if(y) y.textContent=new Date().getFullYear();
  const build=$('#build'); if(build) build.textContent=(window.ASSET_VERSION||'dev');
  const theme = localStorage.getItem('cc.theme'); document.documentElement.classList.toggle('light', theme==='light');
  const tt = $('#themeToggle'); if(tt){ tt.onclick = ()=>{ const light = !document.documentElement.classList.contains('light'); document.documentElement.classList.toggle('light', light); localStorage.setItem('cc.theme', light?'light':'dark'); }; }

  // Load preview and local caches early
  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(lb.leaderboard); } }).catch(()=>{});
  loadDoneFromStorage(); // ensure we know completed IDs before first render
  loadArchive(); renderArchive();

  const uid=store.uid(), pin=store.pin();
  if(uid && pin){
    Busy.show('Loading your dashboard…');
    try{
      await precacheFor(uid);
      renderDash();
    } finally { Busy.hide(); }
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot, { once:true })
  : boot();


function bindProfileAvatarFromPayload(payload){
  if (!payload) return;
  if (payload.avatarURL) { try { setProfileAvatar(payload.avatarURL); } catch(_){} }
  // Mount picker if available
  var mount = document.getElementById('avatar-picker');
  if (mount && window.AvatarPicker && payload.userId){
    var picker = window.AvatarPicker({
      apiBase: ClassroomConfig.WEB_APP_URL,
      user: { userId: payload.userId, avatarId: payload.avatarId||'', avatarURL: payload.avatarURL||'' },
    avatars: (cache && cache.avatars) || (function(){ try{return JSON.parse(localStorage.getItem('cc.avatars')||'[]')}catch{return []} })(),
      onChanged: function(url, id){
        if (window.showToast) showToast('Avatar updated!');
        setProfileAvatar(url);
        try {
          var cached = JSON.parse(localStorage.getItem('cc.profile') || '{}');
          cached.avatarId = id; cached.avatarURL = url;
          localStorage.setItem('cc.profile', JSON.stringify(cached));
        } catch(e){}
        updateVisibleLeaderboardAvatar(payload.userId, url);
      }
    });
    picker.mount(mount);
  }
}




// Decorate leaderboard entries with avatar chips if backend provides avatar URLs
(function(){
  var lb = document.getElementById('leaderboard');
  if (!lb) return;
  var decorate = function(){
    // If rows already contain avatar-chip, skip
    if (lb.querySelector('img.avatar-chip')) return;
    // Try to fetch the leaderboard dataset and re-render minimally
    try {
      var url = new URL(ClassroomConfig.WEB_APP_URL);
      url.searchParams.set('action','leaderboard');
      fetch(url.toString()).then(function(r){ return r.json(); }).then(function(j){
        if (!j || !j.ok || !Array.isArray(j.leaderboard)) return;
        // Build simple list
        lb.innerHTML='';
        j.leaderboard.forEach(function(r){
          var li = document.createElement('li');
          var img = document.createElement('img');
          img.className='avatar-chip';
          img.alt=(r.name||r.userId)+' avatar';
          img.src = r.avatarURL || 'avatars/happy-face.png';
          img.setAttribute('data-user', r.userId);
          var span = document.createElement('span');
          span.textContent = ' ' + (r.name||r.userId) + ' — ' + r.score;
          li.appendChild(img); li.appendChild(span);
          lb.appendChild(li);
        });
      });
    } catch(e){}
  };
  // Try decorate after DOM ready and whenever list mutates
  if (document.readyState !== 'loading') decorate();
  else document.addEventListener('DOMContentLoaded', decorate);
  new MutationObserver(function(){ decorate(); }).observe(lb, { childList:true });
})();
