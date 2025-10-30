// Classroom Challenge — app fixes v12
// - Immediate PIN/Register panel after ID
// - Reliable state switches
// - Leaderboard refresh on landing
// - Spinner + shimmer kept

const { WEB_APP_URL, USE_SESSION_ONLY } = (window.ClassroomConfig||{});
if(!WEB_APP_URL){ console.error('WEB_APP_URL missing. Set it in config.js'); }

const K = { uid:'cc.uid', pin:'cc.pin', prof:'cc.profile', acts:'cc.activities', subs:'cc.subs', lb:'cc.lb', gm:'cc.grading', arch:'cc.archive' };
const store = {
  set(uid, pin, remember){ localStorage.setItem(K.uid, uid); (remember? localStorage: sessionStorage).setItem(K.pin, pin); if(!remember) localStorage.removeItem(K.pin); },
  clear(){ localStorage.removeItem(K.uid); localStorage.removeItem(K.pin); sessionStorage.removeItem(K.pin); localStorage.removeItem(K.arch); },
  uid(){ return localStorage.getItem(K.uid); },
  pin(){ return sessionStorage.getItem(K.pin) || localStorage.getItem(K.pin); }
};

const $  = (s,root=document)=> root.querySelector(s);
const $$ = (s,root=document)=> Array.from(root.querySelectorAll(s));

const jget  = p   => fetch(WEB_APP_URL + '?' + new URLSearchParams(p), { method:'GET' }).then(r=>r.json());
const jpost = body => fetch(WEB_APP_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' }, body:new URLSearchParams(body) }).then(r => r.json());

function setState(state){
  document.body.setAttribute('data-state', state);
  const tt=$('#themeToggle'); if(tt){ tt.classList.toggle('hidden', state==='app'); }
}
const setMsg = (sel, m)=>{ const el=$(sel); if(el) el.textContent = m||''; };

let toastTimer=null;
function showToast(msg, kind=''){ const t=$('#toast'); if(!t) return; t.textContent=msg; t.className='toast '+(kind||''); t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add('hidden'), 2400); }

const norm = s => (s||'').toString().trim().toLowerCase();
async function sha256Hex(str){ const enc=new TextEncoder(); const buf=await crypto.subtle.digest('SHA-256', enc.encode(str)); return Array.from(new Uint8Array(buf)).map(b=>('0'+b.toString(16)).slice(-2)).join(''); }

const cache = { acts:null, lb:null, gm:null, profile:null, done:new Set(), authMode:'login', archive:[] };

function renderProfile(p){ $('#displayName').textContent = p.displayName||p.userId; $('#coinBalance').textContent = p.balance??0; }
function renderLeaderboard(rows){ const ol=$('#leaderboard'); if(!ol) return; ol.innerHTML=''; (rows||[]).forEach((r,i)=>{ const li=document.createElement('li'); const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; li.textContent=`${medal} ${r.name} — 🪙 ${r.score}`; ol.appendChild(li); }); }
function renderLeaderboardPreview(rows){ const ol=$('#leaderboardPreview'); if(!ol) return; ol.innerHTML=''; (rows||[]).slice(0,8).forEach((r,i)=>{ const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'; const li=document.createElement('li'); li.textContent=`${medal} ${r.name} — ${r.score}`; ol.appendChild(li); }); }
function tileEl(id){ return document.querySelector(`[data-tile="${id}"]`) }
function addClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.add(x)); }
function removeClasses(el,...c){ if(!el) return; c.forEach(x=> el.classList.remove(x)); }

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
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', onSubmit, { passive:true }));
}

