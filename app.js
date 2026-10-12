// Plaklarım: sayfa yönlendirme, liste, detay ve kayıt formu.
const view = document.getElementById('view');
const MAX_IMAGE_SIDE = 1600;

// Her ekran değişiminde serbest bırakılacak görsel adresleri.
let objectUrls = [];
function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}
function releaseUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2500);
}

// Şarkılar { no, title, artist } nesneleri olarak saklanır. Eski sürümlerde
// düz metin ya da numarasız kaydedilmiş şarkılar okunurken bu yapıya çevrilir.
const sideLetter = (side) => side.slice(-1);
const autoTrackNo = (side, i) => `${sideLetter(side)}${i + 1}`;

function tracksOf(record, side) {
  return (record[side] || []).map((t, i) => (typeof t === 'string'
    ? { no: autoTrackNo(side, i), title: t, artist: '' }
    : { no: t.no || autoTrackNo(side, i), title: t.title || '', artist: t.artist || '' }));
}

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
// Sıra numarası olanlar numaraya göre başta, olmayanlar sanatçıya göre sonda.
const byRecordOrder = (a, b) =>
  (!a.no - !b.no) || collator.compare(a.no || '', b.no || '') ||
  collator.compare(a.artist, b.artist) || collator.compare(a.album, b.album);

function nextRecordNo(records) {
  const nums = records.map((r) => parseInt(r.no, 10)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : records.length + 1);
}

// ---------- Yönlendirme ----------

