const CACHE='velora-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./manifest.webmanifest','./icon-192.png','./icon-512.png'])));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('velora-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/strava')||url.pathname.includes('/settings')||url.pathname.includes('/rides'))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();void caches.open(CACHE).then(c=>c.put(event.request,copy));}return response;}).catch(async()=>{const saved=await caches.match(event.request);if(saved)return saved;if(event.request.mode==='navigate')return (await caches.match('./'));throw Error('Offline asset unavailable');}));
});
