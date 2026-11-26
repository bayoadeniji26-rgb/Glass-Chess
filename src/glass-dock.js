import "./glass-dock.css";

(() => {
  const DOCK_ID = "gc-floating-hub";
  // The current Tools content is mounted by premium.js as #gc-premium.
  // Keep legacy selectors as fallbacks for older layouts.
  const panelSelectors = [
    "#gc-premium",
    "#gc-online-plus",
    ".gc-online-plus-panel"
  ];

  const categories = [
    { id: "home", label: "Overview", icon: "⌂" },
    { id: "train", label: "Train", icon: "▤" },
    { id: "review", label: "Review", icon: "↺" },
    { id: "custom", label: "Customize", icon: "◈" },
    { id: "onlineplus", label: "Online", icon: "♟" },
    { id: "game-lab", label: "Game Lab", icon: "♜" },
    { id: "advanced-lab", label: "Advanced", icon: "⚙" }
  ];

  function findPanel() {
    for (const selector of panelSelectors) {
      const found = document.querySelector(selector);
      if (found && !found.closest(`#${DOCK_ID}`)) return found;
    }
    return null;
  }

  function iconButton(label, icon, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `gc-hub-icon-button ${className}`.trim();
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<span aria-hidden="true">${icon}</span><small>${label === "Show all tools" ? "All" : label}</small>`;
    return button;
  }

  function init(panel) {
    if (!panel || document.getElementById(DOCK_ID)) return;

    const dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.innerHTML = `
      <button class="gc-hub-backdrop" type="button" aria-label="Close Glass Hub"></button>
      <section class="gc-hub-drawer" aria-label="Glass Chess tools" aria-hidden="true">
        <header class="gc-hub-header">
          <div class="gc-hub-brand">
            <span class="gc-hub-brand-mark" aria-hidden="true">♛</span>
            <span><strong>Tools</strong><small>Training, online play, progress and settings</small></span>
          </div>
          <div class="gc-hub-header-actions">
            <button class="gc-hub-close" type="button" aria-label="Close tools" title="Close">×</button>
          </div>
        </header>
        <nav class="gc-hub-shortcuts" aria-label="Quick sections"></nav>
        <div class="gc-hub-scroll"><div class="gc-hub-content"></div></div>
        <footer class="gc-hub-footer"><span class="gc-hub-live-dot"></span><span>Glass Chess workspace</span><span class="gc-hub-footer-spacer"></span><span>ESC to close</span></footer>
      </section>
      <button class="gc-hub-orb" type="button" aria-expanded="false" aria-controls="gc-floating-hub" aria-label="Open Glass Hub" title="Open Glass Hub">
        <span class="gc-hub-orb-glyph" aria-hidden="true">♛</span>
        <span class="gc-hub-orb-label">TOOLS</span>
        <span class="gc-hub-orb-pulse" aria-hidden="true"></span>
      </button>
    `;
    document.body.appendChild(dock);

    const drawer = dock.querySelector(".gc-hub-drawer");
    const orb = dock.querySelector(".gc-hub-orb");
    const backdrop = dock.querySelector(".gc-hub-backdrop");
    const close = dock.querySelector(".gc-hub-close");
    const content = dock.querySelector(".gc-hub-content");
    const shortcuts = dock.querySelector(".gc-hub-shortcuts");
    const scroll = dock.querySelector(".gc-hub-scroll");

    // Move the existing right-hand panel; do not clone it, so its buttons and app logic keep working.
    const anchor = document.createElement("div");
    anchor.className = "gc-hub-original-panel-anchor";
    anchor.setAttribute("aria-hidden", "true");
    panel.parentNode.insertBefore(anchor, panel);
    content.appendChild(panel);
    panel.classList.add("gc-hub-docked-panel");

    // When the old panel occupied a grid column, let the board use the freed space.
    const parent = anchor.parentElement;
    if (parent) {
      const display = getComputedStyle(parent).display;
      if (display.includes("grid")) {
        parent.classList.add("gc-hub-panel-grid-parent");
      }
    }

    function viewFor(id) {
      return Array.from(panel.querySelectorAll("[data-view]")).find(view => view.dataset.view === id) || null;
    }

    function tabFor(id) {
      return Array.from(panel.querySelectorAll("[data-tab]")).find(tab => tab.dataset.tab === id) || null;
    }

    function buildShortcuts() {
      shortcuts.replaceChildren();
      for (const item of categories) {
        const view = viewFor(item.id);
        const tab = tabFor(item.id);
        if (!view || !tab) continue;
        const button = iconButton(item.label, item.icon, "gc-hub-shortcut");
        button.dataset.section = item.id;
        button.setAttribute("aria-pressed", String(view.classList.contains("active")));
        button.classList.toggle("active", view.classList.contains("active"));
        button.addEventListener("click", () => {
          tab.click();
          shortcuts.querySelectorAll("[data-section]").forEach(shortcut => {
            const selected = shortcut.dataset.section === item.id;
            shortcut.classList.toggle("active", selected);
            shortcut.setAttribute("aria-pressed", String(selected));
          });
          scroll.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        });
        shortcuts.appendChild(button);
      }
    }

    function openHub() {
      dock.classList.add("gc-hub-open");
      orb.setAttribute("aria-expanded", "true");
      drawer.setAttribute("aria-hidden", "false");
      orb.setAttribute("aria-label", "Close Tools");
      orb.title = "Close Tools";
      publishToolsState(true);
    }

    function closeHub() {
      dock.classList.remove("gc-hub-open");
      orb.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", "true");
      orb.setAttribute("aria-label", "Open Tools");
      orb.title = "Open Tools";
      publishToolsState(false);
    }

    function toggleHub() {
      if (dock.classList.contains("gc-hub-open")) closeHub();
      else openHub();
    }

    window.GlassChessTools = {
      open: openHub,
      close: closeHub,
      toggle: toggleHub,
      isOpen: () => dock.classList.contains("gc-hub-open")
    };
    window.addEventListener("glasschess:toggle-tools", toggleHub);
    orb.addEventListener("click", toggleHub);
    backdrop.addEventListener("click", closeHub);
    close.addEventListener("click", closeHub);
    publishToolsState(false);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && dock.classList.contains("gc-hub-open")) closeHub();
    });

    // The hub strip is the Tools tab navigation, not a scroll-only shortcut.
    buildShortcuts();
    panel.addEventListener("click", event => {
      if (event.target.closest("[data-tab]")) requestAnimationFrame(buildShortcuts);
    });
    // Online + Club and Advanced tabs mount after the core suite.
    const observer = new MutationObserver(() => buildShortcuts());
    observer.observe(panel, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 12000);
  }

  function boot() {
    const existing = findPanel();
    if (existing) {
      init(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const panel = findPanel();
      if (panel) {
        observer.disconnect();
        init(panel);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
