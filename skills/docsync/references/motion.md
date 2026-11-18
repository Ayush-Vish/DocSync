# Motion: builds, wires and packets for any slide or page

`assets/templates/motion.js` and `motion.css` add step-by-step builds to any DocSync presentation slide or document page. You add classes and CSS custom properties; you do not write animation code. Everything survives DocSync's sanitizer (no `<svg>`, `<style>` or `data-*` needed) and the final state is always readable without JavaScript, so thumbnails, print and PDF work.

`research-talk/` is the worked example: a 24-slide deck that uses every feature below. Read [research-talk.md](research-talk.md) for how it turns a source document into an animated talk.

## Opt in

1. Add `motion` to the section root: `<article class="slide motion">` or `<article class="page motion">`. Sections without it are untouched.
2. In the template's `index.html` (standalone preview), link `../motion.css` after `styles.css` and load `<script src="../motion.js" defer></script>` after `preview.js`/`slides.js`.
3. You never paste the runtime yourself: when a section with class `motion` is saved, the DocSync server adds `motion.js`/`motion.css` to it and refreshes that copy on every later save. Agents connected only through MCP therefore need nothing installed. Locally, `to-document.mjs` does the same and appends the runtime to that section only, pruned to the CSS rules, icons and features the section uses. Start a stylesheet with `/* docsync:prune */` to have it tree-shaken the same way. Budget: roughly 15 kB per animated slide, so about 30 slides fit DocSync's 500 kB document limit.
4. Theme the effects by overriding `--m-hl` / `--m-hl-soft` (highlight), `--m-on` / `--m-on-soft` / `--m-on-ink` (lit state, bars) and `--m-wire` on the root or in `styles.css`. Wire, packet, bar and network colours come from `--c`, which `styles.css` can set through classes such as `.c-amber{--c:#E1970F}`.

## How builds run

- When a slide opens (DocSync player, preview.js) or a page scrolls into view, every build element without a step class appears first (step 0), then steps `s1`, `s2`, … fire automatically, 650 ms apart. Override per slide with `class="slide pace-slow"` (950 ms), `pace-fast` (450 ms) or `style="--gap:800"`.
- An element with `sN` receives `.in` once the slide reaches step N. Effects are CSS transitions between "not in" and "in".
- Stagger elements inside one step with inline `transition-delay:.15s`, `.3s`, … (wires copy their delay to the arrowhead).
- DocSync's replay (`R`) restarts the builds. Reduced-motion users, `?static` in the URL and print get the final state instantly.
- Without JavaScript (DocSync thumbnails, script blockers) everything is shown in its final state, because hidden states only apply under `html.mo-js`.
- On document pages keep it subtle: one or two steps per page (a chart growing, a callout fading in). Readers scroll; they do not wait.

## Effects

| Class | Effect | Typical use |
| --- | --- | --- |
| `f` | fade in | nodes, labels, callouts |
| `f up` / `f drop` / `f zoom` | fade with rise / drop / scale | cards, list items, banners |
| `f wr` / `f wd` / `f wu` | wipe right / down / up (clip) | lanes, process rows, bars of text, the spectrum arrow |
| `dim` | starts at 28 % opacity, full on its step | explanation boxes and table rows that follow the narration |
| `fo` | visible, fades out on its step | the old version in a before/after overlay |
| `glow` | amber focus ring on its step | the changed stage, the key table row |
| `lit` | turns teal (background, border, text) | lifecycle states lighting up in order |
| `grow` on `.hbars` / `.hbar` | bars grow from zero | results charts |
| `count` | the first number in the text counts up from 0 | headline metrics, table values |
| `auto` + `style="--d:.4s"` | entrance on slide open, no step | the title slide |
| `cyc` + `style="--cd:1.2s"` | soft repeating highlight | "the active one of several" (use once per deck at most) |

## Wires, arrowheads and packets

```html
<span class="wire c-amber draw s2 pk-doc" style='--path:"M330 245 H 424";--pk-delay:.3;--pk-dur:1.1'></span>
```

