import "./glass-dock.css";

(() => {
  const DOCK_ID = "gc-floating-hub";
  const panelSelectors = ["#gc-premium", "#gc-online-plus", ".gc-online-plus-panel"];

  const categories = [
    { id: "analysis", label: "Analysis", icon: "◉", description: "Live Stockfish evaluations, best moves and game review.", terms: ["live engine lab", "analysis", "evaluation", "best move"] },
    { id: "play", label: "Play & Online", icon: "♟", description: "Find opponents, invite friends, join rooms and manage matches.", terms: ["online multiplayer", "room chat", "quick match", "online"] },
    { id: "progress", label: "Progress", icon: "✦", description: "Your player profile, rating, achievements, XP and daily goals.", terms: ["player identity", "player profile", "rating", "daily missions"] },
    { id: "learn", label: "Learn", icon: "▤", description: "Chess puzzles, opening ideas and guided training tools.", terms: ["engine-generated puzzle", "training routine", "puzzle", "opening explorer"] },
    { id: "settings", label: "Settings", icon: "⚙", description: "Engine personality, sound, animation and workspace preferences.", terms: ["sound & animation studio", "engine personality", "settings", "personality"] }
  ];

  function findPanel() {
    for (const selector of panelSelectors) {
      const found = document.querySelector(selector);
      if (found && !found.closest(`#${DOCK_ID}`)) return found;
    }
    return null;
  }

  function init(panel) {
    if (!panel || document.getElementById(DOCK_ID)) return;

    const dock = document.createElement("div");
    dock.id = DOCK_ID;
    dock.innerHTML = `
      <button class="gc-hub-backdrop" type="button" aria-label="Close Tools popup"></button>
      <section class="gc-hub-drawer" role="dialog" aria-modal="true" aria-label="Glass Chess tools" aria-hidden="true">
        <header class="gc-hub-header">
          <div class="gc-hub-brand">
            <span class="gc-hub-brand-mark" aria-hidden="true">♛</span>
            <span><strong>Glass Chess Tools</strong><small>Choose a section to open its features</small></span>
          </div>
          <button class="gc-hub-close" type="button" aria-label="Close Tools popup" title="Close">×</button>
        </header>
        <nav class="gc-hub-shortcuts" aria-label="Tool categories"></nav>
        <div class="gc-hub-scroll" tabindex="0" aria-label="Scrollable tools"><div class="gc-hub-content"></div></div>
        <footer class="gc-hub-footer"><span class="gc-hub-live-dot"></span><span>All original chess tools are available</span><span class="gc-hub-footer-spacer"></span><span>ESC to close</span></footer>
      </section>
    `;
    document.body.appendChild(dock);

    const drawer = dock.querySelector(".gc-hub-drawer");
    const backdrop = dock.querySelector(".gc-hub-backdrop");
    const close = dock.querySelector(".gc-hub-close");
    const content = dock.querySelector(".gc-hub-content");
    const shortcuts = dock.querySelector(".gc-hub-shortcuts");
    const scroll = dock.querySelector(".gc-hub-scroll");

    // Move the existing feature panel; never clone it or detach its event handlers.
    const anchor = document.createElement("div");
    anchor.className = "gc-hub-original-panel-anchor";
    anchor.setAttribute("aria-hidden", "true");
    panel.parentNode.insertBefore(anchor, panel);
    content.appendChild(panel);
    panel.classList.add("gc-hub-docked-panel");

    const parent = anchor.parentElement;
    if (parent && getComputedStyle(parent).display.includes("grid")) {
      parent.classList.add("gc-hub-panel-grid-parent");
    }

    const headingNodes = () => Array.from(panel.querySelectorAll("h1,h2,h3,h4,.eyebrow,[data-section-title]"));
    const findHeading = terms => headingNodes().find(node => {
      const value = (node.textContent || "").trim().toLowerCase();
      return value && terms.some(term => value.includes(term));
    });

    function syncTopbarButton(open) {
      const button = document.querySelector('#gc-workspace-actions [data-workspace-open="tools"]');
      if (button) button.setAttribute("aria-expanded", String(open));
    }

    function openHub() {
      dock.classList.add("gc-hub-open");
      drawer.setAttribute("aria-hidden", "false");
      syncTopbarButton(true);
    }

    function closeHub() {
      dock.classList.remove("gc-hub-open");
      drawer.setAttribute("aria-hidden", "true");
      syncTopbarButton(false);
    }

    function scrollToTarget(target) {
      if (!target) return;
      const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 14;
      scroll.scrollTo({
        top: Math.max(0, top),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
      target.classList.remove("gc-hub-target-flash");
      void target.offsetWidth;
      target.classList.add("gc-hub-target-flash");
    }

    function goTo(target) {
      if (!target) return;
      openHub();
      // If the target belongs to a hidden feature tab, activate that tab first.
      const view = target.closest(".gc-view[data-view]");
      if (view) {
        const tab = panel.querySelector(`.gc-tabs [data-tab="${view.dataset.view}"]`);
        if (tab && !tab.classList.contains("active")) tab.click();
      }
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToTarget(target)));
    }

    function openOnline() {
      openHub();
      const reveal = () => {
        const tab = panel.querySelector('.gc-tabs [data-tab="onlineplus"]');
        if (tab && !tab.classList.contains("active")) tab.click();
        const target = findHeading(["online multiplayer"]);
        if (target) scrollToTarget(target);
      };
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    }

    function buildShortcuts() {
      shortcuts.replaceChildren();
      for (const item of categories) {
        const target = findHeading(item.terms);
        if (!target) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gc-hub-category";
        button.dataset.section = item.id;
        button.innerHTML = `
          <span class="gc-hub-category-icon" aria-hidden="true">${item.icon}</span>
          <span class="gc-hub-category-copy"><strong>${item.label}</strong><small>${item.description}</small></span>
          <span class="gc-hub-category-arrow" aria-hidden="true">↗</span>
        `;
        button.addEventListener("click", () => goTo(target));
        shortcuts.appendChild(button);
      }
    }

    window.GlassChessTools = {
      open: openHub,
      close: closeHub,
      toggle: () => dock.classList.contains("gc-hub-open") ? closeHub() : openHub(),
      openOnline,
      isOpen: () => dock.classList.contains("gc-hub-open")
    };

    backdrop.addEventListener("click", closeHub);
    close.addEventListener("click", closeHub);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && dock.classList.contains("gc-hub-open")) closeHub();
    });

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
