// --- Config ---
const API = (window.APP_CONFIG && window.APP_CONFIG.API) || 'WEB_APP_URL_HERE';

// --- Busy helpers (must be defined before anything uses them) ---
var _busyRefCount = 0;
function beginBusy(){
  _busyRefCount++;
  const b = document.getElementById('refreshBtn');
  if (b) b.classList.add('btn-busy');
}
function endBusy(){
  _busyRefCount = Math.max(0, _busyRefCount - 1);
  if (_busyRefCount === 0) {
    const b = document.getElementById('refreshBtn');
    if (b) b.classList.remove('btn-busy');
  }
}

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
// --- Submissions ---
async function loadSubmittedSet(userId){
  try{
    const res = await fetch(API + '?action=getsubmissions&userId=' + encodeURIComponent(userId) + '&ts=' + Date.now());
    const data = await safeJson(res);
    if (data.ok){
      return new Set(data.submissions.map(s => s.activityId));
    }
  }catch(e){ logErr('loadSubmittedSet', e); }
  return new Set();
}

function applySubmissionLocks(submittedSet){
  if (!(submittedSet instanceof Set)) return;
  const tiles = activitiesEl.querySelectorAll('.tile');
  tiles.forEach(tile => {
    const id = tile.getAttribute('data-activity-id');
    if (!id) return;
    if (submittedSet.has(id)){
      tile.classList.add('disabled');
      tile.querySelector('textarea')?.setAttribute('disabled','');
      const btn = tile.querySelector('button.submit');
      if (btn){ btn.disabled = true; btn.textContent='Submitted'; }
      const res = tile.querySelector('.result');
      if (res && !res.textContent.trim()) res.textContent = 'You already submitted this activity.';
    }
  });
}

// --- Activities cache utils ---
function readActivitiesCache(){
  try{
    const raw = localStorage.getItem(ACT_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.activities || !o.signature) return null;
    if ((Date.now() - (o.ts || 0)) > ACT_CACHE_TTL_MS) return null;
    return o;
  }catch(e){ return null; }
}

function writeActivitiesCache(activities, signature){
  const o = { ts: Date.now(), signature, activities };
  localStorage.setItem(ACT_CACHE_KEY, JSON.stringify(o));
}

async function activitiesSignature(activities){
  const key = activities.map(a => [a.activityId, a.title, a.prompt, a.points, a.openIso, a.closeIso]);
  return await sha256Hex(JSON.stringify(key));
}

// --- Full refresh (parallel) ---
async function refreshAfterAuth(forceSync=false){
  const u = currentUser(); if(!u) return;

  const headPromises = [ loadProfile(), loadLeaderboard(), loadGradingMap() ];

  // Cache-first render if nothing visible
  if (!activitiesEl.childElementCount){
    const cached = readActivitiesCache();
    if (cached?.activities) renderActivities(cached.activities, new Set());
  }

  // Fetch submissions & activities in parallel
  const subsPromise = loadSubmittedSet(u.userId).then(set => { applySubmissionLocks(set); return set; });

  const cached = readActivitiesCache();
  const needServer = forceSync || !cached;

  beginBusy();
  try{
    const r = await fetch(API + '?action=getactivities&ts=' + Date.now());
    const d = await safeJson(r);
    if (d.ok){
      const sig = await activitiesSignature(d.activities||[]);
      if (!cached || sig !== cached.signature){
        writeActivitiesCache(d.activities||[], sig);
        renderActivities(d.activities||[], new Set());
        const set = await subsPromise.catch(()=>new Set());
        applySubmissionLocks(set);
      } else if (needServer){
        renderActivities(d.activities||[], new Set());
        const set = await subsPromise.catch(()=>new Set());
        applySubmissionLocks(set);
      }
    }
  }catch(e){ logErr('refreshAfterAuth:getactivities', e); } finally { endBusy(); }

  await Promise.allSettled(headPromises);
}

// --- Activities render + tile behavior ---
function renderActivities(acts, submittedSet){
  activitiesEl.innerHTML = '';
  if (acts && acts.length){
    acts.forEach(a => activitiesEl.appendChild(activityTile(a, submittedSet)));
  } else {
    activitiesEl.innerHTML = '<p class="muted">No open activities right now.</p>';
  }
}

