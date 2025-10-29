// --- Config ---
const API = (window.APP_CONFIG && window.APP_CONFIG.API) || 'WEB_APP_URL_HERE';

// --- Global state for client-side pregrading ---
let GRADING = { salt: null, hashes: {}, points: {} };

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

// --- Wire up buttons ---
document.getElementById('loginBtn').onclick = () => loginOrRegister('login');
document.getElementById('registerBtn').onclick = () => loginOrRegister('register');
document.getElementById('logoutBtn').onclick = logout;
document.getElementById('refreshBtn').onclick = () => refreshAfterAuth();

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
    await refreshAfterAuth();
    authMsg.innerHTML = kind==='register' ? '<span class="ok">Registered!</span>' : '<span class="ok">Logged in.</span>';
  }catch(e){
    authMsg.innerHTML = '<span class="err">Network error.</span>';
  }
}
function logout(){ setUser(null); uiUpdateAuth(); }

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

async function loadActivities(submittedSet = new Set()){
  const u = currentUser(); if(!u){ activitiesEl.innerHTML=''; return; }
  activitiesEl.innerHTML = '';
  try{
    const res = await fetch(API + '?action=getactivities&ts=' + Date.now());
    const data = await res.json();
    if (data.ok && data.activities.length){
      data.activities.forEach(a => activitiesEl.appendChild(activityTile(a, submittedSet)));
    } else {
      activitiesEl.innerHTML = '<p class="muted">No open activities right now.</p>';
    }
  }catch(e){
    activitiesEl.innerHTML = '<p class="muted">Could not load activities.</p>';
  }
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

// --- Coordinated refresh after login ---
async function refreshAfterAuth(){
  const u = currentUser(); if(!u) return;
  await Promise.all([ loadProfile(), loadLeaderboard(), loadGradingMap() ]);
  const submittedSet = await loadSubmittedSet(u.userId);
  await loadActivities(submittedSet);
}

// --- Tile rendering with optimistic submit ---
function activityTile(a, submittedSet){
  const alreadySubmitted = submittedSet.has(a.activityId);
  const div = document.createElement('div');
  div.className = 'card tile' + (alreadySubmitted ? ' disabled' : '');

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

      // 1) Local instant check (if we have a hash)
      let localCorrect = null;
      const h = GRADING.hashes[a.activityId];
      if (GRADING.salt && h){
        const userHash = await sha256Hex(GRADING.salt + normalizeAnswer(answer));
        localCorrect = (userHash === h);
        if (localCorrect === true) {
          const awardGuess = (a.points || GRADING.points[a.activityId] || 0);
          res.innerHTML = `<span class="ok">Correct! +${awardGuess} 🪙</span>`;
        } else {
          res.innerHTML = `<span class="muted">Submitting for grading…</span>`;
        }
      } else {
        res.innerHTML = `<span class="muted">Submitting…</span>`;
      }

      // 2) Lock UI during submit
      btn.disabled = true; btn.textContent = 'Submitting…';

      // 3) Send to server (source of truth)
      try{
        const r = await fetch(API, {
          method:'POST',
          body: new URLSearchParams({
            action:'submitAnswer', userId:u.userId, pin:u.pin, activityId:a.activityId, answer
          })
        });
        const d = await r.json();

        if (d.ok){
          // Reconcile with server
          const award = Number(d.pointsAwarded||0);
          if (d.correct === true){
            res.innerHTML = `<span class="ok">Correct! +${award} 🪙</span>`;
          } else if (d.correct === false){
            res.innerHTML = `<span class="err">Not quite. Keep trying!</span>`;
          } else {
            res.innerHTML = `<span class="muted">Submitted for review.</span>`;
          }

          // Update balance instantly from server
          if (typeof d.newBalance === 'number'){
            balanceEl.textContent = d.newBalance;
          } else {
            loadProfile(); // fallback
          }

          // Lock tile permanently
          btn.disabled = true;
          btn.textContent = 'Submitted';
          ans.disabled = true;
          div.classList.add('disabled');

          // Background leaderboard refresh
          loadLeaderboard();

        } else {
          if (d.error === 'already_submitted') {
            btn.disabled = true;
            btn.textContent = 'Submitted';
            ans.disabled = true;
            div.classList.add('disabled');
            res.innerHTML = '<span class="muted">Already submitted previously.</span>';
          } else {
            res.innerHTML = `<span class="err">Error: ${d.error}</span>`;
            btn.disabled = false; btn.textContent = 'Submit';
          }
        }
      }catch(e){
        res.innerHTML = `<span class="err">Network error.</span>`;
        btn.disabled = false; btn.textContent = 'Submit';
      }
    };
  }

  return div;
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

// --- Initial landing: Auth + Leaderboard only ---
uiUpdateAuth();
loadLeaderboard();
setInterval(loadLeaderboard, 30000); // optional projector refresh

// If a user is already logged in, immediately load their submissions + activities + grading map
if (currentUser()) {
  refreshAfterAuth();
}
