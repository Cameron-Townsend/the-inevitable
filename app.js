// Classroom Challenge — app v19.1.7c
// panel-scoped busy + cache-first + staggered loads + avatar-preserving profile
// + quiet refresh for submit + avatar URL resolver

const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if (!WEB_APP_URL) console.error('Missing WEB_APP_URL in config.js');

const K = {
  uid:'cc.uid',
  pin:'cc.pin',
  prof:'cc.profile',
  acts:'cc.activities',
  subs:'cc.subs',
  lb:'cc.lb',
  gm:'cc.grading',
  arch:'cc.archive',
  ts:'cc.ts' // timestamps for cache freshness
};

const $  = (s,root=document)=> root.querySelector(s);
const $$ = (s,root=document)=> Array.from(root.querySelectorAll(s));

/* =========================
   Global Busy (auth-only)
   ========================= */
const Busy = (() => {
  let busySince = 0;
  let lingerMs = 800;
  const el = () => $('#busyOverlay');

  async function show(text, minMs = 800) {
    const e = el();
    if (!e) return;
    busySince = Date.now();
    lingerMs = minMs;
    if (text) {
      const t = e.querySelector('.busy-text');
      if (t) t.textContent = text;
    }
    e.classList.remove('hidden');
  }

  async function hide(force = false) {
    const e = el();
    if (!e) return;
    const elapsed = Date.now() - busySince;
    if (!force && elapsed < lingerMs) {
      const wait = lingerMs - elapsed;
      await new Promise(res => res(wait));
    }
    e.classList.add('hidden');
  }

  return { show, hide };
})();

/* =========================
   Panel-scoped Busy (global)
   ========================= */
window.CCPanelBusy = {
  show(panelName) {
    if (!panelName) return;
    const el = document.querySelector(`.cc-panel[data-panel="${panelName}"] .panel-busy-overlay`);
    if (el) el.classList.add('is-active');
  },
  hide(panelName) {
    if (!panelName) return;
    const el = document.querySelector(`.cc-panel[data-panel="${panelName}"] .panel-busy-overlay`);
    if (el) el.classList.remove('is-active');
  }
};

/* =========================
   Storage helpers
   ========================= */
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
    localStorage.removeItem(K.ts);
  },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};

/* =========================
   Network helpers
   ========================= */
const jget  = p    => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET'  }).then(r=>r.json());
const jpost = body => fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}, body:new URLSearchParams(body) }).then(r=>r.json());

/* =========================
   State / Cache
   ========================= */
const cache = {
  acts:null,
  lb:null,
  gm:null,
  profile:null,
  done:new Set(),
  authMode:'login',
  archive:[],
  hideCompleted:true,
  avatars:null,
  showFullLB:false,
  timestamps:{}
};

// leaderboard throttle (ms)
let lastLeaderboardRefresh = 0;

function loadTimestamps(){
  try {
    cache.timestamps = JSON.parse(localStorage.getItem(K.ts) || '{}');
  } catch {
    cache.timestamps = {};
  }
}
function saveTimestamp(key){
  cache.timestamps[key] = Date.now();
  try {
    localStorage.setItem(K.ts, JSON.stringify(cache.timestamps));
  } catch {}
}
function shouldRefresh(key, ttlMs){
  const ts = cache.timestamps[key];
  if (!ts) return true;
  return (Date.now() - ts) > ttlMs;
}

/* =========================
   UI helpers
   ========================= */
function setState(s){
  document.body.setAttribute('data-state', s);
  const tt = $('#themeToggle');
  if (tt) tt.classList.toggle('hidden', s==='app');
}
const setMsg = (sel, m) => { const el=$(sel); if(el) el.textContent = m||''; };
const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){
  const enc=new TextEncoder();
  const buf=await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join('');
}
function showAuthId(){ setState('auth-id'); }
function showAuthPin(){ setState('auth-pin'); }
function showApp(){ setState('app'); }

/* =========================
   Cache loaders
   ========================= */
function loadArchive(){
  try{ cache.archive = JSON.parse(localStorage.getItem(K.arch)||'[]'); }catch{ cache.archive=[]; }
}
function saveArchive(){
  try{ localStorage.setItem(K.arch, JSON.stringify(cache.archive)); }catch{}
}
function loadDoneFromStorage(){
  try{ const arr = JSON.parse(localStorage.getItem(K.subs)||'[]'); cache.done = new Set(arr); }catch{ cache.done = new Set(); }
}
function persistDone(){
  try{ localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }catch{}
}
function loadActivitiesFromStorage(){
  try { cache.acts = JSON.parse(localStorage.getItem(K.acts) || 'null'); } catch { cache.acts = null; }
}
function loadLeaderboardFromStorage(){
  try { cache.lb = JSON.parse(localStorage.getItem(K.lb) || 'null'); } catch { cache.lb = null; }
}
function loadProfileFromStorage(){
  try { cache.profile = JSON.parse(localStorage.getItem(K.prof) || 'null'); } catch { cache.profile = null; }
}

