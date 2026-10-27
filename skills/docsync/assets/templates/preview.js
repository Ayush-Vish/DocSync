// Self-contained controls for standalone previews and isolated DocSync artifacts.
(() => {
  const slides = [...document.querySelectorAll(".slide")];
  const toolbar = document.createElement("nav");
  toolbar.setAttribute("aria-label", "Preview controls");
  toolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;font:14px system-ui;background:#fff;color:#172033;border-bottom:1px solid #ddd";
  document.body.prepend(toolbar);
  function button(label, action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "padding:8px 14px;border:1px solid #bbb;background:white;color:#172033;border-radius:6px;cursor:pointer;font:inherit";
    b.addEventListener("click", action);
    toolbar.append(b);
    return b;
  }
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
      controls.append(choice);
    }
    chart.prepend(controls);
  }
  const events = document.getElementById("live-events");
  if (events) {
    const status = document.getElementById("live-status");
    const latency = document.getElementById("live-latency");
    let count = Number(events.textContent.replaceAll(",", ""));
    let tick = 0;
    let paused = false;
    const pause = button("Pause demo stream", () => {
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
    const pause = button("Pause sales demo", () => {
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
  let active = 0;
  if (slides.length > 1) {
    const previous = button("Previous", () => show(active - 1));
    const next = button("Next", () => show(active + 1));
    const status = document.createElement("span");
    status.setAttribute("aria-live", "polite");
    toolbar.append(status);
    function show(index) {
      active = Math.max(0, Math.min(slides.length - 1, index));
      slides.forEach((slide, i) => { slide.hidden = i !== active; });
      previous.disabled = active === 0;
      next.disabled = active === slides.length - 1;
      status.textContent = `Slide ${active + 1} of ${slides.length}`;
    }
    document.addEventListener("keydown", e => {
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        show(active + (e.key === "ArrowRight" ? 1 : -1));
      }
    });
    window.addEventListener("beforeprint", () => slides.forEach(s => { s.hidden = false; }));
    window.addEventListener("afterprint", () => show(active));
    show(0);
  }
  if (window.self === window.top) button("Print / Save PDF", () => window.print());
  if (!toolbar.children.length) toolbar.remove();
  const printStyle = document.createElement("style");
  printStyle.textContent = "@media print{nav[aria-label='Preview controls']{display:none!important}.slide{break-after:page;box-shadow:none!important}.slide:last-child{break-after:auto}}";
  document.head.append(printStyle);
})();
