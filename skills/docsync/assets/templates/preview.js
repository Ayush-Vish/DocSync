// DocSync Presentation Runtime v2.0
// Self-contained controls for standalone previews and isolated DocSync artifacts.
(() => {
  // ── 1. Detect slides ──────────────────────────────────────────────────
  const slides = [...document.querySelectorAll(".slide, .page")];
  const isPresentation = slides.length > 1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Accent color: try to read from the first slide's computed style
  function getAccent() {
    if (!slides.length) return "#53674d";
    const val = getComputedStyle(slides[0]).getPropertyValue("--chart-accent").trim();
    return val || "#53674d";
  }

  // ── 2. Inject runtime styles ──────────────────────────────────────────
  const runtimeCSS = document.createElement("style");
  runtimeCSS.textContent = [
    /* Progress bar */
    "#ds-progress{position:fixed;top:0;left:0;height:3px;background:var(--ds-accent,var(--chart-accent,#53674d));transition:width .3s ease;z-index:10001;pointer-events:none}",
    /* Toolbar */
    "#ds-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;font:13px/1.4 system-ui,sans-serif;background:#fff;color:#172033;border-bottom:1px solid #e0e0e0;position:relative;z-index:10000;user-select:none}",
    "#ds-toolbar button{padding:6px 12px;border:1px solid #ccc;background:#fff;color:#172033;border-radius:6px;cursor:pointer;font:inherit;transition:background .15s,border-color .15s}",
    "#ds-toolbar button:hover:not(:disabled){background:#f0f0f0;border-color:#aaa}",
    "#ds-toolbar button:disabled{opacity:.4;cursor:default}",
    "#ds-toolbar button[data-active='true']{background:#172033;color:#fff;border-color:#172033}",
    "#ds-toolbar .ds-separator{width:1px;height:20px;background:#ddd;margin:0 4px}",
    "#ds-toolbar .ds-status{font-variant-numeric:tabular-nums;opacity:.7;margin-left:auto;font-size:12px}",
    "#ds-toolbar .ds-notes-preview{font-size:12px;max-height:60px;overflow-y:auto;background:#fffbe6;border:1px solid #e8d44d;border-radius:6px;padding:6px 10px;width:100%;margin-top:4px;line-height:1.5}",
    /* Slide transitions */
    ".ds-slide-enter{opacity:0;transform:translateX(30px)}",
    ".ds-slide-active{opacity:1;transform:translateX(0);transition:opacity .25s ease,transform .25s ease}",
    ".ds-slide-enter-prev{opacity:0;transform:translateX(-30px)}",
    /* Reduced motion: opacity only */
    "@media(prefers-reduced-motion:reduce){.ds-slide-enter,.ds-slide-enter-prev{transform:none}.ds-slide-active{transition:opacity .2s ease}}",
    /* Speaker notes: hidden during presentation */
    ".speaker-notes{display:none!important}",
    /* Grid overview */
    "#ds-grid-overlay{position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,.85);overflow-y:auto;padding:32px;display:none;place-content:start center}",
    "#ds-grid-overlay.ds-open{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}",
    "#ds-grid-overlay .ds-grid-item{cursor:pointer;background:#111;border:2px solid transparent;border-radius:8px;overflow:hidden;position:relative;transition:border-color .15s}",
    "#ds-grid-overlay .ds-grid-item:hover,#ds-grid-overlay .ds-grid-item[data-current]{border-color:var(--ds-accent,var(--chart-accent,#53674d))}",
    "#ds-grid-overlay .ds-grid-item-inner{pointer-events:none;transform-origin:top left}",
    "#ds-grid-overlay .ds-grid-label{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;font:12px system-ui;padding:4px 8px;text-align:center}",
    /* Fullscreen floating controls */
    "#ds-float-bar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10003;display:none;align-items:center;gap:8px;padding:8px 16px;background:rgba(23,32,51,.88);backdrop-filter:blur(8px);border-radius:32px;transition:opacity .3s;color:#fff;font:13px system-ui}",
    "#ds-float-bar button{padding:5px 10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:6px;cursor:pointer;font:inherit}",
    "#ds-float-bar button:hover{background:rgba(255,255,255,.15)}",
    "#ds-float-bar .ds-float-status{font-variant-numeric:tabular-nums;font-size:12px;opacity:.8}",
    "body.ds-fullscreen #ds-toolbar{display:none}",
    "body.ds-fullscreen #ds-float-bar{display:flex}",
    "body.ds-fullscreen #ds-progress{display:none}",
    /* Fullscreen slide scaling */
    "body.ds-fullscreen .slide,body.ds-fullscreen .page{margin:0 auto;transform-origin:center center}",
    /* Print styles */
    "@media print{#ds-toolbar,#ds-progress,#ds-float-bar,#ds-grid-overlay{display:none!important}.slide,.page{break-after:page;box-shadow:none!important;margin:0!important;width:100%!important;min-height:100vh;print-color-adjust:exact;-webkit-print-color-adjust:exact}.slide:last-child,.page:last-child{break-after:auto}.chart-filters{display:none}.chart-column[hidden]{display:flex}.chart-panel,.metric-grid,.live-panel{break-inside:avoid}}"
  ].join("\n");
  document.head.appendChild(runtimeCSS);

  // ── 3. Build toolbar ──────────────────────────────────────────────────
  const toolbar = document.createElement("nav");
  toolbar.id = "ds-toolbar";
  toolbar.setAttribute("aria-label", "Presentation controls");
  document.body.prepend(toolbar);

  function btn(label, action, opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (opts && opts.title) b.title = opts.title;
    if (opts && opts.ariaLabel) b.setAttribute("aria-label", opts.ariaLabel);
    b.addEventListener("click", action);
    toolbar.appendChild(b);
    return b;
  }

  function separator() {
    const s = document.createElement("span");
    s.className = "ds-separator";
    toolbar.appendChild(s);
    return s;
  }

  // ── 4. Build progress bar ─────────────────────────────────────────────
  const progressBar = document.createElement("div");
  progressBar.id = "ds-progress";
  document.body.appendChild(progressBar);

  function updateProgress() {
    if (slides.length <= 1) { progressBar.style.width = "100%"; return; }
    const pct = ((active + 1) / slides.length) * 100;
    progressBar.style.width = pct + "%";
  }

  // ── 5. Chart filter controls (preserved) ──────────────────────────────
  for (const chart of document.querySelectorAll(".filterable-chart")) {
    const columns = [...chart.querySelectorAll(".chart-column")];
    const controls = document.createElement("div");
    controls.className = "chart-filters";
    controls.setAttribute("aria-label", "Chart period");
    for (const months of [6, 3]) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.textContent = `${months} months`;
      choice.setAttribute("aria-pressed", String(months === 6));
      choice.addEventListener("click", () => {
        columns.forEach((column, index) => { column.hidden = index < columns.length - months; });
        for (const sibling of controls.children) sibling.setAttribute("aria-pressed", String(sibling === choice));
      });
      controls.appendChild(choice);
    }
    chart.prepend(controls);
  }

  // ── 6. Simulated live data streams (preserved) ────────────────────────
  const events = document.getElementById("live-events");
  if (events) {
    const status = document.getElementById("live-status");
    const latency = document.getElementById("live-latency");
    let count = Number(events.textContent.replaceAll(",", ""));
    let tick = 0;
    let paused = false;
    const pause = btn("Pause demo stream", () => {
      paused = !paused;
      pause.textContent = paused ? "Resume demo stream" : "Pause demo stream";
      status.textContent = paused ? "Simulated stream · paused" : "Simulated live · updates every 4 seconds";
    });
    status.textContent = "Simulated live · updates every 4 seconds";
    const timer = window.setInterval(() => {
      if (paused || document.hidden) return;
      count += [21, 34, 28, 41][tick % 4];
      const ms = [108, 112, 106, 110][tick % 4];
      tick++;
      events.textContent = count.toLocaleString("en-US");
      if (latency) latency.textContent = `${ms} ms`;
      const latest = document.querySelector(".live-chart .chart-column:last-child");
      if (latest) {
        latest.querySelector("strong").textContent = `${ms}ms`;
        latest.querySelector(".chart-bar").style.height = `${ms / 132 * 100}%`;
      }
      status.textContent = `Simulated live · updated ${new Date().toLocaleTimeString()}`;
    }, 4000);
    window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
  }

  const sales = document.getElementById("live-sales");
  if (sales) {
    const orders = document.getElementById("live-orders");
    const status = document.getElementById("sales-status");
    const latest = document.getElementById("latest-sales");
    let revenue = Number(sales.textContent.replace(/[^0-9.]/g, ""));
    let orderCount = Number(orders.textContent.replaceAll(",", ""));
    let tick = 0;
    let paused = false;
    const pause = btn("Pause sales demo", () => {
      paused = !paused;
      pause.textContent = paused ? "Resume sales demo" : "Pause sales demo";
      status.textContent = paused ? "Simulated stream · paused" : "Simulated live · updates every 4 seconds";
    });
    const timer = window.setInterval(() => {
      if (paused || document.hidden) return;
      revenue += [0.1, 0.2, 0.1, 0.3][tick % 4];
      orderCount += [3, 5, 4, 7][tick % 4];
      tick++;
      const formatted = `₹${revenue.toFixed(1)}L`;
      sales.textContent = formatted;
      orders.textContent = orderCount.toLocaleString("en-US");
      latest.textContent = formatted;
      status.textContent = `Simulated live · updated ${new Date().toLocaleTimeString()}`;
    }, 4000);
    window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
  }

  // ── 7. Navigation state ───────────────────────────────────────────────
  let active = 0;
  let transitionLock = false;

  // ── 8. Speaker notes ──────────────────────────────────────────────────
  let notesVisible = false;
  let notesEl = null;
  let notesBtn = null;

  function extractNotes(slideIndex) {
    if (slideIndex < 0 || slideIndex >= slides.length) return null;
    const el = slides[slideIndex].querySelector(".speaker-notes");
    return el ? el.textContent.trim() : null;
  }

  function updateNotesDisplay() {
    if (!notesEl) return;
    const text = extractNotes(active);
    if (text && notesVisible) {
      notesEl.textContent = text;
      notesEl.style.display = "block";
    } else {
      notesEl.style.display = "none";
    }
    if (notesBtn) {
      const hasNotes = !!extractNotes(active);
      notesBtn.style.display = hasNotes ? "" : "none";
      notesBtn.dataset.active = String(notesVisible && hasNotes);
    }
  }

  // ── 9. Slide transition ───────────────────────────────────────────────
  function animateSlide(slide, direction) {
    if (!slide) return;
    // Remove any previous transition classes
    slide.classList.remove("ds-slide-enter", "ds-slide-enter-prev", "ds-slide-active");
    // Force reflow
    slide.offsetHeight; // eslint-disable-line no-unused-expressions
    // Apply enter class
    slide.classList.add(direction === "forward" ? "ds-slide-enter" : "ds-slide-enter-prev");
    // Force reflow again before adding active
    slide.offsetHeight; // eslint-disable-line no-unused-expressions
    slide.classList.add("ds-slide-active");
  }

  // ── 10. Navigation (slides) ───────────────────────────────────────────
  let prevBtn, nextBtn, statusEl, floatPrev, floatNext, floatStatus;

  function show(index, opts) {
    const dir = (opts && opts.direction) || (index >= active ? "forward" : "backward");
    const prev = active;
    active = Math.max(0, Math.min(slides.length - 1, index));

    slides.forEach((slide, i) => {
      if (i === active) {
        slide.hidden = false;
        if (i !== prev || (opts && opts.force)) {
          animateSlide(slide, dir);
        }
      } else {
        slide.hidden = true;
        slide.classList.remove("ds-slide-enter", "ds-slide-enter-prev", "ds-slide-active");
      }
    });

    if (prevBtn) prevBtn.disabled = active === 0;
    if (nextBtn) nextBtn.disabled = active === slides.length - 1;
    const label = `${active + 1} of ${slides.length}`;
    if (statusEl) statusEl.textContent = label;
    if (floatPrev) floatPrev.disabled = active === 0;
    if (floatNext) floatNext.disabled = active === slides.length - 1;
    if (floatStatus) floatStatus.textContent = label;

    updateProgress();
    updateNotesDisplay();
    updateGridHighlight();
    scaleSlidesIfFullscreen();

    // Update hash without triggering hashchange handler
    if (!(opts && opts.noHash)) {
      hashUpdating = true;
      window.location.hash = "#" + (active + 1);
      // Allow hashchange to work again after a tick
      requestAnimationFrame(() => { hashUpdating = false; });
    }
  }

  if (isPresentation) {
    prevBtn = btn("◂ Prev", () => show(active - 1), { title: "Previous slide (←)", ariaLabel: "Previous slide" });
    nextBtn = btn("Next ▸", () => show(active + 1), { title: "Next slide (→)", ariaLabel: "Next slide" });

    statusEl = document.createElement("span");
    statusEl.className = "ds-status";
    statusEl.setAttribute("aria-live", "polite");
    toolbar.appendChild(statusEl);

    separator();

    // Speaker notes button
    notesEl = document.createElement("div");
    notesEl.className = "ds-notes-preview";
    notesEl.style.display = "none";

    notesBtn = btn("Notes", () => {
      notesVisible = !notesVisible;
      updateNotesDisplay();
    }, { title: "Toggle speaker notes (N)" });
    notesBtn.style.display = "none"; // hidden until a slide has notes

    separator();

    // Grid overview button
    btn("Grid", () => toggleGrid(), { title: "Slide overview (G)" });

    // Fullscreen button
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
      btn("Fullscreen", () => toggleFullscreen(), { title: "Toggle fullscreen (F)" });
    }

    separator();

    // Append notes panel at end of toolbar as full-width row
    toolbar.appendChild(notesEl);

    // ── Print handlers ──
    window.addEventListener("beforeprint", () => slides.forEach(s => { s.hidden = false; }));
    window.addEventListener("afterprint", () => show(active, { force: true }));

    // Read initial hash
    const initialSlide = parseHash();
    show(initialSlide, { noHash: initialSlide === 0, force: true });
  }

  // Print button (only in top-level window)
  if (window.self === window.top) btn("Print / PDF", () => window.print(), { title: "Print or save as PDF" });

  // Remove toolbar if it ended up empty
  if (!toolbar.children.length) toolbar.remove();

  // ── 11. Hash-based navigation ─────────────────────────────────────────
  let hashUpdating = false;

  function parseHash() {
    const m = window.location.hash.match(/^#(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10) - 1;
      if (n >= 0 && n < slides.length) return n;
    }
    return 0;
  }

  window.addEventListener("hashchange", () => {
    if (hashUpdating || !isPresentation) return;
    const target = parseHash();
    if (target !== active) show(target, { noHash: true });
  });

  // ── 12. Grid overview ─────────────────────────────────────────────────
  const gridOverlay = document.createElement("div");
  gridOverlay.id = "ds-grid-overlay";
  document.body.appendChild(gridOverlay);

  let gridBuilt = false;

  function buildGrid() {
    if (gridBuilt) return;
    gridBuilt = true;
    slides.forEach((slide, i) => {
      const item = document.createElement("div");
      item.className = "ds-grid-item";
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", `Go to slide ${i + 1}`);

      // Clone the slide content into a scaled container
      const inner = document.createElement("div");
      inner.className = "ds-grid-item-inner";
      const clone = slide.cloneNode(true);
      clone.hidden = false;
      clone.style.cssText = "margin:0;box-shadow:none;width:1120px;min-height:580px;aspect-ratio:16/9;pointer-events:none";
      clone.classList.remove("ds-slide-enter", "ds-slide-enter-prev", "ds-slide-active");
      // Remove speaker notes from clone
      const cloneNotes = clone.querySelector(".speaker-notes");
      if (cloneNotes) cloneNotes.remove();
      inner.appendChild(clone);
      item.appendChild(inner);

      const label = document.createElement("div");
      label.className = "ds-grid-label";
      label.textContent = `Slide ${i + 1}`;
      item.appendChild(label);

      item.addEventListener("click", () => {
        show(i);
        closeGrid();
      });
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show(i);
          closeGrid();
        }
      });

      gridOverlay.appendChild(item);
    });

    // Scale grid items after they're in the DOM
    requestAnimationFrame(() => {
      const items = gridOverlay.querySelectorAll(".ds-grid-item-inner");
      items.forEach(inner => {
        const clone = inner.querySelector(".slide, .page");
        if (!clone) return;
        // Get the item container width
        const itemWidth = inner.parentElement.clientWidth;
        const scale = itemWidth / 1120;
        inner.style.width = itemWidth + "px";
        inner.style.height = (580 * scale) + "px";
        inner.style.overflow = "hidden";
        clone.style.transform = `scale(${scale})`;
        clone.style.transformOrigin = "top left";
      });
    });
  }

  function updateGridHighlight() {
    const items = gridOverlay.querySelectorAll(".ds-grid-item");
    items.forEach((item, i) => {
      if (i === active) item.setAttribute("data-current", "");
      else item.removeAttribute("data-current");
    });
  }

  function toggleGrid() {
    if (gridOverlay.classList.contains("ds-open")) {
      closeGrid();
    } else {
      openGrid();
    }
  }

  function openGrid() {
    buildGrid();
    updateGridHighlight();
    // Re-scale on open (viewport may have changed)
    requestAnimationFrame(() => {
      const items = gridOverlay.querySelectorAll(".ds-grid-item");
      items.forEach(item => {
        const inner = item.querySelector(".ds-grid-item-inner");
        const clone = inner.querySelector(".slide, .page");
        if (!clone) return;
        const itemWidth = item.clientWidth;
        const scale = itemWidth / 1120;
        inner.style.width = itemWidth + "px";
        inner.style.height = (580 * scale) + "px";
        clone.style.transform = `scale(${scale})`;
      });
    });
    gridOverlay.classList.add("ds-open");
  }

  function closeGrid() {
    gridOverlay.classList.remove("ds-open");
  }

  // ── 13. Fullscreen ────────────────────────────────────────────────────
  const floatBar = document.createElement("div");
  floatBar.id = "ds-float-bar";
  document.body.appendChild(floatBar);

  if (isPresentation) {
    floatPrev = document.createElement("button");
    floatPrev.textContent = "◂";
    floatPrev.title = "Previous";
    floatPrev.addEventListener("click", () => show(active - 1));
    floatBar.appendChild(floatPrev);

    floatStatus = document.createElement("span");
    floatStatus.className = "ds-float-status";
    floatBar.appendChild(floatStatus);

    floatNext = document.createElement("button");
    floatNext.textContent = "▸";
    floatNext.title = "Next";
    floatNext.addEventListener("click", () => show(active + 1));
    floatBar.appendChild(floatNext);

    const floatExit = document.createElement("button");
    floatExit.textContent = "✕ Exit";
    floatExit.title = "Exit fullscreen";
    floatExit.addEventListener("click", () => exitFullscreen());
    floatBar.appendChild(floatExit);
  }

  let floatHideTimer = null;

  function showFloatBar() {
    floatBar.style.opacity = "1";
    clearTimeout(floatHideTimer);
    floatHideTimer = setTimeout(() => {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        floatBar.style.opacity = "0";
      }
    }, 2000);
  }

  document.addEventListener("mousemove", () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      showFloatBar();
    }
  });

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  function onFullscreenChange() {
    if (isFullscreen()) {
      document.body.classList.add("ds-fullscreen");
      showFloatBar();
      scaleSlidesIfFullscreen();
    } else {
      document.body.classList.remove("ds-fullscreen");
      floatBar.style.opacity = "1";
      clearTimeout(floatHideTimer);
      // Reset any fullscreen scaling
      slides.forEach(s => { s.style.transform = ""; s.style.margin = ""; });
    }
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  // ── 14. Auto-fit slides in fullscreen ─────────────────────────────────
  function scaleSlidesIfFullscreen() {
    if (!isFullscreen()) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    slides.forEach((slide, i) => {
      if (slide.hidden) return;
      // Natural dimensions: 1120 x 580 (16:9 aspect ratio as defined in templates)
      const sw = slide.scrollWidth || 1120;
      const sh = slide.scrollHeight || 580;
      const scale = Math.min(vw / sw, vh / sh, 1.5);
      slide.style.transform = `scale(${scale})`;
      slide.style.transformOrigin = "center center";
      // Center vertically
      const scaledH = sh * scale;
      const topOffset = Math.max(0, (vh - scaledH) / 2);
      slide.style.margin = topOffset + "px auto 0";
    });
  }

  window.addEventListener("resize", () => {
    if (isFullscreen()) scaleSlidesIfFullscreen();
  });

  // ── 15. Touch / swipe navigation ──────────────────────────────────────
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!isPresentation) return;
    if (gridOverlay.classList.contains("ds-open")) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    // Only register horizontal swipes (dx > dy to avoid scroll conflicts)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) show(active + 1);
      else show(active - 1);
    }
  }, { passive: true });

  // ── 16. Keyboard shortcuts ────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    // Don't capture when user is typing in form elements
    const tag = e.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.target.isContentEditable) return;

    // Grid open: only respond to Escape and Enter
    if (gridOverlay.classList.contains("ds-open")) {
      if (e.key === "Escape") { e.preventDefault(); closeGrid(); }
      return;
    }

    if (!isPresentation) return;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
      case " ":
      case "PageDown":
        e.preventDefault();
        show(active + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        show(active - 1);
        break;
      case "Home":
        e.preventDefault();
        show(0);
        break;
      case "End":
        e.preventDefault();
        show(slides.length - 1);
        break;
      case "g":
      case "G":
        e.preventDefault();
        toggleGrid();
        break;
      case "f":
      case "F":
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleFullscreen();
        }
        break;
      case "n":
      case "N":
        e.preventDefault();
        notesVisible = !notesVisible;
        updateNotesDisplay();
        break;
      case "Escape":
        if (isFullscreen()) exitFullscreen();
        break;
    }
  });

  // ── 17. Click on grid overlay background to close ─────────────────────
  gridOverlay.addEventListener("click", (e) => {
    if (e.target === gridOverlay) closeGrid();
  });
})();
