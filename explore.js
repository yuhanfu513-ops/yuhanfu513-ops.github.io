(() => {
  const storageKey = 'bill-room-explored-v1';
  const objects = ['cello', 'boots', 'laptop'];
  let explored = new Set();
  let navigating = false;
  let openingFrame = 0;
  let closeTimer = 0;

  function loadFullImage(image) {
    if (!image || image.src) return;
    image.src = image.dataset.fullSrc;
    image.decode().then(() => image.classList.add('is-ready')).catch(() => {
      // The preview stays visible if the larger image cannot load.
    });
  }

  function restoreProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(saved)) explored = new Set(saved.filter(item => objects.includes(item)));
    } catch {
      // The interaction still works when browser storage is unavailable.
    }
    renderProgress();
  }

  function renderProgress() {
    document.querySelectorAll('[data-region-preview]').forEach(preview => {
      const lit = explored.has(preview.dataset.regionPreview);
      preview.classList.toggle('is-lit', lit);
      if (lit && !preview.src) {
        preview.src = preview.dataset.previewSrc;
        const full = document.querySelector(`[data-region="${preview.dataset.regionPreview}"]`);
        preview.decode().then(() => loadFullImage(full)).catch(() => {});
      }
    });
    document.querySelectorAll('[data-region]').forEach(region => {
      region.classList.toggle('is-lit', explored.has(region.dataset.region));
    });
    document.querySelectorAll('[data-object]').forEach(link => {
      link.classList.toggle('is-explored', explored.has(link.dataset.object));
    });
    const progress = document.querySelector('[data-progress]');
    if (progress) progress.textContent = explored.size;
  }

  document.querySelectorAll('[data-object]').forEach(link => {
    function rememberObject() {
      restoreProgress();
      explored.add(link.dataset.object);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...explored]));
      } catch {
        // Keep this visit usable even if persistence is blocked.
      }
      renderProgress();
    }
    link.addEventListener('auxclick', event => {
      if (event.button === 1) rememberObject();
    });
    link.addEventListener('click', event => {
      if (event.button !== 0) return;
      const openSeparately = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (!openSeparately) event.preventDefault();
      if (navigating) return;
      rememberObject();
      if (openSeparately) return;
      const panel = document.querySelector(`[data-panel="${link.dataset.object}"]`);
      if (!panel) return;
      clearTimeout(closeTimer);
      panel.hidden = false;
      openingFrame = requestAnimationFrame(() => {
        openingFrame = requestAnimationFrame(() => panel.classList.add('is-open'));
      });
      const object = panel.querySelector('.story-object-preview');
      object.decode().catch(() => {}).then(() => loadFullImage(object.nextElementSibling));
      panel.querySelector('.close-story').focus();
    });
  });

  function closeStory() {
    const panel = document.querySelector('.story-panel:not([hidden])');
    if (!panel || panel.dataset.closing) return;
    panel.dataset.closing = 'true';
    cancelAnimationFrame(openingFrame);
    const wasOpen = panel.classList.contains('is-open');
    panel.classList.remove('is-open');
    const finish = () => {
      panel.hidden = true;
      delete panel.dataset.closing;
      document.querySelector(`[data-object="${panel.dataset.panel}"]`)?.focus();
    };
    if (!wasOpen || matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else closeTimer = setTimeout(finish, 550);
  }
  document.querySelectorAll('.close-story').forEach(button => button.addEventListener('click', closeStory));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeStory(); });

  window.addEventListener('pageshow', () => {
    navigating = false;
    restoreProgress();
  });
  window.addEventListener('storage', restoreProgress);
  restoreProgress();

  document.querySelectorAll('.room-preview').forEach(preview => {
    preview.decode().catch(() => {}).then(() => {
      requestAnimationFrame(() => loadFullImage(preview.nextElementSibling));
    });
  });

  const story = document.querySelector('.story-window');
  const object = document.querySelector('.story-object-preview');
  if (story && object) {
    story.classList.add('is-loading');
    // Wait for the foreground object so the text can emerge from behind it.
    object.decode().catch(() => {}).then(() => {
      loadFullImage(object.nextElementSibling);
      requestAnimationFrame(() => {
        story.classList.remove('is-loading');
        story.classList.add('is-revealing');
      });
    });
  }
})();
