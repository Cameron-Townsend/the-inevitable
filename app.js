// Classroom Challenge v19.1.5r Frontend
(async () => {
  const cfg = window.ClassroomConfig;
  const state = { user: null, cache: {} };
  const body = document.body;
  const toast = document.getElementById('toast');
  const busy = document.getElementById('busyOverlay');

  function showToast(msg, t = 2000) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => (toast.style.display = 'none'), t);
  }

  async function api(fn, data) {
    const url = cfg.WEB_APP_URL + '?fn=' + fn;
    const opts = data ? { method: 'POST', body: JSON.stringify(data) } : { method: 'GET' };
    const res = await fetch(url, opts);
    return await res.json();
  }

  async function login(id, pin) {
    busy.classList.remove('hidden');
    try {
      const res = await api('login', { id, pin });
      if (res && res.ok) {
        state.user = res.user;
        renderDashboard();
      } else {
        showToast(res.msg || 'Login failed');
      }
    } catch (e) {
      showToast('Network error');
    } finally {
      busy.classList.add('hidden');
    }
  }

  function renderDashboard() {
    document.body.dataset.state = 'dashboard';
    document.getElementById('identifyPanel').classList.add('hidden');
    document.getElementById('pinPanel').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('displayName').textContent = state.user.name;
    document.getElementById('coinBalance').textContent = state.user.coins + ' 🪙';
  }

  document.getElementById('idLoginBtn').onclick = () => {
    const id = document.getElementById('idOnly').value.trim();
    if (!id) return showToast('Enter ID');
    body.dataset.state = 'pin';
    document.getElementById('identifyPanel').classList.add('hidden');
    document.getElementById('pinPanel').classList.remove('hidden');
    state.userId = id;
  };

  document.getElementById('primaryAuthBtn').onclick = () => {
    const pin = document.getElementById('pin').value.trim();
    if (!pin) return showToast('Enter PIN');
    login(state.userId, pin);
  };

  document.getElementById('backToIdBtn').onclick = () => {
    body.dataset.state = 'identify';
    document.getElementById('pinPanel').classList.add('hidden');
    document.getElementById('identifyPanel').classList.remove('hidden');
  };

  document.getElementById('logoutBtn').onclick = () => {
    state.user = null;
    body.dataset.state = 'identify';
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('identifyPanel').classList.remove('hidden');
  };
})();