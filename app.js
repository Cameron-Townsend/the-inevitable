// ==== Config via external config.js ====
const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if(!WEB_APP_URL){ console.error('WEB_APP_URL missing. Set it in config.js'); }

// ==== Storage Keys ====
const K = { uid:'cc.uid', pin:'cc.pin', prof:'cc.profile', acts:'cc.activities', subs:'cc.subs', lb:'cc.lb', gm:'cc.grading' };

// Storage helpers (PIN in session unless "remember")
const store = {
  set(uid, pin, remember){ localStorage.setItem(K.uid, uid); (remember? localStorage: sessionStorage).setItem(K.pin, pin); if(!remember) localStorage.removeItem(K.pin); },
  clear(){ localStorage.removeItem(K.uid); localStorage.removeItem(K.pin); sessionStorage.removeItem(K.pin); },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};

// Basic fetch wrappers
const jget  = p   => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET' }).then(r=>r.json());
// Use form-encoded POST to avoid CORS preflight
const jpost = body => fetch(WEB_APP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
  body: new URLSearchParams(body)
}).then(r => r.json());

// DOM helpers
const $ = s => document.querySelector(s);
const setMsg = (id, m)=>{ $(id).textContent = m||''; };

// Toasts
let toastTimer=null;
function showToast(msg, kind=''){ const t=$('#toast'); t.textContent=msg; t.className='toast '+(kind||''); t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400); }

// Crypto helpers for client pre‑grading
const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join('');
}

// Cached state
const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set(), authMode:'login' /* or 'register' */ };

function renderProfile(p){
  $('#displayName').textContent = p.displayName||p.userId;
  $('#coinBalance').textContent = p.balance??0;
}
function renderLeaderboard(rows){
  const ol=$('#leaderboard'); ol.innerHTML='';
  (rows||[]).forEach((r,i)=>{
    const li=document.createElement('li');
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';
    li.textContent=`${medal} ${r.name} — 🪙 ${r.score}`;
    ol.appendChild(li);
  });
}
function renderLeaderboardPreview(rows){
  const ol=$('#leaderboardPreview'); ol.innerHTML='';
  (rows||[]).slice(0,8).forEach((r,i)=>{
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅';
    const li=document.createElement('li');
    li.textContent=`${medal} ${r.name} — ${r.score}`;
    ol.appendChild(li);
  });
}
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`) }
function setTileState(id, state){ // state: 'processing' | 'success' | 'fail' | 'neutral' | ''
  const el = tileEl(id); if(!el) return;
  el.classList.remove('processing','success','fail','neutral');
  if(state){ el.classList.add(state); }
  // lock interaction during visual states
  if(state==='processing' || state==='success' || state==='fail' || state==='neutral'){ el.classList.add('locked'); }
  else { el.classList.remove('locked'); }
}
function renderActivities(list, doneSet){
  const wrap=$('#activities'); wrap.innerHTML='';
  (list||[]).forEach(a=>{
    const done = doneSet.has(a.activityId);
    const div=document.createElement('div');
    div.className='activity'+(done?' done locked':'');
    div.setAttribute('data-tile', a.activityId);
    const icon = '🧠';
    div.innerHTML=`<h3>${icon} ${a.title}</h3>
      <p>${a.prompt||''}</p>
      <p>Worth <strong>🪙 ${a.points}</strong></p>
      <div class="row">
        <input placeholder="Your answer" id="ans-${a.activityId}" ${done?'disabled':''}>
        <button data-id="${a.activityId}" ${done?'disabled':''}>Submit</button>
      </div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', onSubmit));
}

