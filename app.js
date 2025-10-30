/* ==========================================================================
   Classroom Challenge — v19.2.1
   - Promise-based precacheFor
   - Guarded hydrateDashFromCache (no early calls)
   - Stable renderLeaderboard with medals/coin + avatar chip
   - Minimal helpers for avatar updates
   ========================================================================== */

/* -------------------- Minimal helpers (safe to re-declare) --------------- */
function setProfileAvatar(url){
  var img = document.getElementById('profile-avatar');
  if (img) img.src = url || 'avatars/happy-face.png';
}
function updateVisibleLeaderboardAvatar(userId, url){
  var nodes = document.querySelectorAll('img.avatar-chip[data-user="'+userId+'"]');
  nodes.forEach(function(img){ img.src = url; });
}

/* -------------------- Global state keys (idempotent) --------------------- */
window.cache = window.cache || {};
window.K = window.K || { acts:"cc.acts", lb:"cc.lb", gm:"cc.gm", subs:"cc.subs", prof:"cc.prof" };

/* -------------------- UI utils (toasts, busy) ---------------------------- */
function showToast(msg){
  var el = document.getElementById('authToast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  setTimeout(function(){ el.hidden = true; }, 1800);
}
function setBusy(on){
  var el = document.getElementById('authBusy');
  if (!el) return;
  el.hidden = !on;
}

/* -------------------- HTTP helpers (expect config.js defines WEB_APP_URL) */
function jget(params){
  var url = new URL(ClassroomConfig.WEB_APP_URL);
  Object.keys(params||{}).forEach(function(k){ url.searchParams.set(k, params[k]); });
  return fetch(url.toString(), { method: 'GET', credentials: 'omit' }).then(function(r){ return r.json(); });
}
function jpost(body){
  return fetch(ClassroomConfig.WEB_APP_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body||{})
  }).then(function(r){ return r.json(); });
}

