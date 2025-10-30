// Key parts only changed: stacked inputs/buttons, lock tiles after any submission, instant verify
const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if(!WEB_APP_URL){ console.error('WEB_APP_URL missing. Set it in config.js'); }

const K = { uid:'cc.uid', pin:'cc.pin', prof:'cc.profile', acts:'cc.activities', subs:'cc.subs', lb:'cc.lb', gm:'cc.grading' };
const store = {
  set(uid, pin, remember){ localStorage.setItem(K.uid, uid); (remember? localStorage: sessionStorage).setItem(K.pin, pin); if(!remember) localStorage.removeItem(K.pin); },
  clear(){ localStorage.removeItem(K.uid); localStorage.removeItem(K.pin); sessionStorage.removeItem(K.pin); },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};
const jget  = p   => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET' }).then(r=>r.json());
const jpost = body => fetch(WEB_APP_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' }, body:new URLSearchParams(body) }).then(r=>r.json());
const $ = s => document.querySelector(s);
const setMsg = (id, m)=>{ $(id).textContent = m||''; };
let toastTimer=null; function showToast(m,k=''){ const t=$('#toast'); t.textContent=m; t.className='toast '+k; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400); }
const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){ const enc=new TextEncoder(); const buf=await crypto.subtle.digest('SHA-256', enc.encode(str)); return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }

const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set(), authMode:'login' };

function renderProfile(p){ $('#displayName').textContent = p.displayName||p.userId; $('#coinBalance').textContent = p.balance??0; }
function renderLeaderboard(rows){ const ol=$('#leaderboard'); ol.innerHTML=''; (rows||[]).forEach((r,i)=>{ const li=document.createElement('li'); const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; li.textContent=`${medal} ${r.name} — 🪙 ${r.score}`; ol.appendChild(li); }); }
function renderLeaderboardPreview(rows){ const ol=$('#leaderboardPreview'); ol.innerHTML=''; (rows||[]).slice(0,8).forEach((r,i)=>{ const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; const li=document.createElement('li'); li.textContent=`${medal} ${r.name} — ${r.score}`; ol.appendChild(li); }); }
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`) }
function setTileState(id, state){ const el=tileEl(id); if(!el) return; el.classList.remove('processing','success','fail','neutral'); if(state){ el.classList.add(state); } if(state){ el.classList.add('locked'); } }
function renderActivities(list, doneSet){
  const wrap=$('#activities'); wrap.innerHTML='';
  (list||[]).forEach(a=>{
    const done = doneSet.has(a.activityId);
    const div=document.createElement('div');
    div.className='activity'+(done?' done locked':'');
    div.setAttribute('data-tile', a.activityId);
    div.innerHTML=`<h3>🧠 ${a.title}</h3>
      <p>${a.prompt||''}</p>
      <p>Worth <strong>🪙 ${a.points}</strong></p>
      <div class="row stack">
        <input placeholder="Your answer" id="ans-${a.activityId}" ${done?'disabled':''}>
        <button data-id="${a.activityId}" ${done?'disabled':''}>Submit</button>
      </div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', onSubmit));
}

async function precacheFor(uid){
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
}

function showAuth(){ $('#authLayout').classList.remove('hidden'); $('#pinPanel').classList.add('hidden'); $('#dashboard').classList.add('hidden'); $('#themeToggle').classList.remove('hidden'); }
function showPin(){ $('#authLayout').classList.add('hidden'); $('#pinPanel').classList.remove('hidden'); $('#dashboard').classList.add('hidden'); $('#themeToggle').classList.remove('hidden'); }
function showApp(){ $('#authLayout').classList.add('hidden'); $('#pinPanel').classList.add('hidden'); $('#dashboard').classList.remove('hidden'); $('#themeToggle').classList.add('hidden'); }
function renderDash(){ showApp(); renderProfile(cache.profile||{ userId:store.uid(), balance:0 }); renderLeaderboard(cache.lb||[]); renderActivities(cache.acts||[], cache.done||new Set()); }

async function goToPin(mode){
  cache.authMode = mode;
  const uid = $('#idOnly').value.trim(); if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); $('#idLoginBtn').disabled=true; $('#idRegisterBtn').disabled=true;
  try{
    localStorage.setItem(K.uid, uid);
    if(!cache.lb){ const lb = await jget({action:'leaderboard'}); if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(cache.lb); } }
    const check = await jget({action:'checkuser', userId:uid}); const exists = check.ok && check.exists; const name = exists ? (check.displayName||uid) : uid;
    $('#helloName').textContent = (mode==='login') ? (exists?`Welcome back, ${name}!`:`Not registered yet — let's create your account, ${name}.`) : `Create your account, ${name}`;
    if(mode==='login' && !exists){ cache.authMode='register'; showToast('User not found — switching to Register.','bad'); $('#primaryAuthBtn').textContent='Register'; } else { $('#primaryAuthBtn').textContent=(cache.authMode==='login'?'Login':'Register'); }
    precacheFor(uid).catch(()=>{});
    showPin();
  }catch(e){ setMsg('#idMsg', e.message); } finally{ $('#idLoginBtn').disabled=false; $('#idRegisterBtn').disabled=false; }
}