async function precacheFor(uid){
  $('#precacheHint').classList.remove('hidden');
  const [acts, lb, gm, subs, prof] = await Promise.all([
    jget({action:'getactivities'}),
    jget({action:'leaderboard'}),
    jget({action:'getgradingmap'}),
    uid ? jget({action:'getsubmissions', userId:uid}) : Promise.resolve({ok:true, submissions:[]}),
    uid ? jget({action:'getprofile', userId:uid}) : Promise.resolve({ok:true, userId:uid, balance:0})
  ]);
  if(acts.ok) { cache.acts = acts.activities; localStorage.setItem(K.acts, JSON.stringify(cache.acts)); }
  if(lb.ok)   { cache.lb   = lb.leaderboard; localStorage.setItem(K.lb, JSON.stringify(cache.lb)); renderLeaderboardPreview(cache.lb); }
  if(gm.ok)   { cache.gm   = gm; localStorage.setItem(K.gm, JSON.stringify(cache.gm)); }
  if(subs.ok) { cache.done = new Set((subs.submissions||[]).map(s=>s.activityId)); localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }
  if(prof.ok) { cache.profile = { userId:uid, balance:prof.balance, displayName:prof.displayName }; localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }
  $('#precacheHint').classList.add('hidden');
}

// View helpers
function showAuth(){ $('#authLayout').classList.remove('hidden'); $('#pinPanel').classList.add('hidden'); $('#dashboard').classList.add('hidden'); $('#themeToggle').classList.remove('hidden'); }
function showPin(){ $('#authLayout').classList.add('hidden'); $('#pinPanel').classList.remove('hidden'); $('#dashboard').classList.add('hidden'); $('#themeToggle').classList.remove('hidden'); }
function showApp(){ $('#authLayout').classList.add('hidden'); $('#pinPanel').classList.add('hidden'); $('#dashboard').classList.remove('hidden'); $('#themeToggle').classList.add('hidden'); }
function hideAuthPanels(){ $('#authLayout').classList.add('hidden'); $('#pinPanel').classList.add('hidden'); $('#themeToggle').classList.add('hidden'); }

function renderDash(){
  hideAuthPanels();
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderLeaderboard(cache.lb||[]);
  renderActivities(cache.acts||[], cache.done||new Set());
}

// Step 1 actions
async function goToPin(mode){
  cache.authMode = mode; // 'login' or 'register'
  const uid = $('#idOnly').value.trim();
  if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg','');
  $('#idLoginBtn').disabled = true; $('#idRegisterBtn').disabled = true;
  try{
    // Remember username immediately for both flows
    localStorage.setItem(K.uid, uid);
    // Load preview if not already
    if(!cache.lb){ const lb = await jget({action:'leaderboard'}); if(lb.ok) { cache.lb = lb.leaderboard; renderLeaderboardPreview(cache.lb); } }
    // Check user
    const check = await jget({action:'checkuser', userId:uid});
    const exists = check.ok && check.exists;
    const name = exists ? (check.displayName || uid) : uid;
    $('#helloName').textContent = (mode==='login')
      ? (exists ? `Welcome back, ${name}!` : `Not registered yet — let's create your account, ${name}.`)
      : `Create your account, ${name}`;
    // If they pressed Login but account doesn't exist, auto-switch to register mode
    if(mode==='login' && !exists){ cache.authMode = 'register'; showToast('User not found — switching to Register.', 'bad'); $('#primaryAuthBtn').textContent = 'Register'; }
    else { $('#primaryAuthBtn').textContent = (cache.authMode==='login'?'Login':'Register'); }
    // Precache while they type PIN
    precacheFor(uid).catch(()=>{});
    // Move to PIN step
    showPin();
  }catch(e){ setMsg('#idMsg', e.message); }
  finally{ $('#idLoginBtn').disabled = false; $('#idRegisterBtn').disabled = false; }
}

// Step 2 actions
async function onPrimaryAuth(){
  const uid = store.uid() || $('#idOnly').value.trim();
  const pin = $('#pin').value.trim();
  const remember=$('#rememberPin').checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  try{
    $('#primaryAuthBtn').disabled = true;
    if(cache.authMode==='register'){
      const displayName = uid; // default display name
      const res= await jpost({ action:'register', userId:uid, pin, displayName });
      if(!res.ok){ throw new Error(res.error||'Register failed'); }
      showToast('Registered! Logging you in…','good');
    }
    const res= await jpost({ action:'login', userId:uid, pin });
    if(!res.ok){ throw new Error(res.error||'Login failed'); }
    store.set(uid, pin, remember); setMsg('#loginMsg','');

    // Ensure caches (activities etc.) then render
    if(!cache.acts) await precacheFor(uid);

    // Update profile with server-confirmed balance/name
    const prof = await jget({action:'getprofile', userId:uid});
    if(prof.ok){ cache.profile = { userId:uid, balance:prof.balance, displayName:res.displayName||uid }; }

    hideAuthPanels();
    renderDash();
  } catch(e){ setMsg('#loginMsg', e.message); }
  finally{ $('#primaryAuthBtn').disabled = false; }
}

