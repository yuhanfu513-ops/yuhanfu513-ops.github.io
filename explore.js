(() => {
  const storageKey = 'bill-room-explored-v1';
  const lightStorageKey = 'bill-room-lights-v1';
  const objects = ['cello', 'boots', 'laptop'];
  const objectLight = { cello: 'left', boots: 'left', laptop: 'desk' };
  const lights = ['left', 'desk', 'bedside'];
  let explored = new Set();
  let illuminated = new Set();
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
      const savedLights = JSON.parse(localStorage.getItem(lightStorageKey) || '[]');
      if (Array.isArray(savedLights)) illuminated = new Set(savedLights.filter(item => lights.includes(item)));
      explored.forEach(item => illuminated.add(objectLight[item]));
    } catch {
      // The interaction still works when browser storage is unavailable.
    }
    renderProgress();
  }

  function renderProgress() {
    document.querySelectorAll('[data-light-region]').forEach(region => {
      region.classList.toggle('is-lit', illuminated.has(region.dataset.lightRegion));
    });
    document.querySelectorAll('[data-lamp]').forEach(lamp => {
      lamp.setAttribute('aria-pressed', String(illuminated.has(lamp.dataset.lamp)));
    });
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
      link.hidden = !illuminated.has(objectLight[link.dataset.object]);
    });
    const help = document.querySelector('.help-trigger');
    if (help) help.hidden = !objects.every(item => explored.has(item));
    const progress = document.querySelector('[data-progress]');
    if (progress) progress.textContent = explored.size;
  }

  document.querySelectorAll('[data-lamp]').forEach(lamp => {
    lamp.addEventListener('click', () => {
      illuminated.add(lamp.dataset.lamp);
      try { localStorage.setItem(lightStorageKey, JSON.stringify([...illuminated])); } catch {}
      renderProgress();
    });
  });

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
      if (!illuminated.has(objectLight[link.dataset.object])) { event.preventDefault(); return; }
      if (event.button === 1) rememberObject();
    });
    link.addEventListener('click', event => {
      if (event.button !== 0) return;
      if (!illuminated.has(objectLight[link.dataset.object])) { event.preventDefault(); return; }
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

  const helpTrigger = document.querySelector('.help-trigger');
  helpTrigger?.addEventListener('click', () => {
    const panel = document.querySelector('[data-panel="help"]');
    if (!panel || !objects.every(item => explored.has(item))) return;
    clearTimeout(closeTimer);
    panel.hidden = false;
    openingFrame = requestAnimationFrame(() => {
      openingFrame = requestAnimationFrame(() => panel.classList.add('is-open'));
    });
    panel.querySelector('.close-story').focus();
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
      document.dispatchEvent(new Event('story-closed'));
      if (panel.dataset.panel === 'help') helpTrigger?.focus();
      else document.querySelector(`[data-object="${panel.dataset.panel}"]`)?.focus();
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

// Reveal the detailed drawing through object silhouettes and a fading pointer trail.
(() => {
  const canvas = document.querySelector('.detail-trail');
  if (!canvas) return;
  const scene = canvas.parentElement;
  const shell = scene.closest('.scene-shell');
  const storyCursor = document.createElement('div');
  storyCursor.className = 'story-cursor';
  storyCursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(storyCursor);
  document.addEventListener('story-closed', () => storyCursor.classList.remove('is-visible'));
  const ctx = canvas.getContext('2d');
  const drawing = new Image();
  drawing.src = 'assets/revised-detail-hd.jpg';
  const shapes = {
    cello: [[37,30],[38.5,30],[39,39],[40.5,42],[40.5,46],[40,48],[41.4,53],[41.2,57],[40.5,59],[41,61],[40,61],[39.5,59],[35.5,59],[35,61],[34.3,61],[35,58],[34.3,55],[34.5,51],[35.3,48],[35,45],[35,42],[36.8,39]],
    boots: [[21.6,52],[23.8,50.5],[28.3,50.5],[28.3,57],[26.2,62],[21.6,62]],
    laptop: [[81.8,41.5],[85.8,42.5],[84.7,48.8],[85.5,50],[80.3,50.4],[77.2,48.2],[80.3,47.5]],
    'lamp-left': [[28.7,33],[32.3,33],[32.3,40],[28.7,40]],
    'lamp-desk': [[82.7,34],[88.4,34],[88.4,44.5],[82.7,44.5]],
    'lamp-bedside': [[93.2,35],[99,35],[99,53],[93.2,53]]
  };
  let hover = null, lastPointer = null, points = [], frame = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function wake() { if (!frame) frame = requestAnimationFrame(paint); }
  function paint(now) {
    frame = 0;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    points = points.filter(p => now-p.t < 420);
    if (!drawing.complete || !drawing.naturalWidth) return;
    ctx.globalCompositeOperation = 'source-over';
    if (hover) {
      ctx.fillStyle = '#fff';ctx.beginPath();
      shapes[hover].forEach(([x,y],i) => i ? ctx.lineTo(x*w/100,y*h/100) : ctx.moveTo(x*w/100,y*h/100));
      ctx.closePath();ctx.fill();
    }
    // Short strokes fade together over time, leaving no mark when the pointer rests.
    if (!reduced.matches && points.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = w * .045;
      ctx.filter = `blur(${Math.max(1, w * .003)}px)`;
      for (let i = 1; i < points.length; i++) {
        const p = points[i], previous = points[i - 1];
        if (p.start) continue;
        const life = Math.max(0, 1 - (now - p.t) / 420);
        ctx.strokeStyle = `rgba(255,255,255,${life * life * .75})`;
        ctx.beginPath();
        ctx.moveTo(previous.x * w, previous.y * h);
        ctx.lineTo(p.x * w, p.y * h);
        ctx.stroke();
      }
      ctx.filter = 'none';
    }
    ctx.globalCompositeOperation='source-in';
    ctx.drawImage(drawing,0,0,w,h);
    ctx.globalCompositeOperation='source-over';
    if (points.length) wake();
  }
  new ResizeObserver(() => {
    canvas.width=Math.min(1584,Math.round(scene.clientWidth*devicePixelRatio));
    canvas.height=Math.round(canvas.width*993/1584);
    wake();
  }).observe(scene);
  function updateCursor(e) {
    const panel = shell.querySelector('.story-panel:not([hidden])');
    const item = e.target.closest('[data-object]');
    const interactive = e.target.closest('a[href], button, input, select, textarea, [role="button"]');
    const useCircle = !reduced.matches && e.pointerType !== 'touch' && (panel || (interactive && shell.contains(interactive)));
    storyCursor.classList.toggle('is-visible', !!useCircle);
    if (useCircle) {
      const title = panel?.querySelector('h1') || (item && shell.querySelector(`[data-panel="${item.dataset.object}"] h1`));
      storyCursor.style.color = title ? getComputedStyle(title).color : 'var(--orange)';
      storyCursor.style.left = `${e.clientX}px`;
      storyCursor.style.top = `${e.clientY}px`;
      points = [];
      lastPointer = null;
      wake();
    }
    return !!useCircle;
  }
  shell.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch' || reduced.matches) return;
    if (updateCursor(e)) return;
    const b=scene.getBoundingClientRect(), now=performance.now();
    const next={x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height,t:now};
    if (lastPointer && Math.hypot(next.x-lastPointer.x,next.y-lastPointer.y) > 0.0005) {
      if (now-lastPointer.t > 120) points.push({...lastPointer,t:now,start:true});
      else if (!points.length) points.push({...lastPointer,start:true});
      points.push(next);
      points=points.slice(-60);
      wake();
    }
    lastPointer=next;
  });
  shell.addEventListener('pointerleave',()=>{storyCursor.classList.remove('is-visible');lastPointer=null;hover=null;wake()});
  shell.addEventListener('pointerover', updateCursor);
  document.addEventListener('pointermove', e => {
    if (!shell.contains(e.target) && shell.querySelector('.story-panel:not([hidden])')) updateCursor(e);
  });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && (shell.contains(e.target) || shell.querySelector('.story-panel:not([hidden])'))) {
      updateCursor(e);
      if (storyCursor.classList.contains('is-visible')) storyCursor.classList.add('is-pressed');
    }
  });
  const releaseCursor = () => storyCursor.classList.remove('is-pressed');
  document.addEventListener('pointerup', releaseCursor);
  document.addEventListener('pointercancel', releaseCursor);
  window.addEventListener('blur', releaseCursor);
  shell.addEventListener('click', e => {
    if (e.detail) requestAnimationFrame(() => updateCursor(e));
  });
  scene.querySelectorAll('[data-object]').forEach(link=>{
    const show=()=>{hover=link.dataset.object;wake()};
    const hide=()=>{hover=null;wake()};
    link.addEventListener('pointerenter',show);
    link.addEventListener('pointerleave',hide);
    link.addEventListener('focus',show);
    link.addEventListener('blur',hide);
    link.addEventListener('click',()=>{lastPointer=null;points=[];hover=null;wake()});
  });
  scene.querySelectorAll('[data-lamp]').forEach(lamp => {
    const show = () => { hover = 'lamp-' + lamp.dataset.lamp; wake(); };
    const hide = () => { hover = null; wake(); };
    lamp.addEventListener('pointerenter', show);
    lamp.addEventListener('pointerleave', hide);
    lamp.addEventListener('focus', show);
    lamp.addEventListener('blur', hide);
  });
  drawing.onload=()=>{document.body.classList.add('trail-ready');wake()};
})();

// Shared scene also handles bookmarked story links.
(() => {
  const item = new URLSearchParams(location.search).get('story');
  if (['cello','boots','laptop'].includes(item)) {
    document.querySelector('[data-object="'+item+'"]')?.click();
    history.replaceState(null, '', location.pathname);
  }
})();
