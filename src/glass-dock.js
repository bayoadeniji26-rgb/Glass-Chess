import "./glass-dock.css";

(() => {
  const DOCK_ID = "gc-floating-hub";
  const panelSelectors = [
    "#gc-online-plus",
    ".gc-online-plus-panel"
  ];

  const categories = [
    { id: "analysis", label: "Analysis", icon: "◉", terms: ["analysis", "evaluation", "best move", "captures", "engine"] },
    { id: "play", label: "Play & online", icon: "♟", terms: ["online", "room", "invite", "friend", "spectat", "game mode", "play"] },
    { id: "progress", label: "Progress", icon: "✦", terms: ["profile", "rating", "statistic", "achievement", "mission", "xp", "streak"] },
    { id: "learn", label: "Learn", icon: "▤", terms: ["puzzle", "opening", "lesson", "daily challenge", "game of the day"] },
    { id: "style", label: "Appearance", icon: "◈", terms: ["theme", "piece", "avatar", "banner", "customiz", "sound", "animation"] },
    { id: "settings", label: "Settings", icon: "⚙", terms: ["setting", "preference", "option", "personality"] }
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
    button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
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
            <span><strong>Glass Hub</strong><small>All your chess tools, together</small></span>
          </div>
          <div class="gc-hub-header-actions">
            <button class="gc-hub-density" type="button" aria-pressed="false" title="Toggle compact layout">↕</button>
            <button class="gc-hub-close" type="button" aria-label="Close Glass Hub" title="Close">×</button>
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
    const density = dock.querySelector(".gc-hub-density");

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

    const headingNodes = () => Array.from(panel.querySelectorAll("h1,h2,h3,h4,.eyebrow,[data-section-title]"));
    const findHeading = terms => headingNodes().find(node => {
      const text = (node.textContent || "").trim().toLowerCase();
      return text && terms.some(term => text.includes(term));
    });

    function goTo(target) {
      if (!target) return;
      openHub();
      requestAnimationFrame(() => {
        const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 14;
        scroll.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        target.classList.remove("gc-hub-target-flash");
        void target.offsetWidth;
        target.classList.add("gc-hub-target-flash");
      });
    }

    function buildShortcuts() {
      shortcuts.replaceChildren();
      const all = iconButton("Show all tools", "⌂", "gc-hub-shortcut-all");
      all.addEventListener("click", () => scroll.scrollTo({ top: 0, behavior: "smooth" }));
      shortcuts.appendChild(all);
      for (const item of categories) {
        const target = findHeading(item.terms);
        if (!target) continue;
        const button = iconButton(item.label, item.icon, "gc-hub-shortcut");
        button.dataset.section = item.id;
        button.addEventListener("click", () => goTo(target));
        shortcuts.appendChild(button);
      }
    }

    function openHub() {
      dock.classList.add("gc-hub-open");
      orb.setAttribute("aria-expanded", "true");
      drawer.setAttribute("aria-hidden", "false");
      orb.setAttribute("aria-label", "Close Glass Hub");
      orb.title = "Close Glass Hub";
    }

    function closeHub() {
      dock.classList.remove("gc-hub-open");
      orb.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", "true");
      orb.setAttribute("aria-label", "Open Glass Hub");
      orb.title = "Open Glass Hub";
    }

    orb.addEventListener("click", () => dock.classList.contains("gc-hub-open") ? closeHub() : openHub());
    backdrop.addEventListener("click", closeHub);
    close.addEventListener("click", closeHub);
    density.addEventListener("click", () => {
      const enabled = dock.classList.toggle("gc-hub-compact");
      density.setAttribute("aria-pressed", String(enabled));
      density.title = enabled ? "Use comfortable spacing" : "Toggle compact layout";
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && dock.classList.contains("gc-hub-open")) closeHub();
    });

    // Rebuild quick links if Online Plus adds its controls after the initial page render.
    buildShortcuts();
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
