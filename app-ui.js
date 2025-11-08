// app-ui.js
// Non-core UI enhancements for Classroom Challenge
// - archive expand/collapse
// - leaderboard "show all" toggle
// - uses core helpers exposed on window.CC

(function() {
  function $(s, root = document) { return root.querySelector(s); }
  function $$(s, root = document) { return Array.from(root.querySelectorAll(s)); }

  // guard: make sure core is loaded
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function() {
    // 1) Archive expand/collapse
    const archBtn = $('#archiveToggle');
    const archPanel = $('#archivePanel');
    if (archBtn && archPanel) {
      archBtn.addEventListener('click', function() {
        const open = !archPanel.hasAttribute('hidden');
        if (open) {
          archPanel.setAttribute('hidden', '');
          archBtn.setAttribute('aria-expanded', 'false');
        } else {
          archPanel.removeAttribute('hidden');
          archBtn.setAttribute('aria-expanded', 'true');
        }
      }, { passive: true });
    }

    // also hook up per-item detail toggles (since core now just renders them)
    const archList = $('#archiveList');
    if (archList) {
      archList.addEventListener('click', function(e) {
        const btn = e.target.closest('.toggle-detail');
        if (!btn) return;
        const li = btn.closest('.archive-item');
        if (!li) return;
        const open = li.getAttribute('aria-expanded') === 'true';
        li.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
    }

    // 2) Leaderboard "show all" toggle
    const lbToggle = $('#lbToggle');
    if (lbToggle) {
      lbToggle.addEventListener('click', function() {
        const CC = window.CC || {};
        const cache = CC.cache || {};
        cache.showFullLB = !cache.showFullLB;
        lbToggle.textContent = cache.showFullLB ? 'Show top 5' : 'Show all';

        // re-render with the data we already have
        if (typeof window.renderLeaderboard === 'function') {
          // if you exposed it globally, we could call it
          window.renderLeaderboard(cache.lb || [], { limit: cache.showFullLB ? 20 : 5 });
        } else {
          // fallback: simple re-render
          const ol = $('#leaderboard');
          if (!ol) return;
          ol.innerHTML = '';
          const rows = cache.lb || [];
          const limit = cache.showFullLB ? 20 : 5;
          rows.slice(0, limit).forEach((r, i) => {
            const li = document.createElement('li');
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
            li.textContent = `${medal} ${r.name} — ${r.score}`;
            ol.appendChild(li);
          });
        }
      }, { passive: true });
    }
  });
})();
