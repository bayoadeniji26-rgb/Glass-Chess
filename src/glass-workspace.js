import './glass-workspace.css';

(() => {
  const $ = selector => document.querySelector(selector);
  const openClass = 'gc-workspace-drawer-open';
  let active = null;

  function boot() {
    const app = $('.app');
    const topbar = $('.topbar');
    const play = $('.side-panel');
    const analysis = $('.analysis-panel');
    if (!app || !topbar || !play || !analysis) return false;
    if ($('#gc-workspace-actions')) return true;

    const actions = document.createElement('nav');
    actions.id = 'gc-workspace-actions';
    actions.setAttribute('aria-label', 'Chess workspace');
    actions.innerHTML = `
      <button type="button" data-workspace-open="play" aria-label="Open play settings">Play</button>
      <button type="button" data-workspace-open="analysis" aria-label="Open analysis panel">Analysis</button>
      <button type="button" data-workspace-open="settings" aria-label="Open board settings">Settings</button>
    `;
    const newGame = $('#new-game');
    topbar.insertBefore(actions, newGame || null);

    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.id = 'gc-workspace-scrim';
    scrim.setAttribute('aria-label', 'Close panel');
    document.body.appendChild(scrim);

    function prepareDrawer(panel, side, title) {
      panel.classList.add('gc-workspace-drawer', side);
      panel.setAttribute('aria-label', title);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gc-workspace-close';
      close.setAttribute('aria-label', 'Close panel');
      close.textContent = '×';
      const heading = document.createElement('div');
      heading.className = 'gc-workspace-drawer-heading';
      heading.innerHTML = `<span>${title}</span>`;
      heading.appendChild(close);
      panel.insertBefore(heading, panel.firstChild);
      close.addEventListener('click', closeDrawer);
    }

    prepareDrawer(play, 'gc-workspace-left', 'Play settings');
    prepareDrawer(analysis, 'gc-workspace-right', 'Analysis Studio');

    // Drawers live directly under body so the board layout cannot clip them.
    document.body.append(play, analysis);

    function closeDrawer() {
      active = null;
      document.body.classList.remove(openClass);
      play.classList.remove('gc-drawer-visible');
      analysis.classList.remove('gc-drawer-visible');
      scrim.classList.remove('gc-scrim-visible');
      actions.querySelectorAll('button').forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    function openDrawer(which) {
      if (active === which) { closeDrawer(); return; }
      active = which;
      document.body.classList.add(openClass);
      play.classList.toggle('gc-drawer-visible', which === 'play' || which === 'settings');
      analysis.classList.toggle('gc-drawer-visible', which === 'analysis');
      scrim.classList.add('gc-scrim-visible');
      actions.querySelectorAll('button').forEach(button => {
        button.setAttribute('aria-expanded', String(button.dataset.workspaceOpen === which));
      });
      const target = which === 'settings' ? $('#gc-options') : null;
      requestAnimationFrame(() => {
        const drawer = which === 'analysis' ? analysis : play;
        if (target) target.scrollIntoView({ block: 'start' });
        else drawer.scrollTop = 0;
      });
    }

    actions.addEventListener('click', event => {
      const button = event.target.closest('[data-workspace-open]');
      if (button) openDrawer(button.dataset.workspaceOpen);
    });
    scrim.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) closeDrawer();
    });

    // Existing page content remains in the DOM; only its presentation changes.
    play.classList.remove('gc-workspace-drawer');
    analysis.classList.remove('gc-workspace-drawer');
    play.classList.add('gc-workspace-drawer', 'gc-workspace-left');
    analysis.classList.add('gc-workspace-drawer', 'gc-workspace-right');
    play.classList.remove('gc-drawer-visible');
    analysis.classList.remove('gc-drawer-visible');

    // Keep the compact board actions available without opening a drawer.
    const quick = $('.board-controls');
    if (quick) quick.setAttribute('aria-label', 'Board controls');
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
