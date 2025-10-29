// --- Config ---
const API = (window.APP_CONFIG && window.APP_CONFIG.API) || 'WEB_APP_URL_HERE';

// --- Client-side pregrading ---
let GRADING = { salt: null, hashes: {}, points: {} };

// --- Activities cache ---
const ACT_CACHE_KEY = 'ACTIVITIES_CACHE_V1'; // { ts, signature, activities: [...] }
const ACT_CACHE_TTL_MS = 1000 * 60 * 10;     // 10 minutes

// --- DOM refs (auth) ---
const authEl = document.getElementById('auth');
const stepUid = document.getElementById('step-uid');
const stepPin = document.getElementById('step-pin');
const stepReg = document.getElementById('step-register');

const continueBtn = document.getElementById('continueBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const backToIdBtn = document.getElementById('backToIdBtn');
const backToIdBtn2 = document.getElementById('backToIdBtn2');

const userIdEl = document.getElementById('userId');
const pinEl = document.getElementById('pin');
const pinNewEl = document.getElementById('pinNew');
const displayNameEl = document.getElementById('displayName');
const helloNameEl = document.getElementById('helloName');
const authMsg = document.getElementById('authMsg');

// --- DOM refs (main) ---
const profileEl = document.getElementById('profile');
const greetingEl = document.getElementById('greeting');
const balanceEl = document.getElementById('balance');
const boardBody = document.getElementById('boardBody');
const activitiesEl = document.getElementById('activities');
const activitiesCard = document.getElementById('activitiesCard');
const refreshBtn = document.getElementById('refreshBtn');

// --- Helpers ---
function logErr(ctx, e){ console.error('[UI]', ctx, e); }
async function safeJson(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0,160)}...`);
  }
  return res.json();
}

// --- Wire buttons ---
continueBtn.onclick = handleContinue;
loginBtn.onclick = () => loginOrRegister('login');
registerBtn.onclick = () => loginOrRegister('register');
backToIdBtn.onclick = showIdStep;
backToIdBtn2.onclick = showIdStep;
document.getElementById('logoutBtn').onclick = logout;
refreshBtn.onclick = () => refreshAfterAuth(true);

// --- Auth state ---
function currentUser(){
  const u = localStorage.getItem('userId');
  const p = localStorage.getItem('pin');
  return (u && p) ? {userId:u, pin:p} : null;
}
function setUser(u){
  if (u){ localStorage.setItem('userId',u.userId); localStorage.setItem('pin',u.pin); }
  else { localStorage.removeItem('userId'); localStorage.removeItem('pin'); }
}
function uiUpdateAuth(){
  const u = currentUser();
  if (u){
    authEl.style.display = 'none';
    profileEl.style.display = 'block';
    greetingEl.textContent = `Hello, ${u.userId}`;
    activitiesCard.style.display = '';
  } else {
    authEl.style.display = 'block';
    profileEl.style.display = 'none';
    activitiesCard.style.display = 'none';
    activitiesEl.innerHTML = '';
    showIdStep();
  }
}

// --- Multi-stage auth UI ---
function showIdStep(){
  stepUid.style.display = '';
  stepPin.style.display = 'none';
  stepReg.style.display = 'none';
  authMsg.textContent = '';
}
function showPinStep(name){
  stepUid.style.display = 'none';
  stepPin.style.display = '';
  stepReg.style.display = 'none';
  helloNameEl.textContent = name || '';
  authMsg.textContent = '';
  pinEl.value = '';
  pinEl.focus();
}
function showRegisterStep(){
  stepUid.style.display = 'none';
  stepPin.style.display = 'none';
  stepReg.style.display = '';
  authMsg.textContent = '';
  displayNameEl.value = '';
  pinNewEl.value = '';
  displayNameEl.focus();
}

// --- Busy ref-counter for refresh spinner ---
let _busyRefCount = 0;
function beginBusy(){ _busyRefCount++; refreshBtn?.classList.add('btn-busy'); }
function endBusy(){ _busyRefCount = Math.max(0,_busyRefCount-1); if (_busyRefCount===0) refreshBtn?.classList.remove('btn-busy'); }

// --- Pre-warm activities cache on first visit ---
(async function prewarmActivities(){
  const cached = readActivitiesCache();
  if (!cached){
    beginBusy();
    try{
      const r = await fetch(API+'?action=getactivities&ts='+Date.now());
      const d = await safeJson(r);
      if (d.ok){
        const sig = await activitiesSignature(d.activities||[]);
        writeActivitiesCache(d.activities||[], sig);
      }
    }catch(e){ logErr('prewarmActivities', e); } finally { endBusy(); }
  }
})();

// --- Continue → checks user via POST; prefetches activities & submissions ---
async function handleContinue(){
  const userId = (userIdEl.value||'').trim();
  if (!userId){ authMsg.textContent='Enter a User ID.'; return; }
  authMsg.textContent = 'Checking…';

  try{
    const res = await fetch(API, {
      method: 'POST',
      body: new URLSearchParams({ action:'checkuser', userId, ts: Date.now() })
    });
    const data = await safeJson(res);
    if (!data.ok){ authMsg.innerHTML = `<span class="err">Error: ${escapeHtml(data.error||'unknown')}</span>`; return; }

    const cached = readActivitiesCache();
    if (!cached){
      beginBusy();
      try{
        const r = await fetch(API+'?action=getactivities&ts='+Date.now());
        const d = await safeJson(r);
        if (d.ok){
          const sig = await activitiesSignature(d.activities||[]);
          writeActivitiesCache(d.activities||[], sig);
        }
      }catch(e){ logErr('ensure cache', e); } finally { endBusy(); }
    }

    if (data.exists){
      localStorage.setItem('PREFETCH_USER', userId);
      prefetchSubmissions(userId);
      showPinStep(data.displayName || userId);
    } else {
      showRegisterStep();
    }
  }catch(e){
    logErr('handleContinue', e);
    authMsg.innerHTML = `<span class="err">Login setup failed: ${escapeHtml(String(e.message||e))}</span>`;
  }
}

async function prefetchSubmissions(userId){
  try{
    const res = await fetch(API + '?action=getsubmissions&userId=' + encodeURIComponent(userId) + '&ts=' + Date.now());
    const data = await safeJson(res);
    if (data.ok){
      sessionStorage.setItem('SUBMIT_CACHE_'+userId, JSON.stringify(data.submissions||[]));
    }
  }catch(e){ logErr('prefetchSubmissions', e); }
}

// --- Login / Register ---
async function loginOrRegister(kind){
  const userId = (userIdEl.value||'').trim();
  const pin = (kind==='register' ? pinNewEl.value : pinEl.value);
  if (!userId || !pin){ authMsg.textContent='Missing fields.'; return; }
  authMsg.textContent='…';

  const body = new URLSearchParams({ action: kind, userId, pin });
  if (kind==='register'){
    body.set('displayName', (displayNameEl.value||userId).trim().slice(0,40));
  } else {
    body.set('displayName', userId);
  }

  try{
    const res = await fetch(API, { method:'POST', body });
    const data = await safeJson(res);
    if (!data.ok){ authMsg.innerHTML = `<span class="err">Error: ${escapeHtml(data.error||'unknown')}</span>`; return; }

    setUser({userId, pin});
    uiUpdateAuth();

    const cached = readActivitiesCache();
    renderActivities(cached ? cached.activities : [], new Set());

    const pref = sessionStorage.getItem('SUBMIT_CACHE_'+userId);
    if (pref){
      const set = new Set(JSON.parse(pref).map(s=>s.activityId));
      applySubmissionLocks(set);
    }

    await refreshAfterAuth(false);

    authMsg.innerHTML = (kind==='register')
      ? '<span class="ok">Registered!</span>'
      : '<span class="ok">Logged in.</span>';

  }catch(e){
    logErr('loginOrRegister', e);
    authMsg.innerHTML = `<span class="err">Network error: ${escapeHtml(String(e.message||e))}</span>`;
  }
}

function logout(){ setUser(null); uiUpdateAuth(); }

// --- Profile / Leaderboard ---
async function loadProfile(){
  const u = currentUser(); if(!u) return;
  try{
    const res = await fetch(API + '?action=getprofile&userId=' + encodeURIComponent(u.userId) + '&ts=' + Date.now());
    const data = await safeJson(res);
    if (data.ok){
      balanceEl.textContent = data.balance;
      greetingEl.textContent = `Hello, ${u.userId}`;
    }
  }catch(e){ logErr('loadProfile', e); }
}
async function loadLeaderboard(){
  try{
    const res = await fetch(API + '?action=leaderboard&ts=' + Date.now());
    const data = await safeJson(res);
    boardBody.innerHTML = '';
    if (data.ok){
      data.leaderboard.forEach((row,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(row.name)}</td><td>${row.score}</td>`;
        boardBody.appendChild(tr);
      });
    }
  }catch(e){ logErr('loadLeaderboard', e); }
}

// --- Helpers, cache, etc. (unchanged below) ---
function escapeHtml(s){ const p=document.createElement('p'); p.textContent=s||''; return p.innerHTML; }
function normalizeAnswer(s){ return (s||'').trim().toLowerCase(); }
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const b = Array.from(new Uint8Array(buf));
  return b.map(x => x.toString(16).padStart(2,'0')).join('');
}
