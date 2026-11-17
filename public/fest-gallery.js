const gallery = document.querySelector('.fest-gallery');
const lightbox = document.querySelector('.fest-lightbox');

if (gallery && lightbox && typeof lightbox.showModal === 'function') {
  const photos = Array.from(gallery.querySelectorAll('.fest-photo'));
  const filters = gallery.querySelector('.fest-filters');
  const count = gallery.querySelector('.fest-gallery-count');
  const fullImage = lightbox.querySelector('img');
  const caption = lightbox.querySelector('figcaption');
  const position = lightbox.querySelector('[data-photo-position]');
  let activeIndex = 0;

  const visiblePhotos = () => photos.filter((photo) => !photo.hidden);
  const showPhoto = (index) => {
    const visible = visiblePhotos();
    activeIndex = (index + visible.length) % visible.length;
    const photo = visible[activeIndex];
    const thumbnail = photo.querySelector('img');
    fullImage.src = photo.querySelector('a').href;
    fullImage.alt = thumbnail.alt;
    caption.textContent = photo.querySelector('figcaption').textContent;
    position.textContent = `${activeIndex + 1} / ${visible.length}`;
  };

  filters.hidden = false;
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    filters.querySelectorAll('button').forEach((filter) => {
      filter.setAttribute('aria-pressed', String(filter === button));
    });
    photos.forEach((photo) => {
      photo.hidden = button.dataset.filter !== 'all' && photo.dataset.category !== button.dataset.filter;
    });
    const total = visiblePhotos().length;
    count.textContent = `${total} ${total === 1 ? 'photograph' : 'photographs'}`;
  });

  gallery.addEventListener('click', (event) => {
    const link = event.target.closest('.fest-photo > a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showPhoto(visiblePhotos().indexOf(link.closest('.fest-photo')));
    lightbox.showModal();
  });

  lightbox.querySelector('[data-close]').addEventListener('click', () => lightbox.close());
  lightbox.querySelector('[data-previous]').addEventListener('click', () => showPhoto(activeIndex - 1));
  lightbox.querySelector('[data-next]').addEventListener('click', () => showPhoto(activeIndex + 1));
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      lightbox.close();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPhoto(activeIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  lightbox.addEventListener('click', (event) => {
    if (event.target !== lightbox) return;
    const bounds = lightbox.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) lightbox.close();
  });
}