async function route() {
  releaseUrls();
  closeMenu();
  const [, page, id] = location.hash.replace(/^#/, '').split('/');
  try {
    if (page === 'plak' && id) await renderDetail(id);
    else if (page === 'yeni') await renderForm();
    else if (page === 'duzenle' && id) await renderForm(id);
    else await renderList();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<p class="empty">Bir hata oluştu: ${esc(err.message)}</p>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- Liste ----------

let lastQuery = '';

async function renderList() {
  const records = (await DB.all()).sort(byRecordOrder);
  view.innerHTML = `
    <div class="search">
      <input type="search" id="q" placeholder="Sanatçı, albüm veya şarkı ara" value="${esc(lastQuery)}" autocomplete="off">
    </div>
    <p class="count" id="count"></p>
    <ul class="grid" id="grid"></ul>
    <a href="#/yeni" class="fab" aria-label="Yeni plak ekle">+</a>
  `;

  const grid = document.getElementById('grid');
  const count = document.getElementById('count');
  const q = document.getElementById('q');

  if (!records.length) {
    count.textContent = '';
    grid.outerHTML = `<div class="empty">
      <p>Henüz plak eklemedin.</p>
      <p><a href="#/yeni" class="btn primary">İlk plağı ekle</a></p>
    </div>`;
    q.disabled = true;
    return;
  }

  const thumbs = new Map(records.map((r) => [r.id, r.frontCover ? blobUrl(r.frontCover) : '']));

  function draw() {
    const term = q.value.trim().toLocaleLowerCase('tr');
    lastQuery = q.value;
    const shown = term
      ? records.filter((r) => [r.no && `#${r.no}`, r.artist, r.album, r.label, r.genre, r.year,
          ...[...tracksOf(r, 'sideA'), ...tracksOf(r, 'sideB')].flatMap((t) => [t.title, t.artist])]
          .join('\n').toLocaleLowerCase('tr').includes(term))
      : records;
    count.textContent = term
      ? `${shown.length} / ${records.length} plak`
      : `${records.length} plak`;
    grid.innerHTML = shown.map((r) => `
      <li>
        <a href="#/plak/${esc(r.id)}" class="card${r.no ? ' numbered' : ''}">
          ${thumbs.get(r.id)
            ? `<img src="${thumbs.get(r.id)}" alt="" loading="lazy">`
            : '<div class="no-cover" aria-hidden="true"></div>'}
          ${r.no ? `<span class="badge">#${esc(r.no)}</span>` : ''}
          <strong>${esc(r.album)}</strong>
          <span>${esc(r.artist)}${r.year ? ` · ${esc(r.year)}` : ''}</span>
        </a>
      </li>`).join('') || '<li class="empty">Sonuç yok.</li>';
  }

  q.addEventListener('input', draw);
  draw();
}

// ---------- Detay ----------

function trackList(title, tracks, albumArtist) {
  if (!tracks.length) return '';
  return `
    <section class="side">
      <h3>${title}</h3>
      <ul class="tracklist">${tracks.map((t) => `<li>
        <span class="track-no">${esc(t.no)}</span>
        <span>
          <span class="track-title">${esc(t.title)}</span>
          ${t.artist && t.artist !== albumArtist ? `<span class="track-artist">${esc(t.artist)}</span>` : ''}
        </span>
      </li>`).join('')}</ul>
    </section>`;
}

async function renderDetail(id) {
  const r = await DB.get(id);
  if (!r) {
    view.innerHTML = '<p class="empty">Plak bulunamadı. <a href="#/">Listeye dön</a></p>';
    return;
  }
  const covers = [['Ön kapak', r.frontCover], ['Arka kapak', r.backCover]]
    .filter(([, blob]) => blob)
    .map(([label, blob]) => {
      const url = blobUrl(blob);
      return `
      <figure>
        <a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${label}"></a>
        <figcaption>${label}</figcaption>
      </figure>`;
    }).join('');

  const meta = [['Yıl', r.year], ['Plak şirketi', r.label], ['Tür', r.genre]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');

  view.innerHTML = `
    <article class="detail">
      <a href="#/" class="back">‹ Tüm plaklar</a>
      ${r.no ? `<p class="record-no">Sıra no #${esc(r.no)}</p>` : ''}
      <h1>${esc(r.album)}</h1>
      <p class="artist">${esc(r.artist)}</p>
      ${covers ? `<div class="covers">${covers}</div>` : ''}
      ${meta ? `<dl class="meta">${meta}</dl>` : ''}
      <div class="sides">
        ${trackList('A yüzü', tracksOf(r, 'sideA'), r.artist)}
        ${trackList('B yüzü', tracksOf(r, 'sideB'), r.artist)}
      </div>
      ${r.notes ? `<section class="notes"><h3>Notlar</h3><p>${esc(r.notes)}</p></section>` : ''}
      <div class="actions">
        <a href="#/duzenle/${esc(r.id)}" class="btn primary">Düzenle</a>
        <button class="btn danger" id="deleteBtn">Sil</button>
      </div>
    </article>`;

  document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (!confirm(`"${r.album}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    await DB.remove(r.id);
    toast('Plak silindi');
    location.hash = '#/';
  });
}

// ---------- Form ----------

function coverPicker(key, label, blob) {
  return `
    <div class="cover-picker" data-key="${key}">
      <span class="label">${label}</span>
      <div class="preview">${blob ? `<img src="${blobUrl(blob)}" alt="">` : '<span>Görsel yok</span>'}</div>
      <div class="picker-buttons">
        <label class="btn small">Fotoğraf çek
          <input type="file" accept="image/*" capture="environment" hidden>
        </label>
        <label class="btn small">Galeriden seç
          <input type="file" accept="image/*" hidden>
        </label>
        <button type="button" class="btn small ghost remove" ${blob ? '' : 'hidden'}>Kaldır</button>
      </div>
      <p class="read-status" hidden></p>
    </div>`;
}

// Otomatik numarayla aynı olan sıra numarası boş gösterilir; böylece şarkı
// silinince ya da eklenince numaralar kendiliğinden kayar.
function trackRow(t = { no: '', title: '', artist: '' }, side, i) {
  const auto = autoTrackNo(side, i);
  return `
    <li class="track-row">
      <input class="t-no" placeholder="${auto}" value="${t.no === auto ? '' : esc(t.no)}" autocomplete="off" aria-label="Sıra no">
      <input class="t-title" placeholder="Şarkı adı" value="${esc(t.title)}" autocomplete="off" aria-label="Şarkı adı">
      <input class="t-artist" placeholder="Söyleyen" value="${esc(t.artist)}" autocomplete="off" aria-label="Söyleyen">
      <button type="button" class="icon-btn remove-track" aria-label="Şarkıyı sil">×</button>
    </li>`;
}

function trackEditor(side, label, tracks) {
  return `
    <fieldset class="tracks" data-side="${side}">
      <legend>${label}</legend>
      <ol class="track-rows">${(tracks.length ? tracks : [undefined]).map((t, i) => trackRow(t, side, i)).join('')}</ol>
      <button type="button" class="btn small add-track">+ Şarkı ekle</button>
    </fieldset>`;
}

function readTracks(side) {
  return [...view.querySelectorAll(`.tracks[data-side=${side}] .track-row`)]
    .map((row) => ({
      no: row.querySelector('.t-no').value.trim(),
      title: row.querySelector('.t-title').value.trim(),
      artist: row.querySelector('.t-artist').value.trim(),
    }))
    .filter((t) => t.title)
    .map((t, i) => ({ ...t, no: t.no || autoTrackNo(side, i) }));
}

function renumberPlaceholders(fs) {
  fs.querySelectorAll('.t-no').forEach((input, i) => {
    input.placeholder = autoTrackNo(fs.dataset.side, i);
  });
}

async function renderForm(id) {
  const existing = id ? await DB.get(id) : null;
  if (id && !existing) {
    view.innerHTML = '<p class="empty">Plak bulunamadı. <a href="#/">Listeye dön</a></p>';
    return;
  }
  const r = existing || { sideA: [], sideB: [], no: nextRecordNo(await DB.all()) };
  const images = { frontCover: r.frontCover || null, backCover: r.backCover || null };

  view.innerHTML = `
    <form class="form" id="form" novalidate>
      <a href="${id ? `#/plak/${esc(id)}` : '#/'}" class="back">‹ Vazgeç</a>
      <h1>${id ? 'Plağı düzenle' : 'Yeni plak'}</h1>

      <p class="hint">Önce kapak fotoğraflarını ekle; okuma açıksa aşağıdaki bilgiler kapaktan doldurulur.</p>
      <div class="covers-edit">
        ${coverPicker('frontCover', 'Ön kapak', images.frontCover)}
        ${coverPicker('backCover', 'Arka kapak', images.backCover)}
      </div>

      <label class="no-field">Sıra no
        <input name="no" inputmode="numeric" value="${esc(r.no)}" autocomplete="off">
      </label>
      <label>Sanatçı *
        <input name="artist" required value="${esc(r.artist)}" autocomplete="off">
      </label>
      <label>Albüm adı *
        <input name="album" required value="${esc(r.album)}" autocomplete="off">
      </label>
      <div class="row">
        <label>Yıl
          <input name="year" inputmode="numeric" maxlength="4" value="${esc(r.year)}">
        </label>
        <label>Tür
          <input name="genre" value="${esc(r.genre)}">
        </label>
      </div>
      <label>Plak şirketi
        <input name="label" value="${esc(r.label)}">
      </label>
      <div class="lookup">
        <button type="button" class="btn small" id="lookupBtn">Yıl, tür ve plak şirketini internetten bul</button>
        <p class="read-status" id="lookupStatus" hidden></p>
      </div>


      <p class="hint">Karma plaklarda her şarkının söyleyenini ayrıca yaz; boş bırakılırsa albüm sanatçısı sayılır.</p>
      ${trackEditor('sideA', 'A yüzü', tracksOf(r, 'sideA'))}
      ${trackEditor('sideB', 'B yüzü', tracksOf(r, 'sideB'))}
      <label>Notlar
        <textarea name="notes" rows="3" placeholder="Baskı, durum, nereden alındığı…">${esc(r.notes)}</textarea>
      </label>

      <p class="error" id="formError" hidden></p>
      <button type="submit" class="btn primary block">Kaydet</button>
    </form>`;

  view.querySelectorAll('.cover-picker').forEach((picker) => {
    const key = picker.dataset.key;
    const preview = picker.querySelector('.preview');
    const removeBtn = picker.querySelector('.remove');
    const status = picker.querySelector('.read-status');

    picker.querySelectorAll('input[type=file]').forEach((input) => {
      input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        try {
          // Fotoğraf kare çerçeveye kırpılır; vazgeçilirse önceki görsel kalır.
          const cropped = await CoverCropper.open(file, MAX_IMAGE_SIDE);
          if (!cropped) return;
          images[key] = cropped;
          preview.innerHTML = `<img src="${blobUrl(images[key])}" alt="">`;
          removeBtn.hidden = false;
        } catch (err) {
          console.error(err);
          preview.innerHTML = '<span>Görsel okunamadı</span>';
          return;
        }
        readCover(key === 'frontCover' ? 'front' : 'back', images[key], status);
      });
    });

    removeBtn.addEventListener('click', () => {
      images[key] = null;
      preview.innerHTML = '<span>Görsel yok</span>';
      removeBtn.hidden = true;
    });
  });

  view.querySelectorAll('.tracks').forEach((fs) => {
    const rows = fs.querySelector('.track-rows');
    fs.querySelector('.add-track').addEventListener('click', () => {
      rows.insertAdjacentHTML('beforeend', trackRow(undefined, fs.dataset.side, rows.children.length));
      rows.lastElementChild.querySelector('.t-title').focus();
    });
    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-track');
      if (!btn) return;
      btn.closest('.track-row').remove();
      if (!rows.children.length) rows.insertAdjacentHTML('beforeend', trackRow(undefined, fs.dataset.side, 0));
      renumberPlaceholders(fs);
    });
    // Şarkı adında Enter formu göndermesin, alttaki alana geçsin.
    rows.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        const inputs = [...fs.querySelectorAll('input')];
        const next = inputs[inputs.indexOf(e.target) + 1];
        if (next) next.focus(); else fs.querySelector('.add-track').click();
      }
    });
  });

  // Kapak fotoğrafından okunan bilgileri forma yazar. Elle girilmiş alanların
  // üzerine yazmaz; şarkı listesi doluysa değiştirmeden önce sorar.
  async function readCover(kind, blob, status) {
    if (!CoverReader.hasKey()) {
      status.textContent = 'Bilgileri kapaktan otomatik doldurmak için menüden (⋮) "Kapak okuma ayarı"nı aç.';
      status.hidden = false;
      return;
    }
    status.textContent = 'Kapak okunuyor…';
    status.hidden = false;
    try {
      const info = await CoverReader.read(kind, blob);
      const form = document.getElementById('form');
      if (!form) return; // okuma sürerken başka ekrana geçildi
      const filled = [];
      [['artist', 'sanatçı'], ['album', 'albüm adı'], ['year', 'yıl'], ['label', 'plak şirketi']]
        .forEach(([name, label]) => {
          const input = form.elements[name];
          const value = (info[name] || '').trim();
          if (value && !input.value.trim()) {
            input.value = value;
            filled.push(label);
          }
        });
      let trackCount = 0;
      for (const side of ['sideA', 'sideB']) {
        const tracks = (info[side] || []).filter((t) => t.title && t.title.trim());
        if (!tracks.length) continue;
        const fs = view.querySelector(`.tracks[data-side=${side}]`);
        const label = side === 'sideA' ? 'A' : 'B';
        if (readTracks(side).length &&
            !confirm(`${label} yüzü için kapaktan ${tracks.length} şarkı okundu. Mevcut liste bununla değiştirilsin mi?`)) {
          continue;
        }
        fs.querySelector('.track-rows').innerHTML = tracks
          .map((t, i) => trackRow({ no: t.no.trim() || autoTrackNo(side, i), title: t.title.trim(), artist: t.artist.trim() }, side, i))
          .join('');
        trackCount += tracks.length;
      }
      if (trackCount) filled.push(`${trackCount} şarkı`);
      status.textContent = filled.length
        ? `Kapaktan dolduruldu: ${filled.join(', ')}. Kontrol etmeyi unutma.`
        : 'Kapakta yeni bilgi bulunamadı.';
      const f = form.elements;
      if (f.artist.value.trim() && f.album.value.trim() &&
          !(f.year.value.trim() && f.genre.value.trim() && f.label.value.trim())) {
        lookupOnline();
      }
    } catch (err) {
      console.error(err);
      status.textContent = `Kapak okunamadı: ${err.message}`;
    }
  }

  // Boş kalan yıl, tür ve plak şirketi alanlarını internetten doldurur.
  async function lookupOnline() {
    const form = document.getElementById('form');
    const status = document.getElementById('lookupStatus');
    const btn = document.getElementById('lookupBtn');
    const artist = form.elements.artist.value.trim();
    const album = form.elements.album.value.trim();
    status.hidden = false;
    if (!artist || !album) {
      status.textContent = 'Önce sanatçı ve albüm adını yaz.';
      return;
    }
    btn.disabled = true;
    status.textContent = 'İnternette aranıyor…';
    try {
      const found = await ReleaseLookup.find(artist, album);
      if (!document.body.contains(status)) return; // arama sürerken ekran değişti
      if (!found) {
        status.textContent = 'Bu plak internette bulunamadı; bilgileri elle girebilirsin.';
        return;
      }
      const filled = [];
      [['year', 'yıl'], ['genre', 'tür'], ['label', 'plak şirketi']].forEach(([name, label]) => {
        const input = form.elements[name];
        if (found[name] && !input.value.trim()) {
          input.value = found[name];
          filled.push(label);
        }
      });
      status.textContent = filled.length
        ? `İnternetten dolduruldu: ${filled.join(', ')} (MusicBrainz). Kontrol etmeyi unutma.`
        : 'İnternette yeni bilgi bulunamadı ya da alanlar zaten dolu.';
    } catch (err) {
      console.error(err);
      status.textContent = `İnternetten alınamadı: ${err.message === 'Failed to fetch' ? 'bağlantı yok.' : err.message}`;
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById('lookupBtn').addEventListener('click', lookupOnline);

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const artist = f.get('artist').trim();
    const album = f.get('album').trim();
    const errorEl = document.getElementById('formError');
    if (!artist || !album) {
      errorEl.textContent = 'Sanatçı ve albüm adı zorunlu.';
      errorEl.hidden = false;
      return;
    }
    const record = {
      id: r.id || DB.newId(),
      no: f.get('no').trim(),
      artist,
      album,
      year: f.get('year').trim(),
      genre: f.get('genre').trim(),
      label: f.get('label').trim(),
      notes: f.get('notes').trim(),
      sideA: readTracks('sideA'),
      sideB: readTracks('sideB'),
      frontCover: images.frontCover,
      backCover: images.backCover,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await DB.put(record);
    toast('Kaydedildi');
    location.hash = `#/plak/${record.id}`;
  });
}

// ---------- Menü: yedekleme ----------

const menu = document.getElementById('menu');
function closeMenu() { menu.hidden = true; }
document.getElementById('menuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('click', (e) => {
  if (!menu.contains(e.target)) closeMenu();
});

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

