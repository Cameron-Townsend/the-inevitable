// ==== Config via external config.js ====
// config.js defines: window.ClassroomConfig = { WEB_APP_URL: 'https://.../exec', USE_SESSION_ONLY: true }
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

// Crypto helpers for client pre-grading
const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join('');
}

// Cached state
const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set() };

function renderProfile(p){ $('#displayName').textContent = p.displayName||p.userId; $('#coinBalance').textContent = p.balance??0; }
function renderLeaderboard(rows){ const ol=$('#leaderboard'); ol.innerHTML=''; (rows||[]).forEach(r=>{ const li=document.createElement('li'); li.textContent=`${r.name} — ${r.score} coins`; ol.appendChild(li); }); }
function renderActivities(list, doneSet){ const wrap=$('#activities'); wrap.innerHTML=''; (list||[]).forEach(a=>{ const done = doneSet.has(a.activityId); const div=document.createElement('div'); div.className='activity'+(done?' done':''); div.innerHTML=`<h3>${a.title}</h3><p>${a.prompt||''}</p><p>Worth ${a.points} coins</p><div class="row"><input placeholder="Your answer" id="ans-${a.activityId}" ${done?'disabled':''}><button data-id="${a.activityId}" ${done?'disabled':''}>Submit</button></div>`; wrap.appendChild(div); }); wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', onSubmit)); }

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
  if(lb.ok)   { cache.lb   = lb.leaderboard; localStorage.setItem(K.lb, JSON.stringify(cache.lb)); }
  if(gm.ok)   { cache.gm   = gm; localStorage.setItem(K.gm, JSON.stringify(cache.gm)); }
  if(subs.ok) { cache.done = new Set((subs.submissions||[]).map(s=>s.activityId)); localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }
  if(prof.ok) { cache.profile = { userId:uid, balance:prof.balance, displayName:prof.displayName }; localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }
  $('#precacheHint').classList.add('hidden');
}

function renderDash(){
  $('#identifyPanel').classList.add('hidden'); $('#pinPanel').classList.add('hidden'); $('#dashboard').classList.remove('hidden');
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderLeaderboard(cache.lb||[]);
  renderActivities(cache.acts||[], cache.done||new Set());
}

// ID step → prefetch
$('#idNextBtn').addEventListener('click', async ()=>{
  const uid = $('#idOnly').value.trim(); if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); $('#idNextBtn').disabled = true;
  try{
    const check = await jget({action:'checkuser', userId:uid});
    const name = check.ok && check.exists ? (check.displayName || uid) : uid;
    $('#helloName').textContent = `Hi, ${name}!`;
    $('#identifyPanel').classList.add('hidden'); $('#pinPanel').classList.remove('hidden');
    // Start precache in background while they type PIN
    precacheFor(uid).catch(()=>{});
    // Stash uid immediately so we can continue after login
    localStorage.setItem(K.uid, uid);
  } catch(e){ setMsg('#idMsg', e.message); } finally { $('#idNextBtn').disabled = false; }
});

// Login/Register
async function onLogin(){
  const uid = store.uid(); const pin = $('#pin').value.trim(); const remember=$('#rememberPin').checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  try{
    $('#loginBtn').disabled=true; const res= await jpost({ action:'login', userId:uid, pin }); if(!res.ok) throw new Error(res.error||'Login failed');
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    if(!cache.acts) await precacheFor(uid);
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok){ cache.profile = { userId:uid, balance:prof.balance, displayName:res.displayName||uid }; }
    renderDash();
  } catch(e){ setMsg('#loginMsg', e.message); } finally { $('#loginBtn').disabled=false; }
}

async function onRegister(){
  const uid = store.uid() || $('#idOnly').value.trim(); const pin=$('#pin').value.trim(); if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  const displayName = prompt('Display name?')?.trim()||uid;
  try{
    $('#registerBtn').disabled=true; const res= await jpost({ action:'register', userId:uid, pin, displayName }); if(!res.ok) throw new Error(res.error||'Register failed');
    setMsg('#loginMsg','Registered! Logging you in…');
    await onLogin();
  } catch(e){ setMsg('#loginMsg', e.message); } finally { $('#registerBtn').disabled=false; }
}

$('#loginBtn').addEventListener('click', onLogin);
$('#registerBtn').addEventListener('click', onRegister);
$('#logoutBtn').addEventListener('click', ()=>{ store.clear(); location.reload(); });

// Submit with instant client pre-grade
async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin(); if(!uid||!pin){ alert('Please log in again.'); return; }
  const inp=$('#ans-'+id); const answer=(inp.value||'').trim(); if(!answer){ alert('Enter an answer'); return; }
  let instantCorrect = null; let points=0;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ instantCorrect = true; points = Number(entry.points||0); }
    }
  }catch{}
  if(instantCorrect){ cache.done.add(id); inp.disabled=true; ev.currentTarget.disabled=true; const bal = Number($('#coinBalance').textContent||0) + points; $('#coinBalance').textContent = bal; }
  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok){ throw new Error(res.error||'Submit failed'); }
    if(res.correct){ cache.done.add(id); inp.disabled=true; ev.currentTarget.disabled=true; if(!instantCorrect){ const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok) $('#coinBalance').textContent = prof.balance; }
    } else {
      if(instantCorrect){ const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok) $('#coinBalance').textContent = prof.balance; cache.done.delete(id); inp.disabled=false; ev.currentTarget.disabled=false; }
      alert('Not quite—try again later.');
    }
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);
  } catch(e){
    if(instantCorrect){ const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok) $('#coinBalance').textContent = prof.balance; cache.done.delete(id); inp.disabled=false; ev.currentTarget.disabled=false; }
    alert(e.message);
  }
}

// Boot
(function boot(){
  $('#year').textContent = new Date().getFullYear();
  document.documentElement.classList.toggle('light', localStorage.getItem('cc.theme')==='light');
  $('#themeToggle').addEventListener('click', ()=>{ const light=document.documentElement.classList.toggle('light'); localStorage.setItem('cc.theme', light?'light':'dark'); });

  const uid = store.uid(); const pin = store.pin();
  if(uid && pin){ precacheFor(uid).finally(renderDash); } else { $('#identifyPanel').classList.remove('hidden'); }
})();
