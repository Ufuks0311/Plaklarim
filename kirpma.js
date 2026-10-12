// Kapak fotoğrafını kare çerçeveye kırpma ekranı.
// Fotoğraf sürüklenerek kaydırılır, iki parmakla (ya da kaydırıcıyla) büyütülür.
const CoverCropper = (() => {
  const WORK_SIDE = 2400; // Kırpma sırasında kullanılan en büyük kenar.

  async function loadSource(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, WORK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function rotate(source) {
    const canvas = document.createElement('canvas');
    canvas.width = source.height;
    canvas.height = source.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(source, 0, 0);
    return canvas;
  }

  // Kare olarak kırpılmış JPEG döndürür; vazgeçilirse null.
  async function open(file, maxSide) {
    let source = await loadSource(file);

    const overlay = document.createElement('div');
    overlay.className = 'cropper';
    overlay.innerHTML = `
      <p class="cropper-hint">Kapağı çerçeveye oturt: sürükle, iki parmakla büyüt.</p>
      <div class="cropper-stage">
        <div class="cropper-frame"></div>
      </div>
      <div class="cropper-tools">
        <input type="range" class="cropper-zoom" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştır">
        <button type="button" class="btn small" data-act="rotate">Döndür</button>
      </div>
      <div class="cropper-actions">
        <button type="button" class="btn" data-act="cancel">Vazgeç</button>
        <button type="button" class="btn primary" data-act="ok">Kırp ve kullan</button>
      </div>`;
    const stage = overlay.querySelector('.cropper-stage');
    const frameEl = overlay.querySelector('.cropper-frame');
    const zoomInput = overlay.querySelector('.cropper-zoom');
    stage.prepend(source);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');

    // Görüntü konumu çerçeveye göre: sol üst köşe (x, y), ölçek s (ekran px / kaynak px).
    let frame = 0;
    let minScale = 1;
    let s = 1;
    let x = 0;
    let y = 0;

    function clamp() {
      s = Math.min(Math.max(s, minScale), minScale * 4);
      x = Math.min(0, Math.max(frame - source.width * s, x));
      y = Math.min(0, Math.max(frame - source.height * s, y));
    }
    function draw() {
      clamp();
      const left = frameEl.offsetLeft;
      const top = frameEl.offsetTop;
      source.style.transform = `translate(${left + x}px, ${top + y}px) scale(${s})`;
      zoomInput.value = String(s / minScale);
    }
    // Ölçeği değiştirirken çerçevedeki (cx, cy) noktası yerinde kalsın.
    function zoomTo(next, cx = frame / 2, cy = frame / 2) {
      const prev = s;
      s = Math.min(Math.max(next, minScale), minScale * 4);
      x = cx - ((cx - x) * s) / prev;
      y = cy - ((cy - y) * s) / prev;
      draw();
    }
    function reset() {
      frame = frameEl.clientWidth;
      minScale = frame / Math.min(source.width, source.height);
      s = minScale;
      x = (frame - source.width * s) / 2;
      y = (frame - source.height * s) / 2;
      draw();
    }
    reset();

    const pointers = new Map();
    let pinch = null;
    const framePoint = (e) => {
      const r = frameEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: s };
      }
    });
    stage.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 1) {
        x += cur.x - prev.x;
        y += cur.y - prev.y;
        draw();
      } else if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const mid = framePoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        zoomTo(pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), mid.x, mid.y);
      }
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = framePoint(e);
      zoomTo(s * Math.exp(-e.deltaY / 500), p.x, p.y);
    }, { passive: false });
    zoomInput.addEventListener('input', () => zoomTo(minScale * Number(zoomInput.value)));
    const onResize = () => reset();
    window.addEventListener('resize', onResize);

    const result = await new Promise((resolve) => {
      overlay.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'cancel') resolve(null);
        if (act === 'ok') resolve('ok');
        if (act === 'rotate') {
          source.remove();
          source = rotate(source);
          stage.prepend(source);
          reset();
        }
      });
    });

    window.removeEventListener('resize', onResize);
    overlay.remove();
    document.body.classList.remove('no-scroll');
    if (!result) return null;

    // Çerçevenin kaynak görseldeki karşılığı.
    const side = frame / s;
    const out = Math.round(Math.min(maxSide, side));
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(source, -x / s, -y / s, side, side, 0, 0, out, out);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  }

  return { open };
})();