/* =========================
   Renderers
   ========================= */
function renderProfile(p){
  $('#displayName') && ($('#displayName').textContent = p.displayName||p.userId);
  $('#coinBalance') && ($('#coinBalance').textContent = p.balance??0);
  // avatar is rendered by app-avatar-patch.js using window.__profile
}

function renderLeaderboard(rows, opts = {}){
  const ol = $('#leaderboard'); if (!ol) return;
  ol.innerHTML = '';

  const currentUserId = cache.profile?.userId;
  const limit = opts.limit ?? (cache.showFullLB ? 20 : 5);

  (rows || []).slice(0, limit).forEach((r, i) => {
    const li = document.createElement('li');

    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';
    const rank = i + 1;

    const row = document.createElement('div');
    row.className = 'lb-row';

    if (r.userId && r.userId === currentUserId) {
      row.classList.add('me');
    }

    const left = document.createElement('div');
    left.className = 'lb-left';
    left.textContent = `${medal} ${rank}.`;
    row.appendChild(left);

    if (r.avatarURL) {
      const img = document.createElement('img');
      img.className = 'avatar-img sm';
      img.src = r.avatarURL;
      img.alt = r.name || r.userId || 'Avatar';
      img.onerror = () => img.remove();
      row.appendChild(img);
    }

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = r.name;
    row.appendChild(name);

    const score = document.createElement('span');
    score.className = 'lb-score';
    score.textContent = `🪙 ${r.score}`;
    row.appendChild(score);

    li.appendChild(row);
    ol.appendChild(li);
  });
}

function renderLeaderboardPreview(rows){
  const ol = $('#leaderboardPreview'); if(!ol) return;
  ol.innerHTML = '';
  (rows || []).slice(0, 5).forEach((r, i) => {
    const li = document.createElement('li');
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';
    li.textContent = `${medal} ${r.name} — ${r.score}`;
    ol.appendChild(li);
  });
}

