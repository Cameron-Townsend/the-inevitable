// Explicit auth states: 'auth-id' -> 'auth-pin' -> 'app'
const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if(!WEB_APP_URL){ console.error('WEB_APP_URL missing. Set it in config.js'); }

const K = { uid:'cc.uid', pin:'cc.pin', prof:'cc.profile', acts:'cc.activities', subs:'cc.subs', lb:'cc.lb', gm:'cc.grading' };
const store = {
  set(uid, pin, remember){ localStorage.setItem(K.uid, uid); (remember? localStorage: sessionStorage).setItem(K.pin, pin); if(!remember) localStorage.removeItem(K.pin); },
  clear(){ localStorage.removeItem(K.uid); localStorage.removeItem(K.pin); sessionStorage.removeItem(K.pin); },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};
const $ = s => document.querySelector(s);
const jget  = p   => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET' }).then(r=>r.json());
const jpost = body => fetch(WEB_APP_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' }, body:new URLSearchParams(body) }).then(r => r.json());

function setState(state){ // 'auth-id' | 'auth-pin' | 'app'
  document.body.setAttribute('data-state', state);
  const tt = $('#themeToggle'); if(tt){ tt.classList.toggle('hidden', state === 'app'); }
}
const setMsg = (id, m)=>{ $(id).textContent = m||''; };

let toastTimer=null;
function showToast(msg, kind=''){ const t=$('#toast'); t.textContent=msg; t.className='toast '+(kind||''); t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400); }

const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){ const enc=new TextEncoder(); const buf=await crypto.subtle.digest('SHA-256', enc.encode(str)); return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }

const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set(), authMode:'login' };

function renderProfile(p){ $('#displayName').textContent = p.displayName||p.userId; $('#coinBalance').textContent = p.balance??0; }
function renderLeaderboard(rows){ const ol=$('#leaderboard'); if(!ol) return; ol.innerHTML=''; (rows||[]).forEach((r,i)=>{ const li=document.createElement('li'); const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; li.textContent=`${medal} ${r.name} — 🪙 ${r.score}`; ol.appendChild(li); }); }
function renderLeaderboardPreview(rows){ const ol=$('#leaderboardPreview'); if(!ol) return; ol.innerHTML=''; (rows||[]).slice(0,8).forEach((r,i)=>{ const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; const li=document.createElement('li'); li.textContent=`${medal} ${r.name} — ${r.score}`; ol.appendChild(li); }); }
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`) }
function setTileState(id, state){ const el=tileEl(id); if(!el) return; el.classList.remove('processing','success','fail','neutral'); if(state){ el.classList.add(state,'locked'); } }

function renderActivities(list, doneSet){
  const wrap=$('#activities'); if(!wrap) return; wrap.innerHTML='';
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
  if(gm.ok)   { cache.gm   = gm; localStorage.setItem(K.gm, JSON.stringify(gm)); }
  if(subs.ok) { cache.done = new Set((subs.submissions||[]).map(s=>s.activityId)); localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }
  if(prof.ok) { cache.profile = { userId:uid, balance:prof.balance, displayName:prof.displayName }; localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }
}

function showAuthId(){ setState('auth-id'); }
function showAuthPin(){ setState('auth-pin'); }
function showApp(){ setState('app'); }

function renderDash(){
  showApp();
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderLeaderboard(cache.lb||[]);
  renderActivities(cache.acts||[], cache.done||new Set());
}

// Step 1 -> Step 2
async function goToPin(mode){
  cache.authMode = mode;
  const uid = $('#idOnly')?.value.trim(); if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); $('#idLoginBtn')?.setAttribute('disabled',''); $('#idRegisterBtn')?.setAttribute('disabled','');
  try{
    localStorage.setItem(K.uid, uid);
    if(!cache.lb){ const lb = await jget({action:'leaderboard'}); if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(cache.lb); } }
    const check = await jget({action:'checkuser', userId:uid}); const exists = check.ok && check.exists; const name = exists ? (check.displayName||uid) : uid;
    $('#helloName').textContent = (mode==='login')
      ? (exists?`Welcome back, ${name}!`:`Not registered yet — let's create your account, ${name}.`)
      : `Create your account, ${name}`;
    if(mode==='login' && !exists){ cache.authMode='register'; showToast('User not found — switching to Register.','bad'); $('#primaryAuthBtn').textContent='Register'; }
    else { $('#primaryAuthBtn').textContent=(cache.authMode==='login'?'Login':'Register'); }
    precacheFor(uid).catch(()=>{});
    // Replace the username panel with PIN/register panel
    showAuthPin();
  }catch(e){ setMsg('#idMsg', e.message); } finally{ $('#idLoginBtn')?.removeAttribute('disabled'); $('#idRegisterBtn')?.removeAttribute('disabled'); }
}