- `--path` (a quoted string; write the attribute in single quotes) is an SVG path in the root's own coordinates (0–1280 × 0–720 on a slide). Use `H`/`V` for straight runs and `C` for curves: `M986 182 C 860 182, 794 200, 794 262`.
- Colour: any class that sets `--c` (the research example defines `c-teal`, `c-blue`, `c-amber`, `c-red`, `c-ink`, `c-grey`, `c-line`).
- Appearance: `draw` (the line draws itself, then the head appears), default is a fade; `dashed`, `thin`, `thick`, `no-head`, `still` (always visible, no animation), `track` (invisible path used only by a packet).
- Packets: `pk-doc` (file/model), `pk-msg` (data/feedback), `pk-dot` (a token moving round a loop). Tune with `--pk-delay` (s), `--pk-dur` (s), `--pk-scale`. A packet runs once when its step fires.
- Stacking: the overlay is inserted where the first `.wire` of the slide sits, so put wires after the boxes they should paint over, or before the boxes they should run under.
- Leave a 6px gap between a wire's end and the box it points at; the arrowhead extends 3px past the end.
- Two-way flows: one wire each way, offset vertically (for example y=245 out, y=345 back), plus one `track` wire per direction for the packets.
- A loop: `--path:"M800 205 A 200 200 0 1 1 799.9 205"` (circle with centre 800,405 and radius 200), drawn as `c-line thick no-head`, plus a `track pk-dot` on the same path.

## Icons, networks and charts

- Icons: `<span class="ic i-NAME"></span>`, sizes `sm`, default, `lg`, coloured by `color`. Names: alert, antenna, arrow, battery, bolt, book, bulb, chart, check, chip, clock, cloud, code, cog, database, device, eye, file, flask, gauge, globe, grid, image, layers, led, lock, loop, memory, model, net, no, search, sensor, server, shield, sliders, target, trend, user, users, wave, x.
- `<span class="nnet c-teal f s1" style='left:80px;top:96px;width:400px;height:200px;--layers:"3,4,2"'></span>` draws a layered network. Add `weights` for varied edge thickness, `edges-only` or `nodes-only` to overlay a weight change on a fixed structure.
- Horizontal bars: a `.hbars grow sN` container with `--max`, rows `.hbar c-teal` with `--v`, and an `.axis` row whose tick labels use `--t`. Values must come from the paper; the bar width is `--v / --max`.
- Line charts that are illustrations: a `.plot` box for axes, zones (`.zone`), threshold (`.hl`) and event markers (`.vl`), with each series drawn as a `wire draw no-head` in slide coordinates. Always caption them "Illustration of expected behaviour, not measured data".

## Choreography rules

1. Reveal in the order you speak. The notes should mention each step in sequence.
2. Structure first, then flow, then emphasis: boxes appear, arrows draw between them, the packet travels, and the highlight (`glow`, `dim` → in) comes last.
3. Two to six steps per content slide. Dividers reveal their list items one per step; the title slide uses `auto` only.
4. One moving packet per step. Several simultaneous packets read as noise.
5. Use `dim` instead of hiding when the audience needs the whole structure first (table rows, explanation boxes, a list you will walk through).
6. Never hide essential content in the final state. The last step must leave the complete slide on screen.
7. Endless motion only for `cyc`, and only for "which one is active". Everything else plays once.

## Custom slide scripts

For something the vocabulary cannot express, add `slides/ID.js` (appended to that section only) and listen to the root's events:

```js
(() => {
  const slide = document.getElementById('my-slide');
  if (!slide) return;
  slide.addEventListener('motion:enter', () => { /* reset your state */ });
  slide.addEventListener('motion:step', event => { if (event.detail.step === 3) { /* start something */ } });
})();
```

Stay inside the slide's DOM. Respect `matchMedia('(prefers-reduced-motion: reduce)')`. No fetch, storage, eval or parent access (DocSync blocks them). Keep the meaningful final content in the HTML so thumbnails and print still show it.

## Check, preview and export

- `node scripts/check-template.mjs DIR --shots OUT` lints for markup DocSync would strip, motion step gaps and leftover sample text, audits layout in headless Chrome (outside canvas, overlapping text, overflowing boxes) and screenshots every slide's final state. Look at the screenshots before saving.
- Open `DIR/index.html` in a browser to watch the builds; add `?static` to see final states.
- `node scripts/to-standalone.mjs DIR OUT.html` inlines CSS, JavaScript and images into one file for offline presenting.
