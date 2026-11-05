(() => {
  const slide = document.getElementById('pitch-traction');
  if (!slide) return;
  const count = slide.querySelector('#traction-count');
  let frame;
  const play = () => {
    cancelAnimationFrame(frame);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { count.textContent = '1,280'; return; }
    const start = performance.now();
    const tick = time => {
      const progress = Math.min(1, (time - start) / 1100);
      count.textContent = Math.round(1280 * (1 - (1 - progress) ** 3)).toLocaleString('en-US');
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };
  slide.addEventListener('docsync:slide-enter', play);
  if (!slide.hidden) play();
  window.addEventListener('beforeprint', () => { cancelAnimationFrame(frame); count.textContent = '1,280'; });
})();