function activityTile(a, submittedSet){
  const alreadySubmitted = submittedSet.has(a.activityId);
  const div = document.createElement('div');
  div.className = 'card tile' + (alreadySubmitted ? ' disabled' : '');
  div.setAttribute('data-activity-id', a.activityId || '');

  div.innerHTML = `
    <h3>${escapeHtml(a.title)}</h3>
    <p class="muted">${escapeHtml(a.prompt || '')}</p>
    <div class="flex"><span class="badge">${a.points||0} 🪙</span></div>
    <label>Your Answer
      <textarea rows="2" class="answer" ${alreadySubmitted ? 'disabled' : ''}></textarea>
    </label>
    <button class="submit" ${alreadySubmitted ? 'disabled' : ''}>${alreadySubmitted ? 'Submitted' : 'Submit'}</button>
    <p class="muted result">${alreadySubmitted ? 'You already submitted this activity.' : ''}</p>
  `;

  if (!alreadySubmitted){
    const ans = div.querySelector('.answer');
    const btn = div.querySelector('.submit');
    const res = div.querySelector('.result');

    btn.onclick = async () => {
      const u = currentUser();
      if (!u){ alert('Please login first.'); return; }
      const answer = ans.value.trim();
      if (!answer){ alert('Enter an answer.'); return; }

      // Local instant grading
      let displayedNeutral = false;
      const h = GRADING.hashes[a.activityId];
      if (GRADING.salt && h){
        const userHash = await sha256Hex(GRADING.salt + normalizeAnswer(answer));
        if (userHash === h) {
          const awardGuess = (a.points || GRADING.points[a.activityId] || 0);
          res.innerHTML = `<span class="ok">Correct! +${awardGuess} 🪙</span>`;
          showStatus(div, 'ok', 'Correct!');
        } else {
          res.innerHTML = `<span class="err">Not quite. Checking…</span>`;
          showStatus(div, 'err', 'Not quite');
        }
      } else {
        displayedNeutral = true;
        res.innerHTML = `<span class="muted">Submitting…</span>`;
        showStatus(div, 'warn', 'Submitted');
      }

      // Busy
      btn.disabled = true; ans.disabled = true; setTileBusy(div, true);

      try{
        const r = await fetch(API, { method:'POST', body: new URLSearchParams({
          action:'submitAnswer', userId:u.userId, pin:u.pin, activityId:a.activityId, answer
        })});
        const d = await safeJson(r);

        if (d.ok){
          const award = Number(d.pointsAwarded||0);
          if (d.correct === true){ res.innerHTML = `<span class="ok">Correct! +${award} 🪙</span>`; showStatus(div,'ok',`+${award} 🪙`); }
          else if (d.correct === false){ res.innerHTML = `<span class="err">Not quite. Keep trying!</span>`; showStatus(div,'err','Not quite'); }
          else { res.innerHTML = `<span class="muted">Submitted for review.</span>`; if (!displayedNeutral) showStatus(div,'warn','Submitted'); }

          if (typeof d.newBalance === 'number') balanceEl.textContent = d.newBalance;
          else loadProfile();

          btn.disabled = true; ans.disabled = true; btn.textContent = 'Submitted';
          div.classList.add('disabled'); loadLeaderboard();
        } else {
          if (d.error === 'already_submitted'){
            res.innerHTML = '<span class="muted">Already submitted previously.</span>';
            btn.disabled = true; ans.disabled = true; btn.textContent='Submitted';
            div.classList.add('disabled'); showStatus(div,'warn','Already submitted');
          } else {
            res.innerHTML = `<span class="err">Error: ${escapeHtml(d.error)}</span>`;
            btn.disabled = false; ans.disabled = false; btn.textContent='Submit';
            setTileBusy(div,false); clearStatus(div); return;
          }
        }
      }catch(e){
        logErr('submitAnswer', e);
        res.innerHTML = `<span class="err">Network error: ${escapeHtml(String(e.message||e))}</span>`;
        btn.disabled = false; ans.disabled = false; btn.textContent='Submit';
        setTileBusy(div,false); clearStatus(div); return;
      }

      setTileBusy(div,false);
    };
  }

  return div;
}

// --- Status & busy helpers ---
function showStatus(div, kind, text){
  clearStatus(div);
  const mask = document.createElement('div');
  mask.className = 'status-mask ' + (kind==='ok' ? 'status-ok' : kind==='err' ? 'status-err' : 'status-warn');
  mask.textContent = text || '';
  div.appendChild(mask);
}
function clearStatus(div){ div.querySelector('.status-mask')?.remove(); }

function setTileBusy(div, isBusy){
  if (isBusy) {
    if (!div.querySelector('.busy-mask')) {
      const mask = document.createElement('div');
      mask.className = 'busy-mask';
      mask.innerHTML = '<div class="busy-spinner" aria-label="Working…"></div>';
      div.style.position = 'relative';
      div.appendChild(mask);
    }
    div.classList.add('busy'); div.setAttribute('aria-busy','true');
  } else {
    div.querySelector('.busy-mask')?.remove();
    div.classList.remove('busy'); div.removeAttribute('aria-busy');
  }
}

// --- Grading map ---
async function loadGradingMap(){
  try{
    const res = await fetch(API + '?action=getgradingmap&ts=' + Date.now());
    const data = await safeJson(res);
    if (data.ok){
      GRADING.salt = data.salt; GRADING.hashes = {}; GRADING.points = {};
      (data.map||[]).forEach(({activityId, hash, points})=>{
        if (activityId && hash){ GRADING.hashes[activityId]=hash; GRADING.points[activityId]=points||0; }
      });
    }
  }catch(e){ logErr('loadGradingMap', e); }
}

// --- Initialize ---
uiUpdateAuth();
loadLeaderboard();
setInterval(loadLeaderboard, 30000);

if (currentUser()) {
  const cached = readActivitiesCache();
  if (cached?.activities) renderActivities(cached.activities, new Set());
  refreshAfterAuth(false);
}
