/* DocSync motion runtime: opt-in step builds for any slide or document page.
   Add class "motion" to a slide (<article class="slide motion">) or page (<article class="page motion">).
   Builds: an element with class sN (N = 1-30) gets .in when its root reaches step N; build elements without sN appear on entry.
   Slides start on entry (DocSync player, preview.js); pages start when scrolled into view.
   Icons: <span class="ic i-NAME"></span>. Wires: <span class="wire c-amber draw s2 pk-doc" style='--path:"M0 0 H 100"'></span>.
   Networks: <span class="nnet" style='--layers:"3,4,2"'></span>. Count-up: <b class="count s3">44.6 ms</b>.
   Events on the root: motion:enter, motion:step {step, max}. ?static or reduced motion shows the final state at once. */
(() => {
  if (window.DocSyncMotion) return;
  const NS = 'http://www.w3.org/2000/svg';
  const query = new URLSearchParams(location.search);
  const still = query.has('static') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('mo-js');
  /*@icons*/
  const ICONS = {
    alert: '<path d="M12 3.2L2.5 20h19z"/><path d="M12 9.5v5M12 17.5h.01"/>',
    antenna: '<circle cx="12" cy="9" r="1.8"/><path d="M12 11v10.5M8.5 21.5h7M8.2 5.2a5.4 5.4 0 0 0 0 7.6M15.8 5.2a5.4 5.4 0 0 1 0 7.6M5.4 2.6a9.2 9.2 0 0 0 0 12.8M18.6 2.6a9.2 9.2 0 0 1 0 12.8"/>',
    arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3M6 10v4M9.5 10v4"/>',
    bolt: '<path d="M13.5 2.5L4.5 14h7l-1 7.5 9-11.5h-7z"/>',
    book: '<path d="M3 4.5h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3zM21 4.5h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    chart: '<path d="M3 21h18M6 21v-7M11 21V5M16 21v-10M20.5 21v-4"/>',
    check: '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.3l3 3 6-6.6"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1.6"/><rect x="9.5" y="9.5" width="5" height="5" rx=".6"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2.5"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7 18.5z"/>',
    code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>',
    cog: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8"/>',
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M11 18.5h2"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    file: '<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h6M9 15.5h6M9 19h4"/>',
    flask: '<path d="M9 2.5h6M10 2.5v6L4.5 19a1.8 1.8 0 0 0 1.6 2.5h11.8a1.8 1.8 0 0 0 1.6-2.5L14 8.5v-6M7.2 14.5h9.6"/>',
    gauge: '<path d="M3.5 17.5a8.5 8.5 0 1 1 17 0M12 17.5l4.2-5.8M3.5 17.5h17"/>',
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.8 5.8 3.8 9.5s-1.2 6.9-3.8 9.5c-2.6-2.6-3.8-5.8-3.8-9.5S9.4 5.1 12 2.5z"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 16l-5.5-5.5L5 20"/>',
    layers: '<path d="M12 3l9.5 5-9.5 5-9.5-5z"/><path d="M2.5 13l9.5 5 9.5-5"/>',
    led: '<path d="M7.5 14.5V9a4.5 4.5 0 0 1 9 0v5.5zM6 14.5h12M10 14.5v6M14 14.5v4M3.5 6.5l-1.5-1M20.5 6.5l1.5-1"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="11" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 15v2.5"/>',
    loop: '<path d="M20 11a8 8 0 0 0-14.3-4.9L3.5 8.5M3.5 3.5v5h5M4 13a8 8 0 0 0 14.3 4.9l2.2-2.4M20.5 20.5v-5h-5"/>',
    memory: '<rect x="2.5" y="6.5" width="19" height="10" rx="1.2"/><path d="M6.5 10v3M10.5 10v3M14.5 10v3M18 10v3M5 16.5v3M9 16.5v3M15 16.5v3M19 16.5v3"/>',
    model: '<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5"/><circle cx="9.6" cy="14" r="1.2"/><circle cx="14.6" cy="11.4" r="1.2"/><circle cx="14.6" cy="16.6" r="1.2"/><path d="M10.7 13.4l2.8-1.4M10.7 14.6l2.8 1.4"/>',
    net: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M6.7 7l3.6 4M6.7 17l3.6-4M13.7 11l3.6-4M13.7 13l3.6 4"/>',
    no: '<circle cx="12" cy="12" r="9.5"/><path d="M5.5 5.5l13 13"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3L21 21"/>',
    sensor: '<circle cx="12" cy="12" r="2.4"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="1.6"/><rect x="3" y="14" width="18" height="7" rx="1.6"/><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    target: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0M15.5 5.4a3.3 3.3 0 0 1 0 6.3M17.5 14.4a6.5 6.5 0 0 1 4 6.1"/>',
    wave: '<path d="M2 12h3l2.5-6 4 13 3-9 2 4H22"/>',
    x: '<circle cx="12" cy="12" r="9.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  };
  /*@end-icons*/
  const BUILD = ['f', 'dim', 'fo', 'glow', 'lit', 'grow', 'count'];
  // Optional features sit between @feature and @end-feature markers; to-document.mjs drops a block when no element in the slide has its class.
  const FEATURES = {};

  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  };
  const prop = (node, name) => (node.style.getPropertyValue(name) || getComputedStyle(node).getPropertyValue(name)).trim().replace(/^(['"])(.*)\1$/, '$2');
  const stepOf = node => {
    for (const name of node.classList) { const match = /^s(\d{1,2})$/.exec(name); if (match) return +match[1]; }
    return 0;
  };
  const emit = (slide, type, detail) => slide.dispatchEvent(new CustomEvent(type, { detail }));

  function icons(slide) {
    for (const node of slide.querySelectorAll('.ic')) {
      if (node.querySelector('svg')) continue;
      const name = [...node.classList].find(c => c.startsWith('i-'));
      const body = name && ICONS[name.slice(2)];
      if (body) node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
    }
  }

  /*@feature nnet*/
  FEATURES.nets = slide => {
    for (const node of slide.querySelectorAll('.nnet')) {
      const layers = prop(node, '--layers').split(/[\s,]+/).map(Number).filter(n => n > 0);
      if (!layers.length) continue;
      const w = node.offsetWidth || 400, h = node.offsetHeight || 200;
      const r = Math.max(5, Math.min(12, h / (Math.max(...layers) + 1) / 2.6));
      const span = w - 2 * r - 4;
      const pos = layers.map((count, i) => {
        const x = r + 2 + (layers.length === 1 ? span / 2 : i * span / (layers.length - 1));
        return Array.from({ length: count }, (_, j) => [x, (j + 1) * h / (count + 1)]);
      });
      const out = svg('svg', { viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
      let seed = 7 + node.className.length;
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const weighted = node.classList.contains('weights');
      if (!node.classList.contains('nodes-only')) {
        for (let i = 0; i < pos.length - 1; i++) for (const a of pos[i]) for (const b of pos[i + 1]) {
          const k = rnd();
          out.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': weighted ? (1 + k * 4).toFixed(1) : 1.6, 'stroke-opacity': weighted ? (.35 + k * .65).toFixed(2) : .35 }));
        }
      }
      if (!node.classList.contains('edges-only')) for (const layer of pos) for (const [x, y] of layer) out.append(svg('circle', { cx: x, cy: y, r }));
      node.replaceChildren(out);
    }
  };
  /*@end-feature*/

  /*@feature wire*/
  const PACKETS = {
    doc: '<rect class="pb" x="-16" y="-16" width="32" height="32" rx="8"/><path d="M-6-9h6.5l4 4V9h-10.5z M.5-9v4h4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>',
    msg: '<circle class="pb" r="14"/><path d="M-7-4.5h14M-7 0h9.5M-7 4.5h11.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
    dot: '<circle class="pb" r="10" stroke="#fff" stroke-width="3"/>',
  };
  FEATURES.wires = slide => {
    const list = [...slide.querySelectorAll('.wire')];
    const packets = [];
    if (!list.length) return packets;
    const overlay = svg('svg', { class: 'mo-ov', viewBox: `0 0 ${slide.offsetWidth || 1280} ${slide.offsetHeight || 720}`, 'aria-hidden': 'true' });
    list[0].before(overlay); // Declared position controls stacking: later HTML paints above the wires.
    for (const wire of list) {
      const d = prop(wire, '--path');
      if (!d) continue;
      const classes = [...wire.classList].filter(c => c !== 'wire');
      const draw = classes.includes('draw') && !classes.includes('dashed');
      const fixed = classes.includes('still') || classes.includes('track');
      const path = svg('path', { d, class: classes.concat(fixed ? [] : [draw ? 'dr' : 'f']).join(' ') });
      const delay = parseFloat(wire.style.transitionDelay) || 0;
      if (delay) path.style.transitionDelay = delay + 's';
      overlay.append(path);
      const length = path.getTotalLength();
      path.style.setProperty('--L', length.toFixed(1));
      if (!classes.includes('no-head') && !classes.includes('track') && length > 8) {
        const a = path.getPointAtLength(length - 7), b = path.getPointAtLength(length);
        const angle = Math.atan2(b.y - a.y, b.x - a.x), size = classes.includes('thin') ? 9 : 12, half = size * .58;
        const tip = [b.x + Math.cos(angle) * 3, b.y + Math.sin(angle) * 3];
        const corner = sign => [tip[0] - size * Math.cos(angle) + sign * half * Math.sin(angle), tip[1] - size * Math.sin(angle) - sign * half * Math.cos(angle)];
        const head = svg('polygon', { points: [tip, corner(1), corner(-1)].map(p => p.map(v => v.toFixed(1)).join(',')).join(' ') });
        head.setAttribute('class', classes.filter(c => /^(c-|s\d)/.test(c)).concat(fixed ? [] : ['f']).join(' '));
        if (draw || delay) head.style.transitionDelay = (delay + (draw ? .55 : 0)) + 's';
        overlay.append(head);
      }
      const kind = classes.find(c => /^pk-(doc|msg|dot)$/.test(c));
      if (kind) {
        const group = svg('g', { class: 'mo-pkt ' + classes.filter(c => c.startsWith('c-')).join(' ') });
        group.innerHTML = PACKETS[kind.slice(3)];
        overlay.append(group);
        packets.push({ path, group, step: stepOf(wire), delay: parseFloat(prop(wire, '--pk-delay')) || .2, dur: parseFloat(prop(wire, '--pk-dur')) || 1.2, scale: parseFloat(prop(wire, '--pk-scale')) || 1, run: 0 });
      }
    }
    return packets;
  };
  FEATURES.travel = packet => {
    if (still) return;
    const run = ++packet.run, length = packet.path.getTotalLength(), duration = packet.dur * 1000, start = performance.now() + packet.delay * 1000;
    packet.group.style.opacity = 0;
    const frame = now => {
      if (packet.run !== run) return;
      let t = (now - start) / duration;
      if (t < 0) { requestAnimationFrame(frame); return; }
      if (t > 1) t = 1;
      const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const point = packet.path.getPointAtLength(eased * length);
      packet.group.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${packet.scale})`);
      packet.group.style.opacity = t < .08 ? t / .08 : t > .9 ? (1 - t) / .1 : 1;
      if (t < 1) requestAnimationFrame(frame); else packet.group.style.opacity = 0;
    };
    requestAnimationFrame(frame);
  };
  /*@end-feature*/

  /*@feature count*/
  const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;
  FEATURES.counter = node => {
    const text = node.textContent, match = NUMBER.exec(text);
    if (!match) return null;
    const raw = match[0], decimals = (raw.split('.')[1] || '').length, value = parseFloat(raw.replace(/,/g, ''));
    const format = v => text.slice(0, match.index) + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: raw.includes(',') }) + text.slice(match.index + raw.length);
    return { node, text, value, format, step: stepOf(node), run: 0 };
  };
  FEATURES.countUp = item => {
    const run = ++item.run, start = performance.now();
    const frame = now => {
      if (item.run !== run) return;
      const t = Math.min(1, (now - start) / 900);
      item.node.textContent = t < 1 ? item.format(item.value * (1 - Math.pow(1 - t, 3))) : item.text;
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  /*@end-feature*/

  function setup(slide) {
    if (slide._rd) return slide._rd;
    icons(slide);
    FEATURES.nets?.(slide);
    const packets = FEATURES.wires ? FEATURES.wires(slide) : [];
    const items = [];
    let max = 0;
    for (const node of slide.querySelectorAll('*')) {
      if (node.parentElement?.closest('.ic,.nnet')) continue;
      const step = stepOf(node);
      if (step || BUILD.some(c => node.classList.contains(c)) || node.classList.contains('dr')) { items.push([node, step]); max = Math.max(max, step); }
    }
    const counts = FEATURES.counter ? [...slide.querySelectorAll('.count')].map(FEATURES.counter).filter(Boolean) : [];
    return (slide._rd = { items, max, packets, counts, timers: [], step: -1 });
  }

  function show(slide, step, animate) {
    const state = setup(slide), previous = state.step;
    state.step = step;
    for (const [node, n] of state.items) node.classList.toggle('in', n <= step);
    for (const item of state.counts) {
      if (item.step > step) { item.run++; item.node.textContent = item.format(0); }
      else if (animate && item.step > previous) FEATURES.countUp(item);
      else if (!animate) { item.run++; item.node.textContent = item.text; }
    }
    if (animate) for (const packet of state.packets) if (packet.step > previous && packet.step <= step) FEATURES.travel(packet);
    emit(slide, 'motion:step', { step, max: state.max });
  }

  function leave(slide) {
    const state = slide._rd;
    if (!state) return;
    state.timers.forEach(clearTimeout);
    state.timers = [];
    for (const packet of state.packets) { packet.run++; packet.group.style.opacity = 0; }
    slide.classList.remove('mo-on');
  }

  function enter(slide) {
    const state = setup(slide);
    leave(slide);
    state.step = -1;
    for (const [node] of state.items) node.classList.remove('in');
    void slide.offsetWidth; // Commit the hidden state so the first build transitions instead of popping in.
    slide.classList.add('mo-on');
    emit(slide, 'motion:enter', { max: state.max });
    if (still) { show(slide, state.max, false); return; }
    show(slide, 0, true);
    const gap = parseFloat(prop(slide, '--gap')) || (slide.classList.contains('pace-slow') ? 950 : slide.classList.contains('pace-fast') ? 450 : 650);
    for (let k = 1; k <= state.max; k++) state.timers.push(setTimeout(() => show(slide, k, true), k * gap));
  }

  function finish(slide) {
    const state = setup(slide);
    state.timers.forEach(clearTimeout);
    state.timers = [];
    show(slide, state.max, false);
  }

  const api = window.DocSyncMotion = { enter, leave, finish, setup, still, icons: Object.keys(ICONS) };
  const visible = root => !root.closest('[hidden]') && root.getClientRects().length > 0;
  const boot = () => {
    const roots = [...document.querySelectorAll('.motion')];
    const slides = roots.filter(root => root.classList.contains('slide'));
    // DocSync's player and preview.js announce slide changes; hosted slides are alone in their frame.
    for (const slide of slides) slide.addEventListener('docsync:slide-enter', () => enter(slide));
    const first = slides.find(visible);
    if (first) enter(first);
    // Document pages and other sections play once, when they scroll into view.
    const pages = roots.filter(root => !root.classList.contains('slide'));
    if (!pages.length) return;
    if (still || !('IntersectionObserver' in window)) { pages.forEach(enter); return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); enter(entry.target); }
    }, { threshold: .3 });
    pages.forEach(page => observer.observe(page));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else setTimeout(boot, 0);
  addEventListener('beforeprint', () => document.querySelectorAll('.motion').forEach(finish));
})();