menu.querySelector('[data-action=reader]').addEventListener('click', () => {
  closeMenu();
  const current = CoverReader.hasKey() ? ' Şu an bir anahtar kayıtlı; silmek için boş bırak.' : '';
  const key = prompt(
    'Kapak fotoğrafından bilgileri okumak için Anthropic API anahtarını yapıştır '
    + '(console.anthropic.com → API Keys). Anahtar yalnızca bu cihazda saklanır.' + current,
    '',
  );
  if (key === null) return;
  CoverReader.setKey(key.trim());
  toast(key.trim() ? 'Kapak okuma açıldı' : 'Kapak okuma kapatıldı');
});

menu.querySelector('[data-action=export]').addEventListener('click', async () => {
  closeMenu();
  const records = await DB.all();
  const out = [];
  for (const r of records) {
    out.push({
      ...r,
      frontCover: r.frontCover ? await blobToDataUrl(r.frontCover) : null,
      backCover: r.backCover ? await blobToDataUrl(r.backCover) : null,
    });
  }
  const json = JSON.stringify({ app: 'plaklarim', version: 1, exportedAt: new Date().toISOString(), records: out });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `plaklarim-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${records.length} plak yedeklendi`);
});

document.getElementById('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  closeMenu();
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'plaklarim' || !Array.isArray(data.records)) throw new Error('Bu bir Plaklarım yedeği değil.');
    if (!confirm(`${data.records.length} plak geri yüklensin mi? Aynı plaklar yedekteki haliyle güncellenir.`)) return;
    for (const r of data.records) {
      if (!r.id || !r.artist || !r.album) continue;
      await DB.put({
        ...r,
        frontCover: r.frontCover ? await dataUrlToBlob(r.frontCover) : null,
        backCover: r.backCover ? await dataUrlToBlob(r.backCover) : null,
      });
    }
    toast('Yedek geri yüklendi');
    route();
  } catch (err) {
    console.error(err);
    toast(`Geri yüklenemedi: ${err.message}`);
  }
});

// ---------- Başlat ----------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
// Tarayıcıdan verilerin kalıcı saklanmasını iste (otomatik temizlenmesin).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

route();
