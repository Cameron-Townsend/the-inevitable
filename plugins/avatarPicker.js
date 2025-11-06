// plugins/avatarPicker.js
// UMD-ish tiny plugin for Classroom Challenge
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClassroomPlugins = root.ClassroomPlugins || {};
    root.ClassroomPlugins.avatarPicker = factory();
  }
}(this, function () {
  'use strict';

  function safe(url) {
    if (!url) return '';
    try {
      var u = new URL(url, location.origin);
      if (u.protocol === 'http:') u.protocol = 'https:';
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  // opts: { current, avatars }
  function open(opts) {
    opts = opts || {};
    var current = opts.current || null;
    var avatars = Array.isArray(opts.avatars)
      ? opts.avatars
      : (Array.isArray(window.__avatars) ? window.__avatars : []);

    return new Promise(function (resolve) {
      // prefer the panel we already have in index.html
      var panel = document.getElementById('avatarPickerPanel');
      var createdTemp = false;

      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'avatarPickerPanel';
        panel.className = 'avatar-picker';
        document.body.appendChild(panel);
        createdTemp = true;
      }

      panel.innerHTML = '';
      panel.classList.remove('hidden');

      avatars.forEach(function (av) {
        var tile = document.createElement('div');
        tile.className = 'avatar-tile';
        if (current && av.avatarId === current) {
          tile.classList.add('selected');
        }
        var img = document.createElement('img');
        img.src = safe(av.avatarURL);
        img.alt = av.avatarId || 'Avatar';
        tile.appendChild(img);
        tile.addEventListener('click', function () {
          panel.classList.add('hidden');
          if (createdTemp) panel.remove();
          resolve({
            avatarId: av.avatarId,
            avatarURL: av.avatarURL
          });
        });
        panel.appendChild(tile);
      });

      // if we created a floating panel, allow click-outside to close
      if (createdTemp) {
        document.addEventListener('click', function esc(e) {
          if (!panel.contains(e.target)) {
            panel.classList.add('hidden');
            document.removeEventListener('click', esc);
            resolve(null);
          }
        });
      }
    });
  }

  return {
    open: open
  };
}));