function renderActivities(list, doneSet){
  const wrap=$('#activities'); if(!wrap) return; wrap.innerHTML='';
  const hide = cache.hideCompleted !== false;
  (list||[]).forEach(a=>{
    const isDone = doneSet.has(a.activityId);
    if (hide && isDone) return;
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

// Tile toast
function showTileToast(tile, msg, kind='info'){
  if(!tile) return;
  const div = document.createElement('div');
  div.className = `tile-toast ${kind}`;
  div.textContent = msg;
  tile.appendChild(div);
  setTimeout(()=> div.remove(), 2000);
}

// Global toast
let toastTimer=null;
function showToast(msg, kind=''){
  const t=$('#toast'); if(!t) return;
  t.textContent=msg; t.className='toast '+(kind||''); t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400);
}

// Helper: pick random avatar from cache
function pickRandomAvatar(){
  const list = (cache.avatars && Array.isArray(cache.avatars)) ? cache.avatars : (cache.avatars && Array.isArray(cache.avatars.avatars)) ? cache.avatars.avatars : null;
  if(!list || !list.length) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

async function ensureAvatarFor(uid){
  if (cache.profile && (cache.profile.avatarId || cache.profile.avatarURL)) {
    return;
  }
  if (!cache.avatars || !Array.isArray(cache.avatars) || cache.avatars.length === 0) {
    return;
  }
  const chosen = pickRandomAvatar();
  if(!chosen) return;
  try {
    await jpost({ action:'setavatar', userId: uid, avatarId: chosen.avatarId });
    cache.profile = cache.profile || { userId: uid, balance: 0 };
    cache.profile.avatarId = chosen.avatarId;
    cache.profile.avatarURL = chosen.avatarURL;
    window.__profile = cache.profile;
  } catch (e) {
    console.warn('Failed to set default avatar', e);
  }
}

/**
 * If we have avatarId but not avatarURL (common on first load or from old cache),
 * quietly fetch avatars once and resolve just this user's avatar.
 */
async function ensureCurrentAvatarURL(uid){
  if (!cache.profile) return;
  const { avatarId, avatarURL } = cache.profile;
  if (!avatarId || avatarURL) return;
  try {
    const res = await jget({ action:'getavatars' });
    if (res.ok && Array.isArray(res.avatars)) {
      const hit = res.avatars.find(a => a.avatarId === avatarId);
      if (hit) {
        cache.profile.avatarURL = hit.avatarURL;
        window.__profile = cache.profile;
        try { localStorage.setItem(K.prof, JSON.stringify(cache.profile)); } catch {}
      }
    }
  } catch (e) {
    // silent fail — we just leave avatar blank instead of broken
  }
}

/* =========================
   Data fetching (optimized)
   ========================= */
async function precacheCore(uid){
  CCPanelBusy.show('profile');
  CCPanelBusy.show('activities');
  CCPanelBusy.show('archive');
  try {
    const [acts, gm, subs, prof] = await Promise.all([
      jget({action:'getactivities'}),
      jget({action:'getgradingmap'}),
      uid ? jget({action:'getsubmissions', userId:uid}) : Promise.resolve({ok:true, submissions:[]}),
      uid ? jget({action:'getprofile', userId:uid}) : Promise.resolve({ok:true, userId:uid, balance:0})
    ]);

    if(acts.ok){
      cache.acts = acts.activities;
      try{ localStorage.setItem(K.acts, JSON.stringify(cache.acts)); }catch{}
      saveTimestamp('activities');
    }

    if(gm.ok){
      cache.gm = gm;
      try{ localStorage.setItem(K.gm, JSON.stringify(gm)); }catch{}
      saveTimestamp('grading');
    }

    if(subs.ok){
      cache.done = new Set((subs.submissions||[]).map(s=>s.activityId));
      try{ localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }catch{}
      saveTimestamp('submissions');
    } else {
      loadDoneFromStorage();
    }

    if(prof.ok){
      cache.profile = {
        userId: uid,
        balance: prof.balance,
        displayName: prof.displayName,
        avatarId: prof.avatarId,
        avatarURL: prof.avatarURL
      };
      try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch{}
      saveTimestamp('profile');
    }

    window.__profile = cache.profile || { userId: uid };

    loadArchive();
    renderArchive();

    // extra: if profile had avatarId but no URL, resolve it quietly
    await ensureCurrentAvatarURL(uid);
  } finally {
    CCPanelBusy.hide('profile');
    CCPanelBusy.hide('activities');
    CCPanelBusy.hide('archive');
  }
}

/**
 * Secondary fetches that can happen a bit later:
 * - leaderboard
 * (we keep the overlay here because it's initial load, not per-submit)
 */
function scheduleSecondaryFetches(){
  setTimeout(async () => {
    CCPanelBusy.show('leaderboard');
    try {
      const lb = await jget({action:'leaderboard'});
      if(lb.ok){
        cache.lb = lb.leaderboard;
        try{ localStorage.setItem(K.lb, JSON.stringify(cache.lb)); }catch{}
        saveTimestamp('leaderboard');
        lastLeaderboardRefresh = Date.now();
        renderLeaderboard(lb.leaderboard);
        renderLeaderboardPreview(lb.leaderboard);
      }
    } catch (e) {
      console.warn('leaderboard refresh failed', e);
    } finally {
      CCPanelBusy.hide('leaderboard');
    }
  }, 250);
}

/* =========================
   Render Dash (uses cache)
   ========================= */
function renderDash(){
  showApp();
  if (!cache.done || cache.done.size===0) loadDoneFromStorage();
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderActivities(cache.acts||[], cache.done||new Set());
  renderArchive();
  renderLeaderboard(cache.lb||[]);

  window.__profile = cache.profile;
  window.__avatars = cache.avatars || [];
}

/* =========================
   Auth flow
   ========================= */
async function goToPin(mode){
  cache.authMode = mode;
  const uid = $('#idOnly')?.value.trim();
  if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); localStorage.setItem(K.uid, uid);
  showAuthPin();
  const primaryBtn = $('#primaryAuthBtn'); if(primaryBtn) primaryBtn.textContent = (mode==='login'?'Login':'Register');
  try{
    Busy.show('Checking ID…');
    if(!cache.lb && shouldRefresh('leaderboard', 5*60*1000)){
      const lb = await jget({action:'leaderboard'});
      if(lb.ok){
        cache.lb=lb.leaderboard;
        renderLeaderboardPreview(cache.lb);
        try{localStorage.setItem(K.lb, JSON.stringify(cache.lb));}catch{};
        saveTimestamp('leaderboard');
        lastLeaderboardRefresh = Date.now();
      }
    } else if (cache.lb) {
      renderLeaderboardPreview(cache.lb);
    }

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
  } catch(e){
    setMsg('#idMsg', e.message||'Network error'); showAuthId();
  } finally {
    await Busy.hide();
  }
}

async function onPrimaryAuth(){
  const uid = store.uid() || $('#idOnly')?.value.trim();
  const pin = $('#pin')?.value.trim();
  const remember = $('#rememberPin')?.checked && !USE_SESSION_ONLY;
  if(!uid || !pin){ setMsg('#loginMsg','Enter PIN'); return; }

  const button = $('#primaryAuthBtn');
  if (button) button.setAttribute('disabled','');

  await Busy.show(cache.authMode === 'register' ? 'Creating account…' : 'Signing in…');

  try {
    if (cache.authMode === 'register') {
      const r = await jpost({ action:'register', userId:uid, pin, displayName:uid });
      if (!r.ok) throw new Error(r.error || 'Register failed');
    }

    const lg = await jpost({ action:'login', userId:uid, pin });
    if (!lg.ok) throw new Error(lg.error || 'Login failed');

    store.set(uid, pin, remember);
    setMsg('#loginMsg','');

    // preserve avatar from login response
    cache.profile = cache.profile || { userId: uid, balance: 0 };
    cache.profile.displayName = lg.displayName || cache.profile.displayName || uid;
    cache.profile.avatarId = lg.avatarId || cache.profile.avatarId;
    cache.profile.avatarURL = lg.avatarURL || cache.profile.avatarURL;
    try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch{}
    saveTimestamp('profile');

    renderDash();

    try {
      await precacheCore(uid);
      renderDash();
      scheduleSecondaryFetches();
    } catch (e) {
      console.warn('Background precache after auth failed:', e);
    }

  } catch (e) {
    setMsg('#loginMsg', e.message || 'Auth error');
  } finally {
    await Busy.hide();
    if (button) button.removeAttribute('disabled');
  }
}

/* =========================
   Submit flow (quiet refresh for profile & throttled leaderboard)
   ========================= */
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`); }
function addClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.add(x)); }
function removeClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.remove(x)); }

async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin();
  if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$(`#ans-${id}`); const answer=(inp?.value||'').trim(); if(!answer){ const t=tileEl(id); showTileToast(t,'Enter an answer','info'); return; }
  const btn=ev.currentTarget; const tile=tileEl(id); if(!tile) return;

  cache.done.add(id); persistDone();

  removeClasses(tile,'success','fail','neutral','done'); addClasses(tile,'processing','locked');
  if(inp) inp.disabled=true; btn.disabled=true;

  let verdict='neutral', points=0;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ verdict='success'; points=Number(entry.points||0); } else { verdict='fail'; }
    }
  }catch{}

  const SWITCH_MS = 150;
  setTimeout(()=>{ removeClasses(tile,'processing'); addClasses(tile, verdict); }, SWITCH_MS);

  const TOAST_MS = 2000;
  if(verdict==='success'){
    const bal = Number($('#coinBalance')?.textContent||0) + points;
    $('#coinBalance') && ($('#coinBalance').textContent = bal);
    showTileToast(tile, `✅ Correct! +🪙 ${points}`, 'good');
  } else if(verdict==='fail'){ showTileToast(tile, '❌ Not quite — recorded.', 'bad'); }
  else { showTileToast(tile, 'ℹ️ Submitted.', 'info'); }

  setTimeout(()=>{ addClasses(tile,'moving'); tile.style.order='999'; }, TOAST_MS);

  const SHIMMER_TOTAL = 700 + 600;
  setTimeout(()=> addClasses(tile,'done'), SHIMMER_TOTAL);

  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok) throw new Error(res.error||'Submit failed');

    // QUIET refresh of profile (no panel overlay)
    (async () => {
      try {
        const prof = await jget({action:'getprofile', userId:uid});
        if (prof.ok) {
          cache.profile = cache.profile || { userId: uid };
          cache.profile.balance = prof.balance;
          cache.profile.displayName = prof.displayName || cache.profile.displayName;
          cache.profile.avatarId = prof.avatarId;
          cache.profile.avatarURL = prof.avatarURL;
          try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch{}
          saveTimestamp('profile');
          // make sure avatarURL is resolved if backend hadn't set it
          await ensureCurrentAvatarURL(uid);
          renderProfile(cache.profile);
          window.__profile = cache.profile;
        }
      } catch (e) {
        console.warn('quiet profile refresh failed after submit', e);
      }
    })();

    // THROTTLED leaderboard refresh (quiet, no overlay)
    const now = Date.now();
    if (now - lastLeaderboardRefresh > 30000) {
      (async () => {
        try {
          const lb = await jget({action:'leaderboard'});
          if(lb.ok) {
            cache.lb = lb.leaderboard;
            renderLeaderboard(lb.leaderboard);
            try{ localStorage.setItem(K.lb, JSON.stringify(cache.lb)); }catch{}
            saveTimestamp('leaderboard');
            lastLeaderboardRefresh = Date.now();
          }
        } catch (e) {
          console.warn('quiet leaderboard refresh failed', e);
        }
      })();
    }

    const act = (cache.acts||[]).find(a => a.activityId === id) || { title:id, points:0 };
    cache.archive = cache.archive.filter(x => x.activityId !== id);
    cache.archive.unshift({
      activityId:id,
      title: act.title || id,
      points: res.pointsAwarded ?? (verdict==='success'? (act.points||0) : 0),
      correct: (res.correct !== undefined ? res.correct : (verdict==='success'?true: verdict==='fail'?false:null)),
      answer,
      correctAnswer: act.correctAnswer || null,
      timestamp: new Date().toISOString()
    });
    saveArchive();
    renderArchive();

    setTimeout(()=>{
      tile.style.transform='scale(0.98)';
      tile.style.opacity='0.0';
      setTimeout(()=> tile.remove(), 260);
    }, SHIMMER_TOTAL + 400);
  } catch(e){
    cache.done.delete(id); persistDone();

    removeClasses(tile,'processing','success','fail','neutral','done','locked','moving');
    tile.style.order = '';
    if(inp) inp.disabled=false; btn.disabled=false; showTileToast(tile, e.message || 'Error', 'bad');
  }
}

