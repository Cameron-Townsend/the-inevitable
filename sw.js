const CNAME = 'cc-static-v1';
const ASSETS = [ './', './index.html', './style.css?v=v1921', './app.js?v=v1921', './config.js?v=v1921', './plugins/avatarPicker.js?v=v1921' ];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CNAME).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CNAME).map(k=>caches.delete(k))))); });
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(url.origin === location.origin){
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
  }
});
