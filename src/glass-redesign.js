import './glass-redesign.css';

(() => {
  'use strict';

  // Bump this value whenever a new release is published. public/version.json
  // must be changed to the same value in that release.
  const APP_VERSION = '2026.11.24.5';
  const VERSION_URL = '/version.json';
  let updateBanner = null;
  let updateOverlay = null;
  let latestVersion = '';
  let updating = false;

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function compareVersions(left, right) {
    const a = String(left).split(/[.\\-]/).map(part => Number.parseInt(part, 10) || 0);
    const b = String(right).split(/[.\\-]/).map(part => Number.parseInt(part, 10) || 0);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function makeUpdateUI() {
    if (updateBanner) return;
    updateBanner = document.createElement('aside');
    updateBanner.className = 'gc-update-banner';
    updateBanner.setAttribute('role', 'alert');
    updateBanner.innerHTML = `
      <div class="gc-update-copy">
        <span class="gc-update-mark" aria-hidden="true">↻</span>
        <span><strong>NEW UPDATE REQUIRED</strong><small id="gc-update-description">A newer Glass Chess release is ready.</small></span>
      </div>
      <button type="button" id="gc-update-now">UPDATE NOW <span aria-hidden="true">→</span></button>
    `;
    document.body.appendChild(updateBanner);
    updateBanner.querySelector('#gc-update-now').addEventListener('click', runUpdate);

    updateOverlay = document.createElement('div');
    updateOverlay.className = 'gc-update-overlay';
    updateOverlay.setAttribute('role', 'dialog');
    updateOverlay.setAttribute('aria-modal', 'true');
    updateOverlay.setAttribute('aria-labelledby', 'gc-update-title');
    updateOverlay.innerHTML = `
      <section class="gc-update-dialog">
        <div class="gc-update-dialog-mark">♛</div>
        <p class="gc-update-kicker">GLASS CHESS RELEASE</p>
        <h2 id="gc-update-title">Updating your workspace</h2>
        <p id="gc-update-status">Connecting to the latest release…</p>
        <div class="gc-update-track"><span id="gc-update-progress"></span></div>
        <div class="gc-update-progress-row"><span id="gc-update-stage">Preparing</span><strong id="gc-update-percent">0%</strong></div>
        <button type="button" id="gc-update-close" class="gc-update-close">Close</button>
      </section>
    `;
    document.body.appendChild(updateOverlay);
    updateOverlay.querySelector('#gc-update-close').addEventListener('click', () => {
      if (!updating) updateOverlay.classList.remove('is-open');
    });
  }

  function setProgress(value, stage, status) {
    const safe = Math.max(0, Math.min(100, value));
    updateOverlay.querySelector('#gc-update-progress').style.width = safe + '%';
    updateOverlay.querySelector('#gc-update-percent').textContent = Math.round(safe) + '%';
    updateOverlay.querySelector('#gc-update-stage').textContent = stage;
    updateOverlay.querySelector('#gc-update-status').textContent = status;
  }

  async function runUpdate() {
    if (updating || !latestVersion) return;
    updating = true;
    makeUpdateUI();
    const button = updateBanner.querySelector('#gc-update-now');
    button.disabled = true;
    updateOverlay.classList.add('is-open');
    updateOverlay.querySelector('#gc-update-close').hidden = true;

    try {
      setProgress(12, 'Checking release', 'Confirming the newest Glass Chess version…');
      const response = await fetch(VERSION_URL + '?refresh=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('The release server could not be reached.');
      const release = await response.json();
      if (!release.version || compareVersions(release.version, APP_VERSION) <= 0) {
        updateBanner.remove();
        updateOverlay.classList.remove('is-open');
        updating = false;
        return;
      }

      setProgress(38, 'Preparing app', 'The latest release is verified. Preparing a fresh app shell…');
      const page = await fetch('/?gc_update=' + Date.now(), { cache: 'reload' });
      if (!page.ok) throw new Error('The latest app page could not be loaded.');
      await wait(240);

      setProgress(72, 'Refreshing workspace', 'Refreshing the game, tools, and saved preferences…');
      await wait(300);
      setProgress(100, 'Installing release', 'Opening the updated Glass Chess workspace…');
      await wait(320);
      const destination = window.location.pathname + '?gc_update=' + Date.now() + window.location.hash;
      window.location.replace(destination);
    } catch (error) {
      setProgress(100, 'Update paused', error.message || 'Could not connect. Check your internet and try again.');
      updateOverlay.querySelector('#gc-update-close').hidden = false;
      button.disabled = false;
      button.textContent = 'RETRY UPDATE →';
      updating = false;
    }
  }

  async function checkForUpdates() {
    try {
      const response = await fetch(VERSION_URL + '?check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const release = await response.json();
      if (!release.version || compareVersions(release.version, APP_VERSION) <= 0) return;
      latestVersion = String(release.version);
      makeUpdateUI();
      updateBanner.classList.add('is-visible');
      updateBanner.querySelector('#gc-update-description').textContent =
        (release.name ? release.name + ' · ' : '') + 'Version ' + latestVersion + ' is ready to install.';
    } catch (error) {
      // Offline or blocked update checks should never interrupt a chess game.
      console.debug('Glass Chess update check unavailable:', error);
    }
  }

  function keepToolsAccessible() {
    const orb = document.querySelector('#gc-floating-hub .gc-hub-orb');
    if (!orb) return;
    orb.style.setProperty('display', 'flex', 'important');
    orb.style.setProperty('visibility', 'visible', 'important');
    orb.style.setProperty('opacity', '1', 'important');
    orb.style.setProperty('pointer-events', 'auto', 'important');
    orb.setAttribute('aria-label', 'Open Glass Chess Tools');
    orb.title = 'Open Glass Chess Tools';
  }

  function boot() {
    keepToolsAccessible();
    const observer = new MutationObserver(() => keepToolsAccessible());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 12000);
    void checkForUpdates();
    window.setInterval(() => {
      if (!document.hidden) void checkForUpdates();
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void checkForUpdates();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