async function onPrimaryAuth(){
  const uid = store.uid() || $('#idOnly')?.value.trim();
  const pin = $('#pin')?.value.trim();
  const remember=$('#rememberPin')?.checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  try{
    $('#primaryAuthBtn')?.setAttribute('disabled','');
    if(cache.authMode==='register'){
      const displayName = uid;
      const res= await jpost({ action:'register', userId:uid, pin, displayName });
      if(!res.ok){ throw new Error(res.error||'Register failed'); }
      showToast('Registered! Logging you in…','good');
    }
    const res= await jpost({ action:'login', userId:uid, pin });
    if(!res.ok){ throw new Error(res.error||'Login failed'); }
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    if(!cache.acts) await precacheFor(uid);
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok){ cache.profile={ userId:uid, balance:prof.balance, displayName:res.displayName||uid }; }
    renderDash();
  } catch(e){ setMsg('#loginMsg', e.message); } finally{ $('#primaryAuthBtn')?.removeAttribute('disabled'); }
}

// Instant verify + lock (unchanged behavior)
async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin(); if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$(`#ans-${id}`); const answer=(inp?.value||'').trim(); if(!answer){ showToast('Enter an answer','bad'); return; }
  const btn=ev.currentTarget; const tile=tileEl(id);

  let verdict='neutral', points=0;
  try{
    const gm = cache.gm || JSON.parse(localStorage.getItem(K.gm)||'null');
    const entry = gm?.map?.find(m => m.activityId === id);
    if(entry && entry.hash){
      const h = await sha256Hex(gm.salt + norm(answer));
      if(h === entry.hash){ verdict='success'; points=Number(entry.points||0); } else { verdict='fail'; }
    }
  }catch{}

  setTileState(id, verdict==='success'?'success':verdict==='fail'?'fail':'neutral');
  tile?.classList.add('done','locked'); if(inp) inp.disabled=true; btn.disabled=true;
  if(verdict==='success'){ const bal = Number($('#coinBalance').textContent||0) + points; $('#coinBalance').textContent = bal; showToast(`✅ Correct! +🪙 ${points}`,'good'); }
  else if(verdict==='fail'){ showToast('❌ Not quite — recorded.','bad'); }
  else { showToast('ℹ️ Submitted.',''); }

  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok){ throw new Error(res.error||'Submit failed'); }
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok){ $('#coinBalance').textContent = prof.balance; }
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);
  } catch(e){
    tile?.classList.remove('done','locked'); if(inp){ inp.disabled=false; } btn.disabled=false; showToast(e.message,'bad');
  }
}

// Events
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id==='idLoginBtn') goToPin('login');
  if(e.target && e.target.id==='idRegisterBtn') goToPin('register');
  if(e.target && e.target.id==='primaryAuthBtn') onPrimaryAuth();
  if(e.target && e.target.id==='backToIdBtn'){ showAuthId(); }
  if(e.target && e.target.id==='logoutBtn'){ store.clear(); location.reload(); }
});

// Boot
(function boot(){
  const y = document.querySelector('#year'); if(y) y.textContent = new Date().getFullYear();
  document.documentElement.classList.toggle('light', localStorage.getItem('cc.theme')==='light');

  // default view
  showAuthId();

  // load preview leaderboard
  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb = lb.leaderboard; renderLeaderboardPreview(lb.leaderboard); } });

  const uid = store.uid(); const pin = store.pin();
  if(uid && pin){
    precacheFor(uid).finally(()=>{ renderDash(); });
  }
})();