// Auth-only Busy overlay controller (v13)
const Busy = (()=>{
  let count = 0, timer = null;
  const el = () => document.querySelector('#busyOverlay');
  function show(text){
    const e = el(); if(!e) return;
    if(text) { const t=e.querySelector('.busy-text'); if(t) t.textContent=text; }
    count = Math.max(0, count) + 1;
    e.classList.remove('hidden');
    // Failsafe: auto-hide after 10s in case of network aborts
    clearTimeout(timer);
    timer = setTimeout(()=>{ count=0; e.classList.add('hidden'); }, 10000);
  }
  function hide(){
    const e = el(); if(!e) return;
    count = Math.max(0, count-1);
    if(count===0){ e.classList.add('hidden'); clearTimeout(timer); timer=null; }
  }
  function reset(){ count=0; const e=el(); if(e) e.classList.add('hidden'); clearTimeout(timer); timer=null; }
  return { show, hide, reset };
})();

// Wire Busy into auth-only flows
(function(){
  const origFetch = window.fetch;
  // No global fetch wrapping; we call Busy explicitly only in auth handlers.
  // This ensures activity tile operations never trigger the full-screen overlay.
})();

// Replace the following helper usages in your app.js:
// - In goToPin(): wrap network work with Busy.show()/Busy.hide()
// - In onPrimaryAuth(): same
// - In boot(): only show when resuming a session
//
// Example replacements:

async function goToPin(mode){
  cache.authMode = mode;
  const uid = document.querySelector('#idOnly')?.value.trim(); if(!uid){ setMsg('#idMsg','Enter an ID'); return; }
  setMsg('#idMsg',''); localStorage.setItem(K.uid, uid);
  showAuthPin();
  const primaryBtn = document.querySelector('#primaryAuthBtn'); if(primaryBtn) primaryBtn.textContent = (mode==='login'?'Login':'Register');
  try{
    Busy.show('Checking ID…');
    if(!cache.lb){
      const lb = await jget({action:'leaderboard'});
      if(lb.ok){ cache.lb=lb.leaderboard; renderLeaderboardPreview(cache.lb); }
    }
    const check = await jget({action:'checkuser', userId:uid});
    const exists = check.ok && check.exists;
    const name = exists ? (check.displayName||uid) : uid;
    document.querySelector('#helloName').textContent = (mode==='login')
      ? (exists?`Welcome back, ${name}!`:`Not registered yet — let's create your account, ${name}.`)
      : `Create your account, ${name}`;
    if(mode==='login' && !exists){ cache.authMode = 'register'; if(primaryBtn) primaryBtn.textContent='Register'; }
    precacheFor(uid).catch(()=>{});
  }catch(e){
    setMsg('#idMsg', e.message||'Network error'); showAuthId();
  } finally {
    Busy.hide();
  }
}

async function onPrimaryAuth(){
  const uid = store.uid() || document.querySelector('#idOnly')?.value.trim();
  const pin = document.querySelector('#pin')?.value.trim();
  const remember=document.querySelector('#rememberPin')?.checked && !USE_SESSION_ONLY;
  if(!uid||!pin){ setMsg('#loginMsg','Enter PIN'); return; }
  const button = document.querySelector('#primaryAuthBtn'); if(button) button.setAttribute('disabled','');
  Busy.show(cache.authMode==='register' ? 'Creating account…' : 'Signing in…');
  try{
    if(cache.authMode==='register'){
      const res= await jpost({ action:'register', userId:uid, pin, displayName:uid });
      if(!res.ok){ throw new Error(res.error||'Register failed'); }
    }
    const res= await jpost({ action:'login', userId:uid, pin });
    if(!res.ok){ throw new Error(res.error||'Login failed'); }
    store.set(uid, pin, remember); setMsg('#loginMsg','');
    await precacheFor(uid);
    cache.profile = cache.profile || { userId:uid, balance:0 };
    cache.profile.displayName = res.displayName || cache.profile.displayName || uid;
    renderDash();
  } catch(e){
    setMsg('#loginMsg', e.message||'Auth error');
  } finally {
    Busy.hide();
    if(button) button.removeAttribute('disabled');
  }
}

(async function boot(){
  const uid = store.uid(); const pin = store.pin();
  loadArchive(); renderArchive(); renderArchiveChip();
  if(uid && pin){
    Busy.show('Loading your dashboard…');
    try{
      await precacheFor(uid);
      renderDash();
    } finally {
      Busy.hide();
    }
  }
})();