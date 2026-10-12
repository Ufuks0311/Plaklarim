// Kapak fotoğrafını kare çerçeveye oturtma ekranı.
// Kapağın dört köşesi otomatik bulunur; perspektif (eğiklik, çarpıklık)
// düzeltilerek kapak tam kareye gerilir. Köşeler elle de sürüklenebilir.
const CoverCropper = (() => {
  const WORK_SIDE = 2400; // Düzeltme sırasında kullanılan en büyük kenar.
  const DETECT_SIDE = 360; // Köşe bulma bu boyuttaki küçük kopyada yapılır.

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

  // Saat yönünde 90° döndürür.
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

  // ---------- Köşe bulma ----------

  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(a.length);
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let cnt = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { sum += a[y * w + k]; cnt++; }
        tmp[y * w + x] = sum / cnt;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let cnt = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { sum += tmp[k * w + x]; cnt++; }
        out[y * w + x] = sum / cnt;
      }
    }
    return out;
  }

  // Otsu eşiği: kenar gücünü "düz" ve "kenar" olarak ikiye ayırır.
  function otsu(values, max) {
    const bins = 256;
    const hist = new Float64Array(bins);
    for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
    const total = values.length;
    let sumAll = 0;
    for (let i = 0; i < bins; i++) sumAll += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let bestVar = -1;
    for (let i = 0; i < bins; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) ** 2;
      if (between > bestVar) { bestVar = between; best = i; }
    }
    return ((best + 1) / bins) * max;
  }

  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  function polygonArea(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  // Dışbükey zarfın içine sığan en büyük dörtgen: kapağın köşeleri.
  function largestQuad(hull) {
    let pts = hull;
    if (pts.length > 120) {
      const step = pts.length / 120;
      pts = Array.from({ length: 120 }, (_, i) => hull[Math.floor(i * step)]);
    }
    const n = pts.length;
    const tri = (a, b, c) => Math.abs(cross(a, b, c));
    let best = null;
    let bestArea = -1;
    for (let i = 0; i < n; i++) {
      for (let k = i + 2; k < n; k++) {
        let left = 0;
        let leftJ = -1;
        for (let j = i + 1; j < k; j++) {
          const t = tri(pts[i], pts[j], pts[k]);
          if (t > left) { left = t; leftJ = j; }
        }
        let right = 0;
        let rightL = -1;
        for (let l = k + 1; l < n + i; l++) {
          const t = tri(pts[k], pts[l % n], pts[i]);
          if (t > right) { right = t; rightL = l % n; }
        }
        if (leftJ < 0 || rightL < 0) continue;
        if (left + right > bestArea) {
          bestArea = left + right;
          best = [pts[i], pts[leftJ], pts[k], pts[rightL]];
        }
      }
    }
    if (!best) return null;
    // Örneklemede atlanan noktalarla köşeleri ince ayarla.
    for (let c = 0; c < 4; c++) {
      for (const p of hull) {
        const trial = best.slice();
        trial[c] = p;
        if (polygonArea(trial) > polygonArea(best)) best = trial;
      }
    }
    return best;
  }

  // Köşeleri sol üst, sağ üst, sağ alt, sol alt sırasına koyar.
  function orderCorners(q) {
    const cx = q.reduce((s, p) => s + p.x, 0) / 4;
    const cy = q.reduce((s, p) => s + p.y, 0) / 4;
    const sorted = q.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    let start = 0;
    sorted.forEach((p, i) => { if (p.x + p.y < sorted[start].x + sorted[start].y) start = i; });
    return sorted.slice(start).concat(sorted.slice(0, start));
  }

  // Kapağın köşelerini kaynak görsel koordinatlarında döndürür; bulamazsa null.
  function detectCorners(source) {
    const scale = Math.min(1, DETECT_SIDE / Math.max(source.width, source.height));
    const w = Math.max(8, Math.round(source.width * scale));
    const h = Math.max(8, Math.round(source.height * scale));
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;

    // Renk kanallarında ayrı ayrı kenar gücü (Sobel); en güçlü kanal alınır.
    const channels = [0, 1, 2].map((c) => {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = px[i * 4 + c];
      return boxBlur(boxBlur(a, w, h, 1), w, h, 1);
    });
    const mag = new Float32Array(n);
    let maxMag = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        let m = 0;
        for (const a of channels) {
          const gx = a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1] - a[i - w - 1] - 2 * a[i - 1] - a[i + w - 1];
          const gy = a[i + w - 1] + 2 * a[i + w] + a[i + w + 1] - a[i - w - 1] - 2 * a[i - w] - a[i - w + 1];
          m = Math.max(m, gx * gx + gy * gy);
        }
        mag[i] = Math.sqrt(m);
        if (mag[i] > maxMag) maxMag = mag[i];
      }
    }
    if (!maxMag) return null;
    const threshold = otsu(mag, maxMag);

    // Kenarları biraz kalınlaştır ki kapak çevresindeki küçük boşluklar kapansın.
    const edge = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (mag[i] > threshold) edge[i] = 1;
    const thick = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!edge[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w) thick[yy * w + xx] = 1;
          }
        }
      }
    }

    // Fotoğrafın kenarından başlayarak kenar çizgisine çarpmadan ulaşılan
    // her yer zemindir; geri kalan en büyük parça kapaktır.
    const bg = new Uint8Array(n);
    const stack = [];
    const seed = (i) => { if (!thick[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (i >= w) seed(i - w);
      if (i < n - w) seed(i + w);
    }

    const label = new Int32Array(n);
    let bestLabel = 0;
    let bestSize = 0;
    let next = 1;
    for (let s = 0; s < n; s++) {
      if (bg[s] || label[s]) continue;
      label[s] = next;
      stack.push(s);
      let size = 0;
      while (stack.length) {
        const i = stack.pop();
        size++;
        const x = i % w;
        const visit = (j) => { if (!bg[j] && !label[j]) { label[j] = next; stack.push(j); } };
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i < n - w) visit(i + w);
      }
      if (size > bestSize) { bestSize = size; bestLabel = next; }
      next++;
    }
    if (bestSize < n * 0.08) return null;

    // Parçanın her satırdaki en sol ve en sağ noktası zarf için yeterli.
    const points = [];
    for (let y = 0; y < h; y++) {
      let first = -1;
      let last = -1;
      for (let x = 0; x < w; x++) {
        if (label[y * w + x] === bestLabel) { if (first < 0) first = x; last = x; }
      }
      if (first >= 0) {
        points.push({ x: first + 0.5, y: y + 0.5 });
        if (last !== first) points.push({ x: last + 0.5, y: y + 0.5 });
      }
    }
    const hull = convexHull(points);
    if (hull.length < 4) return null;
    const quad = largestQuad(hull);
    if (!quad || polygonArea(quad) < n * 0.08) return null;
    return refineCorners(source, orderCorners(quad).map((p) => ({
      x: Math.min(source.width, Math.max(0, p.x / scale)),
      y: Math.min(source.height, Math.max(0, p.y / scale)),
    })));
  }

  // Küçük kopyada bulunan köşeleri tam çözünürlükte inceltir: her kenar
  // boyunca en keskin renk geçişi aranır, bu noktalara doğru oturtulur ve
  // komşu doğruların kesişimi yeni köşe olur.
  function refineCorners(source, corners) {
    const w = source.width;
    const h = source.height;
    const px = source.getContext('2d').getImageData(0, 0, w, h).data;
    const color = (x, y) => {
      const i = (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };
    const reach = Math.max(6, Math.round(Math.max(w, h) * 0.015));
    const lines = corners.map((p, i) => {
      const q = corners[(i + 1) % 4];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const dx = (q.x - p.x) / len;
      const dy = (q.y - p.y) / len;
      const nx = -dy;
      const ny = dx;
      let pts = [];
      for (let k = 1; k < 40; k++) {
        const t = 0.08 + (0.84 * k) / 40;
        const bx = p.x + (q.x - p.x) * t;
        const by = p.y + (q.y - p.y) * t;
        let best = 0;
        let bestS = 0;
        for (let s = -reach; s <= reach; s += 0.5) {
          const a = color(bx + nx * (s - 1.5), by + ny * (s - 1.5));
          const b = color(bx + nx * (s + 1.5), by + ny * (s + 1.5));
          const g = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
          if (g > best) { best = g; bestS = s; }
        }
        if (best > 30) pts.push({ x: bx + nx * bestS, y: by + ny * bestS });
      }
      if (pts.length < 8) return null;
      // Doğru uydur; uzak düşen noktaları atıp bir kez daha uydur.
      const fit = (list) => {
        const mx = list.reduce((s, v) => s + v.x, 0) / list.length;
        const my = list.reduce((s, v) => s + v.y, 0) / list.length;
        let sxx = 0; let syy = 0; let sxy = 0;
        for (const v of list) { sxx += (v.x - mx) ** 2; syy += (v.y - my) ** 2; sxy += (v.x - mx) * (v.y - my); }
        const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return { mx, my, ux: Math.cos(angle), uy: Math.sin(angle) };
      };
      let line = fit(pts);
      const dist = (v, l) => Math.abs((v.x - l.mx) * -l.uy + (v.y - l.my) * l.ux);
      const sorted = pts.map((v) => dist(v, line)).sort((a, b) => a - b);
      const limit = Math.max(1.5, sorted[Math.floor(sorted.length / 2)] * 2.5);
      pts = pts.filter((v) => dist(v, line) <= limit);
      if (pts.length >= 6) line = fit(pts);
      return line;
    });
    if (lines.some((l) => !l)) return corners;
    const meet = (l1, l2) => {
      const den = l1.ux * l2.uy - l1.uy * l2.ux;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((l2.mx - l1.mx) * l2.uy - (l2.my - l1.my) * l2.ux) / den;
      return { x: l1.mx + l1.ux * t, y: l1.my + l1.uy * t };
    };
    const refined = corners.map((c, i) => meet(lines[(i + 3) % 4], lines[i]));
    const sane = refined.every((r, i) => r && Math.hypot(r.x - corners[i].x, r.y - corners[i].y) < reach * 2.5);
    if (!sane) return corners;
    return refined.map((r) => ({ x: Math.min(w, Math.max(0, r.x)), y: Math.min(h, Math.max(0, r.y)) }));
  }

  function defaultCorners(source) {
    const side = Math.min(source.width, source.height) * 0.8;
    const x0 = (source.width - side) / 2;
    const y0 = (source.height - side) / 2;
    return [
      { x: x0, y: y0 }, { x: x0 + side, y: y0 },
      { x: x0 + side, y: y0 + side }, { x: x0, y: y0 + side },
    ];
  }

  // ---------- Perspektif düzeltme ----------

  // Birim kareyi (0,0)-(1,1) verilen dörtgene eşleyen dönüşüm (homografi).
  function squareToQuad([p0, p1, p2, p3]) {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0;
    let hh = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den;
      hh = (dx1 * dy3 - dx3 * dy1) / den;
    }
    return {
      a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + hh * p3.x, c: p0.x,
      d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + hh * p3.y, f: p0.y,
      g, h: hh,
    };
  }

  function warp(source, corners, maxSide) {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const longest = Math.max(...corners.map((p, i) => dist(p, corners[(i + 1) % 4])));
    const side = Math.max(1, Math.round(Math.min(maxSide, longest)));
    const sw = source.width;
    const sh = source.height;
    const src = source.getContext('2d').getImageData(0, 0, sw, sh).data;
    const out = new ImageData(side, side);
    const o = out.data;
    const H = squareToQuad(corners);
    // Kenarlarda zemin çizgisi kalmasın diye kapaktan çok ince bir pay kesilir.
    const edge = 0.004;
    const at = (i) => edge + ((1 - 2 * edge) * (i + 0.5)) / side;
    for (let v = 0; v < side; v++) {
      const vv = at(v);
      for (let u = 0; u < side; u++) {
        const uu = at(u);
        const z = H.g * uu + H.h * vv + 1;
        let x = (H.a * uu + H.b * vv + H.c) / z - 0.5;
        let y = (H.d * uu + H.e * vv + H.f) / z - 0.5;
        x = Math.min(sw - 1, Math.max(0, x));
        y = Math.min(sh - 1, Math.max(0, y));
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = x - x0;
        const fy = y - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;
        const k = (v * side + u) * 4;
        for (let c = 0; c < 3; c++) {
          const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
          const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
          o[k + c] = top + (bottom - top) * fy;
        }
        o[k + 3] = 255;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    canvas.getContext('2d').putImageData(out, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  }

  // ---------- Ekran ----------

  const SVG = 'http://www.w3.org/2000/svg';

  // Kareye oturtulmuş JPEG döndürür; vazgeçilirse null.
  async function open(file, maxSide) {
    let source = await loadSource(file);
    let corners = detectCorners(source);
    const found = Boolean(corners);
    corners = corners || defaultCorners(source);

    const overlay = document.createElement('div');
    overlay.className = 'cropper';
    overlay.innerHTML = `
      <p class="cropper-hint"></p>
      <div class="cropper-stage">
        <svg class="cropper-svg">
          <path class="cropper-shade" fill-rule="evenodd"></path>
          <polygon class="cropper-quad"></polygon>
        </svg>
        <canvas class="cropper-loupe" width="140" height="140" hidden></canvas>
      </div>
      <div class="cropper-tools">
        <button type="button" class="btn small" data-act="detect">Köşeleri bul</button>
        <button type="button" class="btn small" data-act="rotate">Döndür</button>
      </div>
      <div class="cropper-actions">
        <button type="button" class="btn" data-act="cancel">Vazgeç</button>
        <button type="button" class="btn primary" data-act="ok">Kareye oturt</button>
      </div>`;
    const hint = overlay.querySelector('.cropper-hint');
    const stage = overlay.querySelector('.cropper-stage');
    const svg = overlay.querySelector('.cropper-svg');
    const shade = overlay.querySelector('.cropper-shade');
    const quadEl = overlay.querySelector('.cropper-quad');
    const loupe = overlay.querySelector('.cropper-loupe');
    const handles = corners.map(() => {
      const g = document.createElementNS(SVG, 'g');
      g.setAttribute('class', 'cropper-handle');
      g.innerHTML = '<circle class="hit"></circle><circle class="dot"></circle>';
      svg.append(g);
      return g;
    });
    const setHint = (ok) => {
      hint.textContent = ok
        ? 'Köşeler otomatik bulundu. Gerekirse noktaları kapağın köşelerine sürükle.'
        : 'Köşeler bulunamadı. Dört noktayı kapağın köşelerine sürükle.';
    };
    setHint(found);
    stage.prepend(source);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');

    // Görsel sahneye sığdırılır; ds = ekran pikseli / kaynak pikseli.
    let ds = 1;
    let offX = 0;
    let offY = 0;
    function layout() {
      const sw = stage.clientWidth - 24;
      const sh = stage.clientHeight - 24;
      ds = Math.min(sw / source.width, sh / source.height);
      const w = source.width * ds;
      const h = source.height * ds;
      offX = (stage.clientWidth - w) / 2;
      offY = (stage.clientHeight - h) / 2;
      for (const el of [source, svg]) {
        Object.assign(el.style, { left: `${offX}px`, top: `${offY}px`, width: `${w}px`, height: `${h}px` });
      }
      svg.setAttribute('viewBox', `0 0 ${source.width} ${source.height}`);
      draw();
    }
    function draw() {
      const pts = corners.map((p) => `${p.x},${p.y}`).join(' ');
      quadEl.setAttribute('points', pts);
      quadEl.style.strokeWidth = `${2 / ds}`;
      shade.setAttribute('d', `M0 0H${source.width}V${source.height}H0Z M${corners.map((p) => `${p.x} ${p.y}`).join(' L')}Z`);
      handles.forEach((g, i) => {
        const [hit, dot] = g.children;
        for (const c of [hit, dot]) { c.setAttribute('cx', corners[i].x); c.setAttribute('cy', corners[i].y); }
        hit.setAttribute('r', 26 / ds);
        dot.setAttribute('r', 9 / ds);
        dot.style.strokeWidth = `${2.5 / ds}`;
      });
    }
    layout();

    // Büyüteç: sürüklenen köşenin çevresini büyütüp gösterir.
    function drawLoupe(p) {
      const size = loupe.width;
      const zoom = Math.max(ds * 3, 1.5);
      const r = size / zoom / 2;
      const ctx = loupe.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(source, p.x - r, p.y - r, r * 2, r * 2, 0, 0, size, size);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
      ctx.stroke();
      // Köşe solda ise büyüteç sağda, sağda ise solda dursun.
      loupe.classList.toggle('right', p.x * ds < stage.clientWidth / 2);
      loupe.hidden = false;
    }

    let active = -1;
    let grab = { x: 0, y: 0 };
    const toSource = (e) => {
      const r = svg.getBoundingClientRect();
      return { x: (e.clientX - r.left) / ds, y: (e.clientY - r.top) / ds };
    };
    svg.addEventListener('pointerdown', (e) => {
      const p = toSource(e);
      let bestD = Infinity;
      corners.forEach((c, i) => {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) { bestD = d; active = i; }
      });
      if (bestD * ds > 48) { active = -1; return; }
      grab = { x: corners[active].x - p.x, y: corners[active].y - p.y };
      svg.setPointerCapture(e.pointerId);
      drawLoupe(corners[active]);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (active < 0) return;
      const p = toSource(e);
      corners[active] = {
        x: Math.min(source.width, Math.max(0, p.x + grab.x)),
        y: Math.min(source.height, Math.max(0, p.y + grab.y)),
      };
      draw();
      drawLoupe(corners[active]);
    });
    const release = () => {
      if (active < 0) return;
      active = -1;
      loupe.hidden = true;
      corners = orderCorners(corners);
      draw();
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    window.addEventListener('resize', layout);

    const ok = await new Promise((resolve) => {
      overlay.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'cancel') resolve(false);
        if (act === 'ok') resolve(true);
        if (act === 'detect') {
          const again = detectCorners(source);
          if (again) corners = again;
          setHint(Boolean(again));
          draw();
        }
        if (act === 'rotate') {
          const oldHeight = source.height;
          source.remove();
          source = rotate(source);
          stage.prepend(source);
          corners = orderCorners(corners.map((p) => ({ x: oldHeight - p.y, y: p.x })));
          layout();
        }
      });
    });

    window.removeEventListener('resize', layout);
    overlay.remove();
    document.body.classList.remove('no-scroll');
    if (!ok) return null;
    return warp(source, corners, maxSide);
  }

  return { open, detectCorners, warp };
})();
