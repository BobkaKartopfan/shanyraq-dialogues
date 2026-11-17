document.addEventListener("click", (event) => {
  const carousel = event.target.closest("[data-carousel]");
  if (!carousel) return;

  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  if (!slides.length) return;

  const activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("active")));
  let nextIndex = activeIndex;

  if (event.target.closest(".prev")) nextIndex = (activeIndex - 1 + slides.length) % slides.length;
  if (event.target.closest(".next")) nextIndex = (activeIndex + 1) % slides.length;

  const dot = event.target.closest(".carousel-dot");
  if (dot) nextIndex = Array.from(carousel.querySelectorAll(".carousel-dot")).indexOf(dot);
  if (nextIndex === activeIndex || nextIndex < 0) return;

  slides.forEach((slide, index) => slide.classList.toggle("active", index === nextIndex));
  carousel.querySelectorAll(".carousel-dot").forEach((entry, index) => entry.classList.toggle("active", index === nextIndex));
});