/* -------------------- Clean Promise-based precacheFor -------------------- */
function precacheFor(uid){
  var avatarsP = jget({ action:'getavatars' }).catch(function(){ return { ok:false }; });

  return Promise.all([
    jget({ action:'getactivities' }),
    jget({ action:'leaderboard' }),
    jget({ action:'getgradingmap' }),
    uid ? jget({ action:'getsubmissions', userId: uid }) : Promise.resolve({ ok:true, submissions: [] }),
    uid ? jget({ action:'getprofile',    userId: uid }) : Promise.resolve({ ok:true, userId: uid, balance: 0 })
  ]).then(function(arr){
    var acts = arr[0]||{}, lb = arr[1]||{}, gm = arr[2]||{}, subs = arr[3]||{}, prof = arr[4]||{};
    if (acts.ok){ cache.acts = acts.activities; try{ localStorage.setItem(K.acts, JSON.stringify(cache.acts)); }catch(e){} }
    if (lb.ok){   cache.lb   = lb.leaderboard; try{ localStorage.setItem(K.lb,   JSON.stringify(cache.lb));   }catch(e){} }
    if (gm.ok){   cache.gm   = { salt: gm.salt, map: gm.map }; try{ localStorage.setItem(K.gm, JSON.stringify(cache.gm)); }catch(e){} }
    if (subs.ok){ cache.done = new Set((subs.submissions||[]).map(function(s){ return s.activityId; })); try{ localStorage.setItem(K.subs, JSON.stringify(Array.from(cache.done))); }catch(e){} }
    if (prof.ok){ cache.profile = prof; try{ localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch(e){} }
    return avatarsP;
  }).then(function(av){
    if (av && av.ok){ cache.avatars = av.avatars; try{ localStorage.setItem('cc.avatars', JSON.stringify(cache.avatars)); }catch(e){} }
    return true;
  }).catch(function(){ return true; });
}

/* -------------------- Guarded hydration (no early calls) ----------------- */
function hydrateDashFromCache(){
  try {
    if (cache && cache.profile) {
      try { if (typeof renderProfile === 'function') renderProfile(cache.profile); } catch(e){}
      try { if (typeof bindProfileAvatarFromPayload === 'function') bindProfileAvatarFromPayload(cache.profile); } catch(e){}
    }
    if (cache && cache.lb) {
      try { if (typeof renderLeaderboard === 'function') renderLeaderboard(cache.lb); } catch(e){}
    }
    if (cache && cache.acts) {
      try {
        var done = (cache.done instanceof Set) ? cache.done :
                   new Set(Array.isArray(cache.done) ? cache.done : []);
        if (typeof renderActivities === 'function') renderActivities(cache.acts, done);
      } catch(e){}
    }
  } catch(e){ console.warn('[hydrateDashFromCache] warning:', e); }
}

/* -------------------- Leaderboard renderer (emoji + avatar) -------------- */
function renderLeaderboard(rows){
  var ol = document.getElementById('leaderboard'); if (!ol) return; ol.innerHTML='';
  (rows||[]).forEach(function(r,i){
    var li  = document.createElement('li');
    var m   = (i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅');
    var img = document.createElement('img');
    img.className = 'avatar-chip';
    img.alt = (r.name||r.userId)+' avatar';
    img.src = r.avatarURL || 'avatars/happy-face.png';
    img.setAttribute('data-user', r.userId);
    img.onerror = function(){ img.src = 'avatars/happy-face.png'; };
    var span = document.createElement('span');
    span.textContent = ' ' + m + ' ' + (r.name||r.userId) + ' — 🪙 ' + (r.score||0);
    li.appendChild(img); li.appendChild(span);
    ol.appendChild(li);
  });
}

/* -------------------- Minimal renderers (profile/activities) ------------- */
function renderProfile(p){
  var nameEl = document.getElementById('displayName');
  var balEl  = document.getElementById('coinBalance');
  if (nameEl) nameEl.textContent = p.displayName || p.userId || '—';
  if (balEl) balEl.textContent = (p.balance != null ? p.balance : 0);
  if (p.avatarURL) setProfileAvatar(p.avatarURL);
}

function renderActivities(acts, doneSet){
  var wrap = document.getElementById('activities'); if (!wrap) return;
  wrap.innerHTML = '';
  (acts||[]).forEach(function(a){
    var card = document.createElement('button');
    card.className = 'tile';
    card.type = 'button';
    var completed = doneSet && doneSet.has(a.activityId);
    card.innerHTML = '<div class="tile-title">'+(a.title||a.activityId)+'</div>'
                   + '<div class="tile-sub">'+(a.points||0)+' 🪙</div>'
                   + (completed ? '<div class="tile-badge done">Completed</div>' : '');
    card.addEventListener('click', function(){
      if (completed){ showToast('Already completed ✅'); return; }
      submitActivityAnswer(a);
    });
    wrap.appendChild(card);
  });
}

/* -------------------- Activity submission (minimal) ---------------------- */
function submitActivityAnswer(a){
  var userId = (document.getElementById('userId')||{}).value || (cache.profile && cache.profile.userId);
  var pin    = (document.getElementById('pin')||{}).value || '';
  if (!userId || !pin){ showToast('Enter User ID and PIN'); return; }

  var answer = prompt(a.prompt || ('Answer for '+a.title+':')) || '';
  if (answer == null) return;

  setBusy(true);
  jpost({ action:'submitanswer', userId:userId, pin:pin, activityId:a.activityId, answer:answer })
    .then(function(res){
      if (!res.ok){ showToast(res.error||'Submit failed'); return; }
      // Update balance + done set
      try { cache.profile.balance = res.newBalance; localStorage.setItem(K.prof, JSON.stringify(cache.profile)); }catch(e){}
      try { cache.done = cache.done || new Set(); cache.done.add(a.activityId); localStorage.setItem(K.subs, JSON.stringify(Array.from(cache.done))); }catch(e){}
      hydrateDashFromCache();
      showToast(res.correct ? ('Correct! +'+(a.points||0)+' 🪙') : 'Submitted');
    }).catch(function(){
      showToast('Network error');
    }).finally(function(){ setBusy(false); });
}

/* -------------------- Auth flow (login/register) ------------------------- */
function showDash(){
  document.querySelector('.auth')?.setAttribute('hidden', 'hidden');
  document.getElementById('dash')?.removeAttribute('hidden');
}

function goLogin(register){
  var userId = (document.getElementById('userId')||{}).value || '';
  var pin    = (document.getElementById('pin')||{}).value || '';
  if (!userId){ showToast('Enter User ID'); return; }
  if (!pin){ showToast('Enter PIN'); return; }

  setBusy(true);
  var payload = register
      ? { action:'register', userId:userId, pin:pin, displayName:userId }
      : { action:'login',    userId:userId, pin:pin };

  jpost(payload).then(function(res){
    if (!res.ok){
      showToast(res.error || 'Auth failed');
      return;
    }
    // Persist UID for session
    try{
      cache.profile = cache.profile || {};
      cache.profile.userId = res.userId || userId;
      cache.profile.displayName = res.displayName || userId;
      localStorage.setItem(K.prof, JSON.stringify(cache.profile));
    }catch(e){}
    showDash();
    return precacheFor(userId);
  }).then(function(){ 
    hydrateDashFromCache();
  }).catch(function(){
    hydrateDashFromCache();
  }).finally(function(){ setBusy(false); });
}

/* -------------------- Bind buttons -------------------------------------- */
(function bindAuthButtons(){
  var btnLogin = document.getElementById('btnLogin');
  var btnReg   = document.getElementById('btnRegister');
  if (btnLogin){ btnLogin.onclick = function(){ goLogin(false); }; }
  if (btnReg){   btnReg.onclick   = function(){ goLogin(true);  }; }
})();

/* -------------------- One-time hydration after all parsed ---------------- */
// scheduleHydration_once_final
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function once(){
      document.removeEventListener('DOMContentLoaded', once);
      try { hydrateDashFromCache(); } catch(e){}
    });
  } else {
    setTimeout(function(){ try { hydrateDashFromCache(); } catch(e){} }, 0);
  }
} catch(e){}
