(() => {
  const slide = document.getElementById('pitch-solution');
  if (!slide) return;
  const cards = [...slide.querySelectorAll('.workflow-card')];
  const labels = ['Collect', 'Explain', 'Align'];
  let active = 0;
  slide.querySelector('#workflow-next').addEventListener('click', () => {
    active = (active + 1) % cards.length;
    cards.forEach((card, index) => card.classList.toggle('active', index === active));
    slide.querySelector('#workflow-status').textContent = `Step ${active + 1} of 3 · ${labels[active]}`;
  });
})();