// Submit with inline toasts and overlays
async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin(); if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$('#ans-'+id); const answer=(inp.value||'').trim(); if(!answer){ showToast('Enter an answer','bad'); return; }

  const tile = tileEl(id);
  // Lock and show busy overlay
  setTileState(id, 'processing');
  inp.disabled=true; ev.currentTarget.disabled=true;

  // Client pre‑grade (still show busy during hashing)
  let instantCorrect = null; let points=0; let hasKey=false;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      hasKey = true;
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ instantCorrect = true; points = Number(entry.points||0); }
    }
  }catch{}

  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok){ throw new Error(res.error||'Submit failed'); }

    // Decide final state
    if(res.correct === true){
      setTileState(id, 'success');
      cache.done.add(id);
      // Optimistic coin bump if needed
      if(!instantCorrect){ const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok) $('#coinBalance').textContent = prof.balance; }
      else { const bal = Number($('#coinBalance').textContent||0) + points; $('#coinBalance').textContent = bal; }
      showToast(`✅ Correct! +🪙 ${res.pointsAwarded||points}`,'good');
      // Mark done & keep disabled
      tile.classList.add('done','locked');
    } else if(res.correct === false){
      setTileState(id, 'fail');
      showToast('❌ Not quite — try again later.','bad');
      // Re-enable after glow ends
      setTimeout(()=>{ setTileState(id, ''); inp.disabled=false; ev.currentTarget.disabled=false; }, 900);
    } else { // null (no right/wrong)
      setTileState(id, 'neutral');
      showToast('ℹ️ Submission received.','');
      tile.classList.add('done','locked');
    }

    // Refresh leaderboard
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);
  } catch(e){
    // Roll back UI on error
    setTileState(id, '');
    inp.disabled=false; ev.currentTarget.disabled=false;
    showToast(e.message,'bad');
  }
}

// Events
$('#idLoginBtn').addEventListener('click', ()=>goToPin('login'));
$('#idRegisterBtn').addEventListener('click', ()=>goToPin('register'));
$('#primaryAuthBtn').addEventListener('click', onPrimaryAuth);
$('#backToIdBtn').addEventListener('click', ()=>{ showAuth(); });

$('#logoutBtn').addEventListener('click', ()=>{ store.clear(); location.reload(); });

// Theme toggle visible only on auth screens
function applyThemeButtonVisibility(){
  const inAuth = !$('#authLayout').classList.contains('hidden') || !$('#pinPanel').classList.contains('hidden');
  $('#themeToggle').classList.toggle('hidden', !inAuth);
}
$('#themeToggle').addEventListener('click', ()=>{
  const light=document.documentElement.classList.toggle('light');
  localStorage.setItem('cc.theme', light?'light':'dark');
});

// Boot
(function boot(){
  $('#year').textContent = new Date().getFullYear();
  document.documentElement.classList.toggle('light', localStorage.getItem('cc.theme')==='light');

  // Load preview leaderboard immediately
  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb = lb.leaderboard; renderLeaderboardPreview(cache.lb); } });

  const uid = store.uid(); const pin = store.pin();
  if(uid && pin){
    // Returning user goes straight to app
    precacheFor(uid).finally(()=>{ renderDash(); });
  } else {
    // Show auth, theme toggle visible
    showAuth();
  }

  // Update theme toggle visibility on route changes
  const mo = new MutationObserver(applyThemeButtonVisibility);
  mo.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class'] });
  applyThemeButtonVisibility();
})();