async function onPrimaryAuth(){
  const uid = store.uid() || $('#idOnly').value.trim();
  const pin = $('#pin').value.trim();
  const remember=$('#rememberPin').checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  try{
    $('#primaryAuthBtn').disabled = true;
    if(cache.authMode==='register'){
      const displayName = uid;
      const res= await jpost({ action:'register', userId:uid, pin, displayName });
      if(!res.ok){ throw new Error(res.error||'Register failed'); }
      showToast('Registered! Logging you in…','good');
    }
    const res= await jpost({ action:'login', userId:uid, pin }); if(!res.ok){ throw new Error(res.error||'Login failed'); }
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    if(!cache.acts) await precacheFor(uid);
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok){ cache.profile={ userId:uid, balance:prof.balance, displayName:res.displayName||uid }; }
    renderDash();
  } catch(e){ setMsg('#loginMsg', e.message); } finally{ $('#primaryAuthBtn').disabled=false; }
}

// Instant client-side verify; lock/gray tile after any submission
async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin(); if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$('#ans-'+id); const answer=(inp.value||'').trim(); if(!answer){ showToast('Enter an answer','bad'); return; }
  const btn=ev.currentTarget; const tile=tileEl(id);

  // Determine instant verdict using grading map (if available)
  let verdict='neutral', points=0, hasKey=false;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      hasKey=true;
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ verdict='success'; points=Number(entry.points||0); } else { verdict='fail'; }
    }
  }catch{}

  // Apply instant UI
  setTileState(id, verdict==='success'?'success':verdict==='fail'?'fail':'neutral');
  tile.classList.add('done','locked'); inp.disabled=true; btn.disabled=true;
  if(verdict==='success'){ const bal = Number($('#coinBalance').textContent||0) + points; $('#coinBalance').textContent = bal; showToast(`✅ Correct! +🪙 ${points}`,'good'); }
  else if(verdict==='fail'){ showToast('❌ Not quite — recorded.','bad'); }
  else { showToast('ℹ️ Submitted.',''); }

  // Send to server in background and reconcile if needed
  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok){ throw new Error(res.error||'Submit failed'); }
    // Reconcile coin count if server differs (edge cases like closed window)
    const prof = await jget({action:'getprofile', userId:uid});
    if(prof.ok){ $('#coinBalance').textContent = prof.balance; }
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);
  } catch(e){
    // On server failure, unlock to let them retry later (since submission didn't persist)
    setTileState(id, ''); tile.classList.remove('done','locked'); inp.disabled=false; btn.disabled=false;
    showToast(e.message,'bad');
  }
}

// Events hookup (assumes index.html from previous step)
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id==='idLoginBtn') goToPin('login');
  if(e.target && e.target.id==='idRegisterBtn') goToPin('register');
  if(e.target && e.target.id==='primaryAuthBtn') onPrimaryAuth();
  if(e.target && e.target.id==='backToIdBtn'){ document.querySelector('#authLayout')?.classList.remove('hidden'); document.querySelector('#pinPanel')?.classList.add('hidden'); document.querySelector('#dashboard')?.classList.add('hidden'); document.querySelector('#themeToggle')?.classList.remove('hidden'); }
  if(e.target && e.target.id==='logoutBtn'){ store.clear(); location.reload(); }
});

// Theme toggle visible only on auth screens
function applyThemeButtonVisibility(){
  const inAuth = !$('#authLayout').classList.contains('hidden') || !$('#pinPanel').classList.contains('hidden');
  $('#themeToggle').classList.toggle('hidden', !inAuth);
}
$('#themeToggle')?.addEventListener('click', ()=>{
  const light=document.documentElement.classList.toggle('light');
  localStorage.setItem('cc.theme', light?'light':'dark');
});

// Boot
(function boot(){
  const y = document.querySelector('#year'); if(y) y.textContent = new Date().getFullYear();
  document.documentElement.classList.toggle('light', localStorage.getItem('cc.theme')==='light');

  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb = lb.leaderboard; renderLeaderboardPreview(cache.lb); } });

  const uid = store.uid(); const pin = store.pin();
  if(uid && pin){
    precacheFor(uid).finally(()=>{ renderDash(); });
  } else {
    document.querySelector('#authLayout')?.classList.remove('hidden');
    document.querySelector('#pinPanel')?.classList.add('hidden');
    document.querySelector('#dashboard')?.classList.add('hidden');
    document.querySelector('#themeToggle')?.classList.remove('hidden');
  }

  const mo = new MutationObserver(applyThemeButtonVisibility);
  mo.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class'] });
  applyThemeButtonVisibility();
})();
