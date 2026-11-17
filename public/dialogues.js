// Content stays visible when JavaScript or motion effects are unavailable.
const story = document.querySelector('.dialogues-story');
if (story && 'IntersectionObserver' in window &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.08 });

  story.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
}
