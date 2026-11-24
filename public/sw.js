const CACHE_NAME='glass-chess-shell-v1';
const PRECACHE=['/','/manifest.json','/version.json','/engine/stockfish.worker.js','/engine/stockfish-19-lite-single.js','/engine/stockfish-19-lite-single.wasm','/engine/stockfish.worker.wasm'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(PRECACHE)).catch(()=>{}).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('/',copy));return response;}).catch(()=>caches.match('/')));return;}
  event.respondWith(caches.match(request).then(cached=>{if(cached)return cached;return fetch(request).then(response=>{if(response&&response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));return response;});}));
});
