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

// Reveal the detailed drawing through object silhouettes and a fading pointer trail.
(() => {
  const canvas = document.querySelector('.detail-trail');
  if (!canvas) return;
  const scene = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const drawing = new Image();
  drawing.src = 'assets/revised-detail-hd.jpg';
  const shapes = {
    cello: [[37,30],[38.5,30],[39,39],[40.5,42],[40.5,46],[40,48],[41.4,53],[41.2,57],[40.5,59],[41,61],[40,61],[39.5,59],[35.5,59],[35,61],[34.3,61],[35,58],[34.3,55],[34.5,51],[35.3,48],[35,45],[35,42],[36.8,39]],
    boots: [[21.6,52],[23.8,50.5],[28.3,50.5],[28.3,57],[26.2,62],[21.6,62]],
    laptop: [[81.8,41.5],[85.8,42.5],[84.7,48.8],[85.5,50],[80.3,50.4],[77.2,48.2],[80.3,47.5]]
  };
  let hover = null, pointer = null, points = [], frame = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function wake() { if (!frame) frame = requestAnimationFrame(paint); }
  function paint(now) {
    frame = 0;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    points = points.filter(p => now-p.t < 1100);
    if (!drawing.complete || !drawing.naturalWidth) return;
    ctx.globalCompositeOperation = 'source-over';
    if (hover) {
      ctx.fillStyle = '#fff';ctx.beginPath();
      shapes[hover].forEach(([x,y],i) => i ? ctx.lineTo(x*w/100,y*h/100) : ctx.moveTo(x*w/100,y*h/100));
      ctx.closePath();ctx.fill();
    }
    const spots = reduced.matches ? [] : points;
    if (pointer) spots.push({...pointer,t:now,current:true});
    for (const p of spots) {
      const alpha = p.current ? 1 : Math.pow(1-(now-p.t)/1100,2);
      const r = w*.045;
      const g = ctx.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,r);
      g.addColorStop(0,'rgba(255,255,255,'+alpha+')');
      g.addColorStop(.45,'rgba(255,255,255,'+alpha*.85+')');
      g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(p.x*w-r,p.y*h-r,r*2,r*2);
    }
    points = points.filter(p=>!p.current);
    ctx.globalCompositeOperation='source-in';
    ctx.drawImage(drawing,0,0,w,h);
    ctx.globalCompositeOperation='source-over';
    if (points.length) wake();
  }
  new ResizeObserver(() => {
    canvas.width=Math.min(1584,Math.round(scene.clientWidth*devicePixelRatio));
    canvas.height=Math.round(canvas.width*993/1584);wake();
  }).observe(scene);
  scene.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch') return;
    const b=scene.getBoundingClientRect();
    pointer={x:(e.clientX-b.left)/b.width,y:(e.clientY-b.top)/b.height};
    if(!reduced.matches) points.push({...pointer,t:performance.now()});
    points=points.slice(-90);wake();
  });
  scene.addEventListener('pointerleave',()=>{pointer=null;hover=null;wake()});
  scene.querySelectorAll('[data-object]').forEach(link=>{
    const show=()=>{hover=link.dataset.object;wake()};
    const hide=()=>{hover=null;wake()};
    link.addEventListener('pointerenter',show);
    link.addEventListener('pointerleave',hide);
    link.addEventListener('focus',show);
    link.addEventListener('blur',hide);
    link.addEventListener('click',()=>{pointer=null;points=[];hover=null;wake()});
  });
  drawing.onload=wake;
})();

// Shared scene also handles bookmarked story links.
(() => {
  const item = new URLSearchParams(location.search).get('story');
  if (['cello','boots','laptop'].includes(item)) {
    document.querySelector('[data-object="'+item+'"]')?.click();
    history.replaceState(null, '', location.pathname);
  }
})();
