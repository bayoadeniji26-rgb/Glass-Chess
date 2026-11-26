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

    play.id = 'gc-play-drawer';
    analysis.id = 'gc-analysis-drawer';

    const actions = document.createElement('nav');
    actions.id = 'gc-workspace-actions';
    actions.setAttribute('aria-label', 'Chess workspace');
    actions.innerHTML = `
      <button type="button" data-workspace-open="play" aria-controls="gc-play-drawer" aria-expanded="false">Play</button>
      <button type="button" data-workspace-open="analysis" aria-controls="gc-analysis-drawer" aria-expanded="false">Analysis</button>
      <button type="button" data-workspace-open="tools" aria-controls="gc-floating-hub" aria-expanded="false">Tools</button>
    `;
    const newGame = $('#new-game');
    topbar.insertBefore(actions, newGame || null);

    const scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.id = 'gc-workspace-scrim';
    scrim.setAttribute('aria-label', 'Close panel');
    scrim.tabIndex = -1;
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
      heading.tabIndex = -1;
      heading.innerHTML = `<span>${title}</span>`;
      heading.appendChild(close);
      panel.insertBefore(heading, panel.firstChild);
      close.addEventListener('click', closeDrawer);
    }

    prepareDrawer(play, 'gc-workspace-left', 'Play');
    prepareDrawer(analysis, 'gc-workspace-right', 'Analysis');
    document.body.append(play, analysis);

    function closeDrawer() {
      active = null;
      document.body.classList.remove(openClass);
      play.classList.remove('gc-drawer-visible');
      analysis.classList.remove('gc-drawer-visible');
      scrim.classList.remove('gc-scrim-visible');
      actions.querySelectorAll('button[data-workspace-open="play"], button[data-workspace-open="analysis"]')
        .forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    function openDrawer(which) {
      if (which === 'tools') {
        closeDrawer();
        if (window.GlassChessTools?.toggle) window.GlassChessTools.toggle();
        else window.dispatchEvent(new CustomEvent('glasschess:toggle-tools'));
        return;
      }

      // There should only ever be one open panel. The Tools hub is separate,
      // so close it before opening either of the two focused workspace drawers.
      window.GlassChessTools?.close?.();
      if (active === which) {
        closeDrawer();
        return;
      }

      active = which;
      document.body.classList.add(openClass);
      play.classList.toggle('gc-drawer-visible', which === 'play');
      analysis.classList.toggle('gc-drawer-visible', which === 'analysis');
      scrim.classList.add('gc-scrim-visible');
      actions.querySelectorAll('button[data-workspace-open="play"], button[data-workspace-open="analysis"]')
        .forEach(button => button.setAttribute('aria-expanded', String(button.dataset.workspaceOpen === which)));

      const drawer = which === 'analysis' ? analysis : play;
      requestAnimationFrame(() => {
        drawer.scrollTop = 0;
        drawer.querySelector('.gc-workspace-close')?.focus?.({ preventScroll: true });
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
    window.addEventListener('glasschess:tools-state', event => {
      const toolsButton = actions.querySelector('[data-workspace-open="tools"]');
      toolsButton?.setAttribute('aria-expanded', String(Boolean(event.detail?.open)));
    });

    // Existing content stays alive; only its presentation changes.
    play.classList.remove('gc-drawer-visible');
    analysis.classList.remove('gc-drawer-visible');

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