// Archive (same as prior builds)
function loadArchive(){ try{ cache.archive = JSON.parse(localStorage.getItem(K.arch) || '[]'); } catch{ cache.archive=[]; } }
function saveArchive(){ try{ localStorage.setItem(K.arch, JSON.stringify(cache.archive)); }catch{} }
function renderArchive(){
  const ul = $('#archiveList'); if(!ul) return; ul.innerHTML='';
  if(!cache.archive.length){ ul.innerHTML = '<li class="muted">No previous activities yet.</li>'; return; }
  cache.archive.forEach(item=>{
    const li=document.createElement('li'); li.className='archive-item'; li.setAttribute('data-id', item.activityId); li.setAttribute('aria-expanded','false');
    const pillClass = item.correct===true?'good':item.correct===false?'bad':'neutral';
    li.innerHTML = `<div class="hdr">
        <div>
          <strong>${item.title||item.activityId}</strong>
          <div class="meta">${new Date(item.timestamp).toLocaleString()} • <span class="pill ${pillClass}">${item.correct===true?'Correct ✅':item.correct===false?'Incorrect ❌':'Submitted ℹ️'}</span> • 🪙 ${item.points||0}</div>
        </div>
        <button class="secondary small toggle-detail">Details</button>
      </div>
      <div class="detail">
        <div><strong>Your answer:</strong></div>
        <div class="answer">${(item.answer||'—').replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]))}</div>
        <div class="correct">${item.correctAnswer ? `<strong>Correct answer:</strong> ${item.correctAnswer}` : '<em>Correct answer hidden</em>'}</div>
      </div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.toggle-detail').forEach(btn => btn.addEventListener('click', (e)=>{
    const li = e.currentTarget.closest('.archive-item'); const open = li.getAttribute('aria-expanded')==='true';
    li.setAttribute('aria-expanded', open?'false':'true');
  }));
}
function renderArchiveChip(){
  const chipbar = document.querySelector('#archiveChip'); if(!chipbar) return;
  chipbar.innerHTML='';
  const recent = (cache.archive||[]).slice(0,5);
  if(!recent.length){
    const div=document.createElement('div'); div.className='chip neutral'; div.textContent='📂 Archive';
    chipbar.appendChild(div);
    return;
  }
  recent.forEach(item=>{
    const cls = item.correct===true?'good':item.correct===false?'bad':'neutral';
    const emoji = item.correct===true?'✅':item.correct===false?'❌':'ℹ️';
    const div=document.createElement('div'); div.className='chip '+cls; div.setAttribute('data-id', item.activityId);
    div.innerHTML = `<span class="e">${emoji}</span><span class="title">${(item.title||item.activityId)}</span>`;
    chipbar.appendChild(div);
  });
}

async function precacheFor(uid){
  const [acts, lb, gm, subs, prof] = await Promise.all([
    jget({action:'getactivities'}),
    jget({action:'leaderboard'}),
    jget({action:'getgradingmap'}),
    uid ? jget({action:'getsubmissions', userId:uid}) : Promise.resolve({ok:true, submissions:[]}),
    uid ? jget({action:'getprofile', userId:uid}) : Promise.resolve({ok:true, userId:uid, balance:0})
  ]);
  if(acts.ok) { cache.acts = acts.activities; try{ localStorage.setItem(K.acts, JSON.stringify(cache.acts)); }catch{} }
  if(lb.ok)   { cache.lb   = lb.leaderboard; try{ localStorage.setItem(K.lb, JSON.stringify(cache.lb)); }catch{} renderLeaderboardPreview(cache.lb); }
  if(gm.ok)   { cache.gm   = gm; try{ localStorage.setItem(K.gm, JSON.stringify(gm)); }catch{} }
  if(subs.ok) { cache.done = new Set((subs.submissions||[]).map(s=>s.activityId)); try{ localStorage.setItem(K.subs, JSON.stringify([...cache.done])); }catch{} }
  if(prof.ok) { cache.profile = { userId:uid, balance:prof.balance, displayName:prof.displayName }; try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch{} }
  loadArchive(); renderArchive(); renderArchiveChip();
}

function showAuthId(){ setState('auth-id'); }
function showAuthPin(){ setState('auth-pin'); }
function showApp(){ setState('app'); }

function renderDash(){
  showApp();
  renderProfile(cache.profile||{ userId:store.uid(), balance:0 });
  renderLeaderboard(cache.lb||[]);
  renderActivities(cache.acts||[], cache.done||new Set());
  renderArchive(); renderArchiveChip();
  // Extra refresh pass to ensure leaderboard is current on land
  jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboard(lb.leaderboard); } }).catch(()=>{});
}

// === Auth flow ===
async function goToPin(mode){
  cache.authMode = mode;
  const uidInput = $('#idOnly');
  const uid = uidInput ? uidInput.value.trim() : '';
  if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg','');
  localStorage.setItem(K.uid, uid);

  // Immediately show PIN/register pane to avoid "nothing happened" feel
  showAuthPin();
  const primaryBtn = $('#primaryAuthBtn');
  if(primaryBtn) primaryBtn.textContent = (mode==='login'?'Login':'Register');

  // Kick off background fetches
  try{
    if(!cache.lb){
      const lb = await jget({action:'leaderboard'});
      if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(cache.lb); }
    }
    const check = await jget({action:'checkuser', userId:uid});
    const exists = check.ok && check.exists;
    const name = exists ? (check.displayName||uid) : uid;
    $('#helloName').textContent = (mode==='login')
      ? (exists?`Welcome back, ${name}!`:`Not registered yet — let's create your account, ${name}.`)
      : `Create your account, ${name}`;
    // If user chose Login but account doesn't exist, flip to register
    if(mode==='login' && !exists){
      cache.authMode = 'register';
      if(primaryBtn) primaryBtn.textContent = 'Register';
    }
    // Warm cache in background
    precacheFor(uid).catch(()=>{});
  }catch(e){
    setMsg('#idMsg', e.message||'Network error'); showAuthId();
  }
}

async function onPrimaryAuth(){
  const uid = store.uid() || ($('#idOnly')?.value.trim());
  const pin = $('#pin')?.value.trim();
  const remember=$('#rememberPin')?.checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  const button = $('#primaryAuthBtn'); if(button) button.setAttribute('disabled','');
  try{
    if(cache.authMode==='register'){
      const res= await jpost({ action:'register', userId:uid, pin, displayName:uid });
      if(!res.ok){ throw new Error(res.error||'Register failed'); }
    }
    const res= await jpost({ action:'login', userId:uid, pin });
    if(!res.ok){ throw new Error(res.error||'Login failed'); }
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    await precacheFor(uid); // ensure data in place
    // Refresh profile with displayName from login if present
    cache.profile = cache.profile || { userId:uid, balance:0 };
    cache.profile.displayName = res.displayName || cache.profile.displayName || uid;
    renderDash();
  } catch(e){
    setMsg('#loginMsg', e.message||'Auth error');
  } finally {
    if(button) button.removeAttribute('disabled');
  }
}

// === Submit flow (spinner->shimmer->gray) preserved ===
function archivePush(entry){
  cache.archive = cache.archive.filter(x => x.activityId !== entry.activityId);
  cache.archive.unshift(entry);
  saveArchive();
  renderArchive(); renderArchiveChip();
}
async function onSubmit(ev){
  const id=ev.currentTarget.dataset.id; const uid=store.uid(); const pin=store.pin(); if(!uid||!pin){ showToast('Please log in again.','bad'); return; }
  const inp=$(`#ans-${id}`); const answer=(inp?.value||'').trim(); if(!answer){ showToast('Enter an answer','bad'); return; }
  const btn=ev.currentTarget; const tile=tileEl(id); if(!tile) return;

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

  setTimeout(()=>{ removeClasses(tile,'processing'); addClasses(tile, verdict); }, 150);

  if(verdict==='success'){ const bal = Number($('#coinBalance').textContent||0) + points; $('#coinBalance').textContent = bal; showToast(`✅ Correct! +🪙 ${points}`,'good'); }
  else if(verdict==='fail'){ showToast('❌ Not quite — recorded.','bad'); }
  else { showToast('ℹ️ Submitted.',''); }

  const SHIMMER_MS = 900 + 700;
  setTimeout(()=>{ addClasses(tile,'done'); }, SHIMMER_MS);

  try{
    const res = await jpost({ action:'submitanswer', userId:uid, pin, activityId:id, answer });
    if(!res.ok){ throw new Error(res.error||'Submit failed'); }
    const prof = await jget({action:'getprofile', userId:uid}); if(prof.ok){ $('#coinBalance').textContent = prof.balance; }
    const lb = await jget({action:'leaderboard'}); if(lb.ok) renderLeaderboard(lb.leaderboard);

    const act = (cache.acts||[]).find(a => a.activityId === id) || { title:id, points:0 };
    archivePush({
      activityId:id,
      title: act.title || id,
      points: res.pointsAwarded ?? (verdict==='success'? (act.points||0) : 0),
      correct: (res.correct !== undefined ? res.correct : (verdict==='success'?true: verdict==='fail'?false:null)),
      answer,
      correctAnswer: act.correctAnswer || null,
      timestamp: new Date().toISOString()
    });

    setTimeout(()=>{ tile.style.transform='scale(0.98)'; tile.style.opacity='0.0'; setTimeout(()=> tile.remove(), 260); }, SHIMMER_MS + 150);

  } catch(e){
    removeClasses(tile,'processing','success','fail','neutral','done','locked');
    if(inp) inp.disabled=false; btn.disabled=false; showToast(e.message,'bad');
  }
}

// === Events ===
document.addEventListener('click', (e)=>{
  const t = e.target;
  if(t && t.id==='idLoginBtn'){ goToPin('login'); }
  if(t && t.id==='idRegisterBtn'){ goToPin('register'); }
  if(t && t.id==='primaryAuthBtn'){ onPrimaryAuth(); }
  if(t && t.id==='backToIdBtn'){ showAuthId(); }
  if(t && t.id==='logoutBtn'){ store.clear(); location.reload(); }
  if(t && t.id==='archiveToggle'){
    const p = $('#archivePanel'); const btn=t;
    const open = p.hasAttribute('hidden') ? false : true;
    if(open){ p.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); }
    else { p.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); }
  }
  if(t && (t.id==='archiveChip' || (t.closest && t.closest('#archiveChip')))){
    const p = $('#archivePanel'); const btn=$('#archiveToggle');
    if(p.hasAttribute('hidden')){ p.removeAttribute('hidden'); btn && btn.setAttribute('aria-expanded','true'); p.scrollIntoView({behavior:'smooth', block:'start'}); }
    else { p.scrollIntoView({behavior:'smooth', block:'start'}); }
  }
}, { passive:true });

// === Boot ===
(async function boot(){
  try{
    const y = $('#year'); if(y) y.textContent = new Date().getFullYear();
    const buildEl = $('#build'); if(buildEl) buildEl.textContent = (window.ASSET_VERSION||'dev');
    document.documentElement.classList.toggle('light', localStorage.getItem('cc.theme')==='light');

    // Default state
    if(!document.body.getAttribute('data-state')) document.body.setAttribute('data-state','auth-id');

    // Always fetch preview leaderboard
    jget({action:'leaderboard'}).then(lb=>{ if(lb.ok){ cache.lb = lb.leaderboard; renderLeaderboardPreview(lb.leaderboard); } }).catch(()=>{});

    const uid = store.uid(); const pin = store.pin();
    loadArchive(); renderArchive(); renderArchiveChip();

    if(uid && pin){
      await precacheFor(uid);
      renderDash(); // already waited for data, so lb shows
    }
  }catch(e){
    console.error('Boot error', e);
  }
})();