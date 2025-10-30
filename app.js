// Minimal guard to ensure the correct state is applied on load
(function(){
  const ensureState = () => {
    const b = document.body;
    const st = b.getAttribute('data-state');
    if(!st || !/^(auth-id|auth-pin|app)$/.test(st)){
      b.setAttribute('data-state','auth-id');
    }
  };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ensureState, { once:true });
  } else {
    ensureState();
  }
})();