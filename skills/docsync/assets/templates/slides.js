// Each hosted slide receives its own copy. No parent access or shared mutable state.
(() => {
  for (const slide of document.querySelectorAll('.slide')) {
    const play = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      for (const animation of slide.getAnimations({ subtree: true })) animation.cancel();
      slide.querySelectorAll('.reveal').forEach((element, index) => {
        element.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], {
          duration: 620, delay: Math.min(index, 6) * 85, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards',
        });
      });
      slide.querySelectorAll('.chart-bar').forEach((bar, index) => {
        bar.style.transformOrigin = 'bottom';
        bar.animate([{ transform: 'scaleY(.02)' }, { transform: 'scaleY(1)' }], { duration: 850, delay: 180 + index * 80, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      });
    };
    slide.addEventListener('docsync:slide-enter', play);
    if (!slide.hidden) requestAnimationFrame(play);
    window.addEventListener('beforeprint', () => slide.getAnimations({ subtree: true }).forEach(animation => animation.finish()));
  }
})();
