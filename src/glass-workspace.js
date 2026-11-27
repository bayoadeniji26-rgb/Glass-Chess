import './glass-workspace.css';

(() => {
  const $ = selector => document.querySelector(selector);
  const openClass = 'gc-workspace-drawer-open';
  let active = null;
  let ready = false;
  let settingsObserver = null;

  function moveSettingsContent() {
    const core = $('#gc-settings-core');
    const premiumHost = $('#gc-settings-premium-content');
    const avatarHost = $('#gc-settings-avatar-content');
    if (!core || !premiumHost || !avatarHost) return;

    const options = $('#gc-options');
    if (options && options.parentElement !== core) core.appendChild(options);

    const customize = $('#gc-premium [data-view="custom"]');
    if (customize && customize.parentElement !== premiumHost) {
      customize.classList.remove('gc-view', 'active');
      customize.removeAttribute('data-view');
      customize.id = 'gc-settings-appearance';
      customize.setAttribute('aria-label', 'Appearance settings');
      premiumHost.appendChild(customize);
    }

    for (const id of ['gc-plus-avatar-select', 'gc-plus-banner-select']) {
      const select = document.getElementById(id);
      const field = select?.closest('label');
      if (field && field.parentElement?.id !== 'gc-settings-avatar-content') {
        avatarHost.appendChild(field);
      }
    }
  }

  function boot() {
    const app = $('.app');
    const topbar = $('.topbar');
    const play = $('.side-panel');
    const analysis = $('.analysis-panel');
    if (!app || !topbar || !play || !analysis) return false;
    if (ready) { moveSettingsContent(); return true; }

    const modeSelect = $('#mode');
    if (modeSelect && !modeSelect.querySelector('option[value="online"]')) {
      const onlineOption = document.createElement('option');
      onlineOption.value = 'online';
      onlineOption.textContent = 'Play Online';
      modeSelect.appendChild(onlineOption);
    }

    let actions = $('#gc-workspace-actions');
    if (!actions) {
      actions = document.createElement('nav');
      actions.id = 'gc-workspace-actions';
      actions.setAttribute('aria-label', 'Chess workspace');
      actions.innerHTML = `
        <button type="button" data-workspace-open="play" aria-label="Open play settings">Play</button>
        <button type="button" data-workspace-open="analysis" aria-label="Open analysis panel">Analysis</button>
        <button type="button" data-workspace-open="settings" aria-label="Open appearance and board settings">Settings</button>
        <button type="button" data-workspace-open="tools" aria-label="Open chess tools" aria-expanded="false">Tools</button>
      `;
      const newGame = $('#new-game');
      topbar.insertBefore(actions, newGame || null);
    }

    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.id = 'gc-workspace-scrim';
    scrim.setAttribute('aria-label', 'Close panel');
    document.body.appendChild(scrim);

    let settingsPanel = $('#gc-settings-panel');
    if (!settingsPanel) {
      settingsPanel = document.createElement('aside');
      settingsPanel.id = 'gc-settings-panel';
      settingsPanel.innerHTML = `
        <section id="gc-settings-content">
          <p class="eyebrow">APPEARANCE & BOARD</p>
          <p class="gc-settings-intro">Your board themes, piece designs, colors, sounds, avatars and visual preferences live here.</p>
          <div id="gc-settings-core"></div>
          <section id="gc-settings-premium-content" aria-label="Premium appearance settings"></section>
          <section id="gc-settings-avatar-content" aria-label="Profile icons and banners"></section>
        </section>
      `;
    }

    function prepareDrawer(panel, side, title) {
      panel.classList.add('gc-workspace-drawer', ...side.split(/\\s+/).filter(Boolean));
      panel.setAttribute('aria-label', title);
      if (panel.querySelector(':scope > .gc-workspace-drawer-heading')) return;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gc-workspace-close';
      close.setAttribute('aria-label', 'Close panel');
      close.textContent = '×';
      const heading = document.createElement('div');
      heading.className = 'gc-workspace-drawer-heading';
      const titleNode = document.createElement('span');
      titleNode.textContent = title;
      heading.append(titleNode, close);
      panel.insertBefore(heading, panel.firstChild);
      close.addEventListener('click', closeDrawer);
    }

    prepareDrawer(play, 'gc-workspace-left', 'Play settings');
    prepareDrawer(analysis, 'gc-workspace-right', 'Analysis Studio');
    prepareDrawer(settingsPanel, 'gc-workspace-right gc-settings-drawer', 'Settings');
    document.body.append(play, analysis, settingsPanel);

    function closeDrawer() {
      active = null;
      document.body.classList.remove(openClass);
      play.classList.remove('gc-drawer-visible');
      analysis.classList.remove('gc-drawer-visible');
      settingsPanel.classList.remove('gc-drawer-visible');
      scrim.classList.remove('gc-scrim-visible');
      actions.querySelectorAll('button').forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    function openDrawer(which) {
      window.GlassChessTools?.close?.();
      if (active === which) { closeDrawer(); return; }
      active = which;
      document.body.classList.add(openClass);
      play.classList.toggle('gc-drawer-visible', which === 'play');
      analysis.classList.toggle('gc-drawer-visible', which === 'analysis');
      settingsPanel.classList.toggle('gc-drawer-visible', which === 'settings');
      scrim.classList.add('gc-scrim-visible');
      actions.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-expanded', String(button.dataset.workspaceOpen === which));
      });
      requestAnimationFrame(() => {
        const drawer = which === 'analysis' ? analysis : which === 'settings' ? settingsPanel : play;
        drawer.scrollTop = 0;
        moveSettingsContent();
      });
    }

    actions.addEventListener('click', event => {
      const button = event.target.closest('[data-workspace-open]');
      if (!button) return;
      if (button.dataset.workspaceOpen === 'tools') {
        closeDrawer();
        window.GlassChessTools?.toggle?.();
        return;
      }
      openDrawer(button.dataset.workspaceOpen);
    });

    play.addEventListener('click', event => {
      if (event.target.closest('#start-game,[data-play-online]')) closeDrawer();
    }, true);

    scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) closeDrawer();
    });

    play.classList.add('gc-workspace-drawer', 'gc-workspace-left');
    analysis.classList.add('gc-workspace-drawer', 'gc-workspace-right');
    play.classList.remove('gc-drawer-visible');
    analysis.classList.remove('gc-drawer-visible');
    settingsPanel.classList.remove('gc-drawer-visible');

    const quick = $('.board-controls');
    if (quick) quick.setAttribute('aria-label', 'Board controls');
    ready = true;
    moveSettingsContent();

    settingsObserver = new MutationObserver(moveSettingsContent);
    settingsObserver.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      settingsObserver?.disconnect();
      settingsObserver = null;
    }, 30000);
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  window.setTimeout(boot, 250);
  window.setTimeout(boot, 900);
})();
