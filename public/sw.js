const CACHE_NAME='glass-chess-shell-v2026-11-25-13';
const APP_CACHE_PREFIX='glass-chess-shell-';
const PRECACHE=[
  '/',
  '/manifest.json',
  '/engine/stockfish.worker.js',
  '/engine/stockfish-19-lite-single.js',
  '/engine/stockfish-19-lite-single.wasm',
  '/engine/stockfish.worker.wasm'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(PRECACHE))
      .catch(error=>console.warn('Glass Chess cache warm-up was incomplete:',error))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(APP_CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  // Release metadata and worker source must never be answered from a stale application cache.
  if(url.pathname==='/version.json'||url.pathname==='/sw.js'){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'}).then(response=>{
        if(response.ok){const copy=response.clone();void caches.open(CACHE_NAME).then(cache=>cache.put('/',copy));}
        return response;
      }).catch(()=>caches.match('/'))
    );
    return;
  }

  const isApplicationCode=/\.(?:js|mjs|css)$/.test(url.pathname);
  if(isApplicationCode){
    event.respondWith(
      fetch(request,{cache:'no-store'}).then(response=>{
        if(response.ok){const copy=response.clone();void caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
        return response;
      }).catch(()=>caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>{
      if(cached)return cached;
      return fetch(request).then(response=>{
        if(response.ok){const copy=response.clone();void caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
        return response;
      });
    })
  );
});
