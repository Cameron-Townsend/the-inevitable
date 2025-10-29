// --- Config ---
const API = (window.APP_CONFIG && window.APP_CONFIG.API) || 'WEB_APP_URL_HERE';

// --- Global state for client-side pregrading ---
let GRADING = { salt: null, hashes: {}, points: {} };

// --- Activities cache keys ---
const ACT_CACHE_KEY = 'ACTIVITIES_CACHE_V1';     // { ts, signature, activities: [...] }
const ACT_CACHE_TTL_MS = 1000 * 60 * 10;         // 10 minutes

// --- DOM refs ---
const authEl = document.getElementById('auth');
const profileEl = document.getElementById('profile');
const greetingEl = document.getElementById('greeting');
const balanceEl = document.getElementById('balance');
const boardBody = document.getElementById('boardBody');
const activitiesEl = document.getElementById('activities');
const activitiesCard = document.getElementById('activitiesCard');

const userIdEl = document.getElementById('userId');
const pinEl = document.getElementById('pin');
const authMsg = document.getElementById('authMsg');

const refreshBtn = document.getElementById('refreshBtn');

// --- Wire up buttons ---
document.getElementById('loginBtn').onclick = () => loginOrRegister('login');
document.getElementById('registerBtn').onclick = () => loginOrRegister('register');
document.getElementById('logoutBtn').onclick = logout;
refreshBtn.onclick = () => refreshAfterAuth(true); // manual refresh may force sync

// --- Auth state helpers ---
function currentUser(){
  const u = localStorage.getItem('userId');
  const p = localStorage.getItem('pin');
  return (u && p) ? {userId:u, pin:p} : null;
}
function setUser(u){
  if(u){ localStorage.setItem('userId',u.userId); localStorage.setItem('pin',u.pin); }
  else { localStorage.removeItem('userId'); localStorage.removeItem('pin'); }
}
function uiUpdateAuth(){
  const u = currentUser();
  if(u){
    authEl.style.display = 'none';
    profileEl.style.display = 'block';
    greetingEl.textContent = `Hello, ${u.userId}`;
    activitiesCard.style.display = '';
  }else{
    authEl.style.display = 'block';
    profileEl.style.display = 'none';
    activitiesCard.style.display = 'none';
    activitiesEl.innerHTML = '';
  }
}

// --- Auth endpoints ---
async function loginOrRegister(kind){
  const userId = userIdEl.value.trim();
  const pin = pinEl.value;
  if (!userId || !pin){ authMsg.textContent='Enter ID and PIN.'; return; }
  authMsg.textContent='…';
  try{
    const res = await fetch(API, {
      method:'POST',
      body: new URLSearchParams({ action: kind, userId, pin, displayName:userId })
    });
    const data = await res.json();
    if (!data.ok){ authMsg.innerHTML = `<span class="err">Error: ${data.error}</span>`; return; }
    setUser({userId, pin});
    uiUpdateAuth();
    await refreshAfterAuth(false); // allow cache-first on first login
    authMsg.innerHTML = kind==='register' ? '<span class="ok">Registered!</span>' : '<span class="ok">Logged in.</span>';
  }catch(e){
    authMsg.innerHTML = '<span class="err">Network error.</span>';
  }
}
function logout(){ setUser(null); uiUpdateAuth(); }

// --- Busy ref-counter for refresh spinner (prevents flicker) ---
let _busyRefCount = 0;
function beginBusy(){ _busyRefCount++; if (refreshBtn) refreshBtn.classList.add('btn-busy'); }
function endBusy(){ _busyRefCount = Math.max(0, _busyRefCount-1); if (_busyRefCount===0 && refreshBtn) refreshBtn.classList.remove('btn-busy'); }

// --- Data loads ---
async function loadProfile(){
  const u = currentUser(); if(!u) return;
  try{
    const res = await fetch(API + '?action=getprofile&userId=' + encodeURIComponent(u.userId) + '&ts=' + Date.now());
    const data = await res.json();
    if (data.ok){
      balanceEl.textContent = data.balance;
      greetingEl.textContent = `Hello, ${u.userId}`;
    }
  }catch(e){}
}