/* =========================
   Events
   ========================= */
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

  const lbToggle = $('#lbToggle');
  if (lbToggle) {
    lbToggle.addEventListener('click', () => {
      cache.showFullLB = !cache.showFullLB;
      lbToggle.textContent = cache.showFullLB ? 'Show top 5' : 'Show all';
      renderLeaderboard(cache.lb || [], { limit: cache.showFullLB ? 20 : 5 });
    }, { passive: true });
  }
}

/* =========================
   Enter key handler
   ========================= */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.id === 'idOnly') {
    e.preventDefault();
    goToPin('login');
    return;
  }

  if (target.id === 'pin') {
    e.preventDefault();
    onPrimaryAuth();
    return;
  }

  if (target.id && target.id.startsWith('ans-')) {
    e.preventDefault();
    const actId = target.id.slice(4);
    const btn = document.querySelector(`button[data-id="${actId}"]`);
    if (btn && !btn.disabled) btn.click();
    return;
  }

  const submitSel = target.getAttribute('data-submit');
  if (submitSel) {
    e.preventDefault();
    const btn = document.querySelector(submitSel);
    if (btn && !btn.disabled) btn.click();
  }
});

/* =========================
   Boot
   ========================= */
async function boot(){
  if(!document.body.getAttribute('data-state')) setState('auth-id');
  wireEvents();
  loadTimestamps();

  const y=$('#year'); if(y) y.textContent=new Date().getFullYear();
  const build=$('#build'); if(build) build.textContent=(window.ASSET_VERSION||'dev');

  const theme = localStorage.getItem('cc.theme');
  document.documentElement.classList.toggle('light', theme==='light');
  const tt = $('#themeToggle'); if(tt){ tt.onclick = ()=>{ const light = !document.documentElement.classList.contains('light'); document.documentElement.classList.toggle('light', light); localStorage.setItem('cc.theme', light?'light':'dark'); }; }

  loadActivitiesFromStorage();
  loadLeaderboardFromStorage();
  loadProfileFromStorage();
  loadDoneFromStorage();
  loadArchive();
  renderArchive();

  if (cache.lb) {
    renderLeaderboardPreview(cache.lb);
  } else if (shouldRefresh('leaderboard', 5*60*1000)) {
    jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(lb.leaderboard); try{localStorage.setItem(K.lb, JSON.stringify(cache.lb));}catch{}; saveTimestamp('leaderboard'); lastLeaderboardRefresh = Date.now(); } }).catch(()=>{});
  }

  const uid=store.uid(), pin=store.pin();
  if(uid && pin){
    showApp();
    renderDash();

    // if cached profile has avatarId but no URL, quietly resolve it early
    if (cache.profile && cache.profile.avatarId && !cache.profile.avatarURL) {
      ensureCurrentAvatarURL(uid);
    }

    await Busy.show('Loading your dashboard…');
    try {
      await precacheCore(uid);
      renderDash();
      scheduleSecondaryFetches();
      await ensureAvatarFor(uid);
    } finally {
      await Busy.hide();
    }
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot, { once:true })
  : boot();
