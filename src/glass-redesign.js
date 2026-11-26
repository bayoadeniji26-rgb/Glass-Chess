import './glass-redesign.css';
import './update-status.css';
import { APP_VERSION } from './version.js';

(() => {
  'use strict';
  const VERSION_URL='/version.json';
  const UPDATE_POLL_MS=5*60*1000;
  const FETCH_TIMEOUT_MS=12000;
  let updateBanner=null, updateOverlay=null, latestRelease=null, checking=false, updating=false;
  const state={phase:'idle',message:'Release status has not been checked yet.',currentVersion:APP_VERSION,latestVersion:APP_VERSION,checkedAt:null,error:null};

  function compareVersions(left,right){
    const a=String(left).split(/[.-]/).map(part=>Number.parseInt(part,10)||0);
    const b=String(right).split(/[.-]/).map(part=>Number.parseInt(part,10)||0);
    for(let i=0;i<Math.max(a.length,b.length);i++){
      const av=a[i]||0,bv=b[i]||0;
      if(av>bv)return 1;
      if(av<bv)return -1;
    }
    return 0;
  }

  function publish(phase,message,error=null){
    state.phase=phase;state.message=message;state.error=error?String(error.message||error):null;
    state.latestVersion=latestRelease?.version||state.latestVersion||APP_VERSION;
    state.checkedAt=new Date().toISOString();
    window.dispatchEvent(new CustomEvent('glasschess:update-state',{detail:{...state}}));
    if(updateOverlay){
      const status=updateOverlay.querySelector('#gc-update-status');
      const stage=updateOverlay.querySelector('#gc-update-stage');
      if(status)status.textContent=message;
      if(stage)stage.textContent=phase.replaceAll('-',' ').toUpperCase();
      const progress=updateOverlay.querySelector('.gc-update-track');
      const bar=updateOverlay.querySelector('#gc-update-progress-bar');
      const label=updateOverlay.querySelector('#gc-update-progress-label');
      const steps={
        'checking-release':[0,'Checking release'],
        'updating-worker':[1,'Checking application files'],
        'activating-worker':[2,'Activating update'],
        'verifying-release':[3,'Verifying new version'],
        'verified':[4,'Ready to reload']
      };
      const step=steps[phase];
      if(step&&progress&&bar&&label){
        progress.setAttribute('aria-valuenow',String(step[0]));
        bar.style.width=(step[0]*25)+'%';
        label.textContent=step[1];
      }
    }
  }

  async function fetchNoStore(url,options={}){
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
    try{
      return await fetch(url,{...options,cache:'no-store',headers:{
        'Cache-Control':'no-cache, no-store',Pragma:'no-cache',...(options.headers||{})
      },signal:controller.signal});
    }finally{window.clearTimeout(timeout);}
  }

  function makeUpdateUI(){
    if(updateBanner)return;
    updateBanner=document.createElement('aside');
    updateBanner.className='gc-update-banner';
    updateBanner.setAttribute('role','status');
    updateBanner.innerHTML=`
      <div class="gc-update-copy"><span class="gc-update-mark" aria-hidden="true">↻</span>
      <span><strong>NEW UPDATE REQUIRED</strong><small id="gc-update-description">A new Glass Chess release is ready to install.</small></span></div>
      <button type="button" id="gc-update-now">UPDATE NOW <span aria-hidden="true">→</span></button>`;
    document.body.appendChild(updateBanner);
    updateBanner.querySelector('#gc-update-now').addEventListener('click',runUpdate);
    updateOverlay=document.createElement('div');
    updateOverlay.className='gc-update-overlay';
    updateOverlay.setAttribute('role','dialog');
    updateOverlay.setAttribute('aria-modal','true');
    updateOverlay.setAttribute('aria-labelledby','gc-update-title');
    updateOverlay.innerHTML=`
      <section class="gc-update-dialog"><div class="gc-update-dialog-mark" aria-hidden="true">♛</div>
      <p class="gc-update-kicker">GLASS CHESS RELEASE</p><h2 id="gc-update-title">Update required</h2>
      <p id="gc-update-status">Checking the latest release…</p>
      <div class="gc-update-track" role="progressbar" aria-label="Update progress" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0"><span id="gc-update-progress-bar"></span></div>
      <div class="gc-update-progress-row"><span id="gc-update-progress-label">Preparing update</span><strong id="gc-update-stage" aria-live="polite">CHECKING</strong></div>
      <button type="button" id="gc-update-install" class="gc-update-install">Install update now</button>
      <button type="button" id="gc-update-close" class="gc-update-close">Remind me later</button></section>`;
    document.body.appendChild(updateOverlay);
    updateOverlay.querySelector('#gc-update-close').addEventListener('click',()=>{
      if(!updating)updateOverlay.classList.remove('is-open');
    });
    updateOverlay.querySelector('#gc-update-install').addEventListener('click',runUpdate);
  }

  function setDialog(phase,message){
    makeUpdateUI();publish(phase,message);updateOverlay.classList.add('is-open');
    updateOverlay.querySelector('#gc-update-close').hidden=updating;
  }

  async function checkForUpdates(){
    if(checking||updating)return {...state};
    checking=true;publish('checking','Checking the release manifest from the server…');
    try{
      const response=await fetchNoStore(VERSION_URL+'?check='+Date.now());
      if(!response.ok)throw new Error('The release manifest could not be reached.');
      const release=await response.json();
      if(!release||typeof release.version!=='string')throw new Error('The release manifest did not contain a valid version.');
      latestRelease=release;state.latestVersion=release.version;
      if(compareVersions(release.version,APP_VERSION)>0){
        publish('available','A newer release is available.');makeUpdateUI();updateBanner.classList.add('is-visible');
        updateBanner.querySelector('#gc-update-description').textContent=(release.name?release.name+' · ':'')+'Version '+release.version+' is ready. Reload to install the required update.';
        const installButton=updateOverlay.querySelector('#gc-update-install');
        if(installButton)installButton.disabled=false;
        const closeButton=updateOverlay.querySelector('#gc-update-close');
        if(closeButton)closeButton.hidden=false;
        updateOverlay.querySelector('#gc-update-title').textContent='New update required';
        updateOverlay.querySelector('#gc-update-status').textContent='Glass Chess version '+release.version+' is ready. Install it now to get the latest features and fixes.';
        updateOverlay.classList.add('is-open');
      }else{
        publish('current','This browser is running the latest published Glass Chess version.');
        updateBanner?.classList.remove('is-visible');
      }
      return {...state};
    }catch(error){
      publish('offline','Could not verify release status. The current game remains available.',error);
      return {...state};
    }finally{checking=false;}
  }

  function waitForActivation(worker,timeoutMs=15000){
    if(!worker||worker.state==='activated')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let timeout=null;
      const cleanup=()=>{if(timeout!==null)window.clearTimeout(timeout);worker.removeEventListener('statechange',onStateChange);};
      const onStateChange=()=>{
        if(worker.state==='activated'){cleanup();resolve();}
        else if(worker.state==='redundant'){cleanup();reject(new Error('The new service worker was replaced before activation.'));}
      };
      worker.addEventListener('statechange',onStateChange);
      timeout=window.setTimeout(()=>{cleanup();reject(new Error('The application worker did not activate before the verification timeout.'));},timeoutMs);
      onStateChange();
    });
  }

  async function runUpdate(){
    if(updating)return;
    updating=true;makeUpdateUI();
    const button=updateBanner.querySelector('#gc-update-now');
    button.disabled=true;
    const modalButton=updateOverlay.querySelector('#gc-update-install');
    if(modalButton)modalButton.disabled=true;
    setDialog('checking-release','Rechecking the release manifest before changing this page.');
    try{
      const response=await fetchNoStore(VERSION_URL+'?refresh='+Date.now());
      if(!response.ok)throw new Error('The release server could not be reached.');
      const release=await response.json();
      if(!release||typeof release.version!=='string')throw new Error('The release version is invalid.');
      latestRelease=release;state.latestVersion=release.version;
      if(compareVersions(release.version,APP_VERSION)<=0){
        publish('current','No newer release is available. This page is already current.');
        updateBanner.classList.remove('is-visible');updateOverlay.classList.remove('is-open');return;
      }

      setDialog('updating-worker','Asking the browser to check for the newest application worker.');
      if('serviceWorker'in navigator){
        const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
        await registration.update();
        const worker=registration.installing||registration.waiting;
        if(worker){
          if(registration.waiting===worker)worker.postMessage({type:'SKIP_WAITING'});
          setDialog('activating-worker','Waiting for the browser to activate the updated application worker.');
          await waitForActivation(worker);
        }
      }

      setDialog('verifying-release','Fetching the current application page and verifying its embedded release version.');
      const page=await fetchNoStore('/?gc_update='+Date.now());
      if(!page.ok)throw new Error('The latest application page could not be loaded.');
      const html=await page.text();
      const embedded=html.match(/<meta\s+name=["']glass-chess-version["']\s+content=["']([^"']+)["']/i)?.[1];
      if(!embedded)throw new Error('The application page did not report its release version.');
      if(compareVersions(embedded,release.version)<0){
        throw new Error('The release manifest is newer than the application page currently being served. Try again after deployment finishes.');
      }
      updateBanner.classList.remove('is-visible');
      setDialog('verified','Version '+embedded+' is being served and the browser worker check completed. Reloading this page.');
      const destination=window.location.pathname+'?gc_update='+Date.now()+window.location.hash;
      window.location.replace(destination);
    }catch(error){
      publish('error',error.message||'The update could not be verified.',error);
      makeUpdateUI();updateOverlay.classList.add('is-open');
      updateOverlay.querySelector('#gc-update-close').hidden=false;
      button.disabled=false;button.textContent='RETRY UPDATE →';
      const retryModalButton=updateOverlay?.querySelector('#gc-update-install');
      if(retryModalButton)retryModalButton.disabled=false;
    }finally{updating=false;}
  }

  function boot(){
    void checkForUpdates();
    window.setInterval(()=>{if(!document.hidden)void checkForUpdates();},UPDATE_POLL_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkForUpdates();});
  }

  window.GlassChessUpdateStatus={
    getSnapshot:()=>({...state}),
    check:checkForUpdates,
    get currentVersion(){return APP_VERSION;}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