async function loadLeaderboard(){
  try{
    const res = await fetch(API + '?action=leaderboard&ts=' + Date.now());
    const data = await res.json();
    boardBody.innerHTML = '';
    if (data.ok){
      data.leaderboard.forEach((row,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(row.name)}</td><td>${row.score}</td>`;
        boardBody.appendChild(tr);
      });
    }
  }catch(e){}
}

async function loadSubmittedSet(userId){
  try{
    const res = await fetch(API + '?action=getsubmissions&userId=' + encodeURIComponent(userId) + '&ts=' + Date.now());
    const data = await res.json();
    if (data.ok){
      return new Set(data.submissions.map(s => s.activityId));
    }
  }catch(e){}
  return new Set();
}

// === Activities Caching ===
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

// Two-stage load: render cached instantly, then sync server + submissions in parallel
async function refreshAfterAuth(forceSync=false){
  const u = currentUser(); if(!u) return;

  // Kick off header data in parallel (profile/leaderboard/grading)
  const headPromises = [ loadProfile(), loadLeaderboard(), loadGradingMap() ];

  // 1) Instant render from cache (even before submissions)
  const cached = readActivitiesCache();
  if (cached && cached.activities){
    renderActivities(cached.activities, new Set());
  } else {
    activitiesEl.innerHTML = '<p class="muted">Loading activities…</p>';
  }

  // 2) In parallel: fetch submissions and (optionally) fresh activities
  const submissionsPromise = loadSubmittedSet(u.userId).then(set => {
    applySubmissionLocks(set); // update tiles in place
    return set;
  });

  // Decide whether to force server load
  const needServerLoad = forceSync || !cached;

  const activitiesPromise = (async () => {
    if (!needServerLoad){
      // Background signature check (no flicker)
      beginBusy();
      try{
        const res = await fetch(API + '?action=getactivities&ts=' + Date.now());
        const data = await res.json();
        if (!data.ok) return cached ? cached.activities : [];
        const sig = await activitiesSignature(data.activities || []);
        if (!cached || sig !== cached.signature){
          writeActivitiesCache(data.activities || [], sig);
          renderActivities(data.activities || [], new Set()); // render quickly...
          // ...then re-apply submission locks when submissions arrive
          const set = await submissionsPromise.catch(()=>new Set());
          applySubmissionLocks(set);
          return data.activities || [];
        }
        return cached.activities || [];
      } finally { endBusy(); }
    } else {
      // No cache or forced: fetch and render now
      beginBusy();
      try{
        const res = await fetch(API + '?action=getactivities&ts=' + Date.now());
        const data = await res.json();
        if (data.ok){
          const sig = await activitiesSignature(data.activities || []);
          writeActivitiesCache(data.activities || [], sig);
          renderActivities(data.activities || [], new Set());
          const set = await submissionsPromise.catch(()=>new Set());
          applySubmissionLocks(set);
          return data.activities || [];
        } else {
          activitiesEl.innerHTML = '<p class="muted">Could not load activities.</p>';
          return [];
        }
      } catch(e){
        activitiesEl.innerHTML = '<p class="muted">Could not load activities.</p>';
        return [];
      } finally { endBusy(); }
    }
  })();

  // Wait for header fetches (not blocking UI render)
  await Promise.allSettled(headPromises);
  // If nothing cached and server failed, at least submissions applied to whatever is visible
  await Promise.allSettled([submissionsPromise, activitiesPromise]);
}

function renderActivities(activities, submittedSet){
  activitiesEl.innerHTML = '';
  if (activities && activities.length){
    activities.forEach(a => activitiesEl.appendChild(activityTile(a, submittedSet)));
  } else {
    activitiesEl.innerHTML = '<p class="muted">No open activities right now.</p>';
  }
}

// Apply "already submitted" state without re-rendering all tiles
function applySubmissionLocks(submittedSet){
  if (!(submittedSet instanceof Set)) return;
  const tiles = activitiesEl.querySelectorAll('.tile');
  tiles.forEach(tile => {
    const id = tile.getAttribute('data-activity-id');
    if (!id) return;
    if (submittedSet.has(id)){
      tile.classList.add('disabled');
      const ta = tile.querySelector('textarea'); if (ta) ta.disabled = true;
      const btn = tile.querySelector('button.submit'); if (btn){ btn.disabled = true; btn.textContent='Submitted'; }
      const res = tile.querySelector('.result'); if (res && !res.textContent.trim()) res.textContent = 'You already submitted this activity.';
    }
  });
}

// --- Preload grading map (salt + hashed answers) ---
async function loadGradingMap(){
  try{
    const res = await fetch(API + '?action=getgradingmap&ts=' + Date.now());
    const data = await res.json();
    if (data.ok){
      GRADING.salt = data.salt;
      GRADING.hashes = {};
      GRADING.points = {};
      (data.map || []).forEach(({activityId, hash, points})=>{
        if (activityId && hash){
          GRADING.hashes[activityId] = hash;
          GRADING.points[activityId] = points || 0;
        }
      });
    }
  }catch(e){}
}

// --- Tile rendering with optimistic submit + busy + status overlays ---
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

      // --- Local grading (instant yes/no if we have a hash) ---
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

      // --- Enter busy state (blocks input on this tile) ---
      btn.disabled = true;
      ans.disabled = true;
      setTileBusy(div, true);

      // --- Send to server (source of truth) ---
      try{
        const r = await fetch(API, {
          method:'POST',
          body: new URLSearchParams({
            action:'submitAnswer', userId:u.userId, pin:u.pin, activityId:a.activityId, answer
          })
        });
        const d = await r.json();

        if (d.ok){
          const award = Number(d.pointsAwarded||0);
          if (d.correct === true){
            res.innerHTML = `<span class="ok">Correct! +${award} 🪙</span>`;
            showStatus(div, 'ok', `+${award} 🪙`);
          } else if (d.correct === false){
            res.innerHTML = `<span class="err">Not quite. Keep trying!</span>`;
            showStatus(div, 'err', 'Not quite');
          } else {
            res.innerHTML = `<span class="muted">Submitted for review.</span>`;
            if (!displayedNeutral) showStatus(div, 'warn', 'Submitted');
          }

          if (typeof d.newBalance === 'number'){
            balanceEl.textContent = d.newBalance;
          } else {
            loadProfile(); // fallback
          }

          // Lock tile permanently after a recorded attempt
          btn.disabled = true;
          ans.disabled = true;
          btn.textContent = 'Submitted';
          div.classList.add('disabled');
          loadLeaderboard(); // background refresh
        } else {
          if (d.error === 'already_submitted') {
            res.innerHTML = '<span class="muted">Already submitted previously.</span>';
            btn.disabled = true;
            ans.disabled = true;
            btn.textContent = 'Submitted';
            div.classList.add('disabled');
            showStatus(div, 'warn', 'Already submitted');
          } else {
            // Server rejected — allow retry
            res.innerHTML = `<span class="err">Error: ${d.error}</span>`;
            btn.disabled = false;
            ans.disabled = false;
            btn.textContent = 'Submit';
            setTileBusy(div, false);
            clearStatus(div);
            return;
          }
        }
      }catch(e){
        res.innerHTML = `<span class="err">Network error.</span>`;
        btn.disabled = false;
        ans.disabled = false;
        btn.textContent = 'Submit';
        setTileBusy(div, false);
        clearStatus(div);
        return;
      }

      // Finalize busy state (tile is now submitted/locked)
      setTileBusy(div, false);
    };
  }

  return div;
}

// --- Status overlay helpers ---
function showStatus(div, kind, text){
  clearStatus(div);
  const mask = document.createElement('div');
  mask.className = 'status-mask ' + (
    kind === 'ok' ? 'status-ok' :
    kind === 'err' ? 'status-err' :
    'status-warn'
  );
  mask.textContent = text || '';
  div.appendChild(mask);
}
function clearStatus(div){
  const m = div.querySelector('.status-mask');
  if (m) m.remove();
}

// --- Utilities ---
function escapeHtml(s){ const p=document.createElement('p'); p.textContent=s||''; return p.innerHTML; }
function normalizeAnswer(s){ return (s||'').trim().toLowerCase(); }
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const b = Array.from(new Uint8Array(buf));
  return b.map(x => x.toString(16).padStart(2,'0')).join('');
}

// Per-tile busy overlay helper
function setTileBusy(div, isBusy){
  if (isBusy) {
    if (!div.querySelector('.busy-mask')) {
      const mask = document.createElement('div');
      mask.className = 'busy-mask';
      mask.innerHTML = '<div class="busy-spinner" aria-label="Working…"></div>';
      div.style.position = 'relative';
      div.appendChild(mask);
    }
    div.classList.add('busy');
    div.setAttribute('aria-busy', 'true');
  } else {
    const mask = div.querySelector('.busy-mask');
    if (mask) mask.remove();
    div.classList.remove('busy');
    div.removeAttribute('aria-busy');
  }
}

// --- Initial landing: Auth + Leaderboard only ---
uiUpdateAuth();
loadLeaderboard();
setInterval(loadLeaderboard, 30000); // optional projector refresh

// If a user is already logged in, immediately show cached activities (if any) and sync
if (currentUser()) {
  refreshAfterAuth(false);
}
