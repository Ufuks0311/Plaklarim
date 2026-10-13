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

// Bir albüm bir ya da daha fazla plaktan oluşur: discs = [{ sides: [şarkılar, şarkılar] }].
// Yüz harfleri plaklar boyunca devam eder: 1. plak A-B, 2. plak C-D, 3. plak E-F…
// Şarkılar { no, title, artist } nesneleridir. Eski sürümlerdeki sideA/sideB
// alanları, düz metin ya da numarasız şarkılar okunurken bu yapıya çevrilir.
const MAX_DISCS = 12;
const sideLetter = (disc, side) => String.fromCharCode(65 + disc * 2 + side);
const autoTrackNo = (letter, i) => `${letter}${i + 1}`;
// "A ve B", "A, B, C ve D"
const joinTr = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ve ${list.at(-1)}` : list.join(''));

function normalizeTracks(list, letter) {
  return (Array.isArray(list) ? list : []).map((t, i) => (typeof t === 'string'
    ? { no: autoTrackNo(letter, i), title: t, artist: '' }
    : { no: t.no || autoTrackNo(letter, i), title: t.title || '', artist: t.artist || '' }));
}

function discsOf(record) {
  const discs = Array.isArray(record.discs) && record.discs.length
    ? record.discs
    : [{ sides: [record.sideA, record.sideB] }];
  return discs.slice(0, MAX_DISCS).map((d, di) => ({
    sides: [0, 1].map((si) => normalizeTracks(d?.sides?.[si], sideLetter(di, si))),
  }));
}

const allTracks = (record) => discsOf(record).flatMap((d) => d.sides.flat());

// Sanatçı, albüm, tür, plak şirketi ve şarkı adları/söyleyenleri "Her Kelimenin
// İlk Harfi Büyük" biçiminde saklanır: yabancı plaklarda İngilizce, yerli
// plaklarda Türkçe kurallarla (bkz. buyuk-harf.js). Notlar olduğu gibi kalır.
// Plağın dili şarkıcıya göre belirlenir; plağın bütün adları, tür ve plak şirketi
// de, o dilin kuralıyla yazılır. Şarkıyı söyleyenin adı ayrıca yazılmışsa (karma
// plaklar) şarkı onun diliyle yazılır. Belirsiz i/ı harfleri için plağın diğer
// adlarına bakılır. Eski sideA/sideB alanları da discs yapısına çevrilir.
const casingContext = (artist, album, tracks) =>
  TextCase.context(artist, album, tracks.flatMap((t) => [t.title, t.artist]));

// Yazım kuralları değişince sürüm artar; eski sürümle düzeltilmiş plaklar
// adların ilk hallerinden (namesBeforeCasing) yeniden düzeltilir.
const CASING_VERSION = 2;

// İlk sürümün (casingVersion alanı yok) kurallarıyla (buyuk-harf-v1.js) adların ilk
// hallerinden çıkan yazım. Kayıttaki ad bununla aynıysa sonradan değiştirilmemiştir.
function casingV1(before) {
  const tracks = discsOf(before).flatMap((d) => d.sides.flat());
  const ctx = TextCaseV1.evidence([before.artist, before.album, ...tracks.flatMap((t) => [t.title, t.artist])]);
  const tc = (text) => TextCaseV1.title(text, ctx);
  return {
    artist: tc(before.artist),
    album: tc(before.album),
    genre: TextCaseV1.title(before.genre),
    label: TextCaseV1.title(before.label, TextCaseV1.FOREIGN_NAME),
    tracks: tracks.map((t) => ({ before: t, title: tc(t.title), artist: tc(t.artist) })),
  };
}

// İlk sürümle düzeltilmiş plakta, o sürümün yazdığı gibi duran (elle
// değiştirilmemiş) adların ilk halleri; eski kuralın yanlış seçtiği ı/i (Kadin)
// böylece yeniden hesaplanır. Elle değiştirilmiş adlar ve yeni şarkılar olduğu gibi
// kalır. Şarkılar yerleri değişmiş olsa da adlarından bulunur.
function casingSource(record) {
  const before = record.namesBeforeCasing;
  if (!before || typeof before !== 'object' || (record.casingVersion || 0) >= CASING_VERSION) return record;
  if (typeof TextCaseV1 === 'undefined') return record;
  const v1 = casingV1(before);
  const pick = (key) => (key in before && record[key] === v1[key] ? before[key] : record[key]);
  const pool = [...v1.tracks];
  return {
    ...record,
    artist: pick('artist'),
    album: pick('album'),
    genre: pick('genre'),
    label: pick('label'),
    discs: discsOf(record).map((d) => ({
      sides: d.sides.map((side) => side.map((t) => {
        const i = t.title ? pool.findIndex((p) => p.title === t.title) : -1;
        if (i < 0) return t;
        const [p] = pool.splice(i, 1);
        return { ...t, title: p.before.title, artist: t.artist === p.artist ? p.before.artist : t.artist };
      })),
    })),
  };
}

function normalizeRecord(input) {
  const record = casingSource(input);
  const discs = discsOf(record);
  const context = casingContext(record.artist, record.album, discs.flatMap((d) => d.sides.flat()));
  const tc = (text) => TextCase.title(text, context);
  const { sideA, sideB, ...rest } = record;
  return {
    ...rest,
    artist: tc(record.artist),
    album: tc(record.album),
    genre: tc(record.genre),
    label: tc(record.label),
    discs: discs.map((d) => ({
      sides: d.sides.map((side) => side.map((t) => {
        const song = TextCase.forSinger(context, t.artist, t.title);
        return { ...t, title: TextCase.title(t.title, song), artist: TextCase.title(t.artist, song) };
      })),
    })),
    casingVersion: CASING_VERSION,
  };
}

// Kaydedilecek plak: adları düzeltilir; değişen adların ilk halleri bir kereye
// mahsus namesBeforeCasing alanında saklanır (yedeğe de girer).
const nameText = (r) => JSON.stringify([r.artist, r.album, r.genre, r.label, discsOf(r)]);
function normalizeForStorage(record) {
  const fixed = normalizeRecord(record);
  if (!record.namesBeforeCasing && nameText(fixed) !== nameText(record)) {
    fixed.namesBeforeCasing = Object.fromEntries(['artist', 'album', 'genre', 'label', 'sideA', 'sideB', 'discs']
      .filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  }
  return fixed;
}

// Daha önce kaydedilmiş plakları bu biçime getirir; bu sürümle düzeltilmiş ya da
// değişmeyen plaklara dokunmaz.
async function normalizeStoredRecords() {
  try {
    for (const record of await DB.all()) {
      if ((record.casingVersion || 0) >= CASING_VERSION) continue;
      const fixed = normalizeForStorage(record);
      if (JSON.stringify(fixed) !== JSON.stringify(record)) await DB.put(fixed);
    }
  } catch (err) {
    console.error(err);
  }
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
          ...allTracks(r).flatMap((t) => [t.title, t.artist])]
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
          <span>${esc(r.artist)}${r.year ? ` · ${esc(r.year)}` : ''}${discsOf(r).length > 1 ? ` · ${discsOf(r).length} plak` : ''}</span>
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

  const discs = discsOf(r);
  const meta = [['Yıl', r.year], ['Plak şirketi', r.label], ['Tür', r.genre],
    ['Plak sayısı', discs.length > 1 ? String(discs.length) : '']]
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
      ${discs.map((d, di) => {
        const sides = d.sides.map((tracks, si) => trackList(`${sideLetter(di, si)} yüzü`, tracks, r.artist)).join('');
        if (discs.length === 1) return sides ? `<div class="sides">${sides}</div>` : '';
        return `<section class="disc">
          <h2>${di + 1}. plak</h2>
          ${sides ? `<div class="sides">${sides}</div>` : '<p class="hint">Şarkı girilmemiş.</p>'}
        </section>`;
      }).join('')}
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

// Görsel kutusuna dokununca kamera açılır.
const EMPTY_COVER = 'Fotoğraf çekmek için dokun';

function coverPicker(key, label, blob) {
  return `
    <div class="cover-picker" data-key="${key}">
      <span class="label">${label}</span>
      <label class="preview" for="${key}-camera" aria-label="${label}: fotoğraf çek">${blob ? `<img src="${blobUrl(blob)}" alt="">` : `<span>${EMPTY_COVER}</span>`}</label>
      <input type="file" id="${key}-camera" accept="image/*" capture="environment" hidden>
      <div class="picker-buttons">
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
function trackRow(t = { no: '', title: '', artist: '' }, letter, i) {
  const auto = autoTrackNo(letter, i);
  return `
    <li class="track-row">
      <button type="button" class="drag-handle" tabindex="-1" aria-label="Sürükleyerek taşı">⠿</button>
      <input class="t-no" placeholder="${auto}" value="${t.no === auto ? '' : esc(t.no)}" autocomplete="off" aria-label="Sıra no">
      <input class="t-title" placeholder="Şarkı adı" value="${esc(t.title)}" autocomplete="off" aria-label="Şarkı adı">
      <input class="t-artist" placeholder="Söyleyen" value="${esc(t.artist)}" autocomplete="off" aria-label="Söyleyen">
      <button type="button" class="icon-btn remove-track" aria-label="Şarkıyı sil">×</button>
    </li>`;
}

function trackEditor(letter, tracks) {
  return `
    <fieldset class="tracks" data-side="${letter}">
      <legend>${letter} yüzü</legend>
      <ol class="track-rows">${(tracks.length ? tracks : [undefined]).map((t, i) => trackRow(t, letter, i)).join('')}</ol>
      <button type="button" class="btn small add-track">+ Şarkı ekle</button>
    </fieldset>`;
}

function discEditor(disc, di) {
  return `
    <div class="disc-edit" data-disc="${di}">
      <h2 class="disc-title">${di + 1}. plak</h2>
      ${disc.sides.map((tracks, si) => trackEditor(sideLetter(di, si), tracks)).join('')}
    </div>`;
}

// raw: adların yazıldığı (ya da okunduğu) hali, düzeltilmeden önce.
function readTracks(fs, raw = false) {
  const letter = fs.dataset.side;
  const text = (input) => (raw ? input.dataset.raw ?? input.value : input.value).trim();
  return [...fs.querySelectorAll('.track-row')]
    .map((row) => ({
      no: row.querySelector('.t-no').value.trim(),
      title: text(row.querySelector('.t-title')),
      artist: text(row.querySelector('.t-artist')),
    }))
    .filter((t) => t.title)
    .map((t, i) => ({ ...t, no: t.no || autoTrackNo(letter, i) }));
}

function readDiscs(raw = false) {
  return [...view.querySelectorAll('.disc-edit')].map((el) => ({
    sides: [...el.querySelectorAll('.tracks')].map((fs) => readTracks(fs, raw)),
  }));
}

const isEmptyRow = (row) => [...row.querySelectorAll('input')].every((input) => !input.value.trim());
const SIMPLE_NO = /^([A-Z]\s*)?\d+$/i; // 6, A6

// Yüzlerdeki numaraların en küçüğü (6, A6 → 6); düz numara yoksa null.
const numberOf = (no) => parseInt(no.replace(/^[A-Z]\s*/i, ''), 10);
const sideNumbers = (fs) => [...fs.querySelectorAll('.t-no')].map((input) => input.value.trim()).filter(Boolean);
function firstNumbers(container) {
  return new Map([...container.querySelectorAll('.tracks')].map((fs) => {
    const nos = sideNumbers(fs).filter((no) => SIMPLE_NO.test(no));
    return [fs, nos.length ? Math.min(...nos.map(numberOf)) : null];
  }));
}

// Sürüklemeden sonra numaralar. Hepsi düzse (1, 2… ya da A1, A2…) yeni sıraya
// göre yeniden verilir, harfli numaralar bulundukları yüzün harfini alır.
// Sürüklemeden önce 1'den başlayan yüz yine 1'den başlar, önceki yüzden devam
// eden yüz (A: 1–5, B: 6–10) yine devam eder; ilk kez numara alan yüz plaktaki
// diğer yüzlere uyar. "A1a", "2-3" gibi özel numaralar varsa hiçbirine
// dokunulmaz; numarası boş yüzler boş kalır.
// before: sürüklemeden önceki firstNumbers().
function renumberTracks(container, before) {
  const sides = [...container.querySelectorAll('.tracks')];
  const all = sides.flatMap(sideNumbers);
  if (all.every((no) => SIMPLE_NO.test(no))) {
    const lettered = (nos) => nos.some((no) => /^[A-Z]/i.test(no));
    // İlk yüzden sonra 1'den büyük başlayan bir yüz varsa numaralar yüzden yüze sürüyordur.
    const continuous = [...before.values()].filter((first) => first != null).slice(1).some((first) => first > 1);
    let next = null;
    sides.forEach((fs) => {
      const nos = sideNumbers(fs);
      if (!nos.length) return;
      const first = before.get(fs);
      const prefix = lettered(nos) || (first == null && lettered(all)) ? fs.dataset.side : '';
      const continues = next != null && (first == null ? continuous : first > 1);
      let n = continues ? next : 1;
      [...fs.querySelectorAll('.track-row')].filter((row) => !isEmptyRow(row)).forEach((row) => {
        row.querySelector('.t-no').value = `${prefix}${n++}`;
      });
      next = n;
    });
  }
  sides.forEach(renumberPlaceholders);
}

function renumberPlaceholders(fs) {
  fs.querySelectorAll('.t-no').forEach((input, i) => {
    input.placeholder = autoTrackNo(fs.dataset.side, i);
  });
}

// Kapaktan okunan yüzleri sıraya koyar: sonuç[0] A yüzü, sonuç[1] B yüzü…
// Harfler geçerli ve tekrarsızsa harfe göre, değilse okunduğu sıraya göre.
function sidesFromCover(list) {
  const sides = (Array.isArray(list) ? list : []).map((s) => ({
    letter: String(s?.letter || '').trim().toUpperCase(),
    tracks: (s?.tracks || [])
      .filter((t) => t?.title && t.title.trim())
      .map((t) => ({ no: (t.no || '').trim(), title: t.title.trim(), artist: (t.artist || '').trim() })),
  }));
  const max = MAX_DISCS * 2;
  const letters = sides.map((s) => (/^[A-Z]$/.test(s.letter) ? s.letter.charCodeAt(0) - 65 : -1));
  const byLetter = letters.every((i) => i >= 0 && i < max) && new Set(letters).size === letters.length;
  const out = [];
  sides.forEach((s, k) => {
    const idx = byLetter ? letters[k] : k;
    if (idx < max) out[idx] = s.tracks;
  });
  return Array.from(out, (t) => t || []);
}

async function renderForm(id) {
  const existing = id ? await DB.get(id) : null;
  if (id && !existing) {
    view.innerHTML = '<p class="empty">Plak bulunamadı. <a href="#/">Listeye dön</a></p>';
    return;
  }
  const r = existing || { no: nextRecordNo(await DB.all()) };
  const discs = discsOf(r);
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


      <label class="disc-count">Plak sayısı
        <select name="discCount">${Array.from({ length: MAX_DISCS }, (_, i) => `<option value="${i + 1}"${i + 1 === discs.length ? ' selected' : ''}>${i + 1}</option>`).join('')}</select>
      </label>
      <p class="hint">Albüm birden fazla plaktan oluşuyorsa plak sayısını seç; her plağın yüzleri (A-B, C-D…) ayrı listelenir.
        Karma plaklarda her şarkının söyleyenini ayrıca yaz; boş bırakılırsa albüm sanatçısı sayılır.
        Şarkıları soldaki ⠿ tutamağından sürükleyerek sıralayabilir ya da başka yüze taşıyabilirsin.</p>
      <div id="discs" class="${discs.length > 1 ? 'multi' : ''}">${discs.map(discEditor).join('')}</div>
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

    const cameraInput = picker.querySelector(`#${key}-camera`);

    // Görselin köşeleri bulunup kareye oturtulur; vazgeçilirse önceki görsel kalır.
    // "Tekrar çek"e basılırsa 'retake' döner.
    async function useImage(file, onRetake) {
      let cropped;
      try {
        cropped = await CoverCropper.open(file, MAX_IMAGE_SIDE, { onRetake });
      } catch (err) {
        console.error(err);
        preview.innerHTML = '<span>Görsel okunamadı</span>';
        return null;
      }
      if (!cropped || cropped === CoverCropper.RETAKE) return cropped;
      if (!picker.isConnected) return null; // bu arada başka ekrana geçildi
      images[key] = cropped;
      preview.innerHTML = `<img src="${blobUrl(images[key])}" alt="">`;
      removeBtn.hidden = false;
      readCover(key === 'frontCover' ? 'front' : 'back', images[key], status);
      return cropped;
    }

    // Kutuya dokununca uygulamanın kendi kamerası açılır; çekilen kare onay
    // sorulmadan köşe ekranına gelir. Desteklenmeyen tarayıcıda ya da kamera
    // izni yoksa telefonun kamerası açılır (etiket bağlı olduğu girişi açar).
    let shooting = false;
    preview.addEventListener('click', async (e) => {
      if (!Camera.supported()) return;
      e.preventDefault();
      if (shooting) return;
      shooting = true;
      const camera = Camera.open();
      try {
        for (;;) {
          const shot = await camera.shoot();
          if (!shot || !picker.isConnected) break;
          if (!(shot instanceof HTMLCanvasElement)) {
            // Kamera açılamadı, telefonun kamerasıyla çekildi; tekrar çekmek de onunla.
            camera.close();
            await useImage(shot, () => cameraInput.click());
            break;
          }
          if (await useImage(shot, () => {}) !== CoverCropper.RETAKE) break;
        }
      } finally {
        camera.close();
        shooting = false;
      }
    });

    cameraInput.addEventListener('change', () => {
      const file = cameraInput.files[0];
      cameraInput.value = '';
      if (file) useImage(file, () => cameraInput.click());
    });
    picker.querySelector('.picker-buttons input[type=file]').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) useImage(file);
    });

    removeBtn.addEventListener('click', () => {
      images[key] = null;
      preview.innerHTML = `<span>${EMPTY_COVER}</span>`;
      removeBtn.hidden = true;
    });
  });

  const discsEl = document.getElementById('discs');
  const discCount = document.getElementById('form').elements.discCount;

  function wireTrackEditor(fs) {
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
  }
  discsEl.querySelectorAll('.tracks').forEach(wireTrackEditor);

  // Plak sayısını değiştirir; silinecek plaklarda şarkı varsa önce sorar.
  function setDiscCount(count) {
    const current = discsEl.querySelectorAll('.disc-edit');
    if (count < current.length) {
      const dropped = [...current].slice(count);
      const filled = dropped.filter((el) => [...el.querySelectorAll('.tracks')].some((fs) => readTracks(fs).length));
      if (filled.length && !confirm(`${filled.map((el) => `${Number(el.dataset.disc) + 1}. plak`).join(', ')} şarkılarıyla birlikte silinsin mi?`)) {
        discCount.value = String(current.length);
        return false;
      }
      dropped.forEach((el) => el.remove());
    }
    for (let di = current.length; di < count; di++) {
      discsEl.insertAdjacentHTML('beforeend', discEditor({ sides: [[], []] }, di));
      discsEl.lastElementChild.querySelectorAll('.tracks').forEach(wireTrackEditor);
    }
    discsEl.classList.toggle('multi', count > 1);
    discCount.value = String(count);
    return true;
  }
  discCount.addEventListener('change', () => setDiscCount(Number(discCount.value)));

  // Şarkılar soldaki tutamaktan (⠿) sürüklenerek sıralanır ya da başka yüze
  // taşınır (ör. kapakta hepsi A yüzüne okunduysa bir kısmı B yüzüne).
  // Satır parmağı izleyerek yer değiştirir; ekranın kenarına gelince sayfa kayar.
  discsEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || e.button > 0) return;
    e.preventDefault();
    document.activeElement?.blur();
    const row = handle.closest('.track-row');
    const from = row.closest('.tracks');
    const numbersBefore = firstNumbers(discsEl);
    const pointerId = e.pointerId;
    const startY = e.clientY;
    let y = startY;
    let moved = false; // parmak kıpırdamadan basılı tutmak satırı yerinden oynatmaz
    let changed = false;
    let frame = 0;
    row.classList.add('dragging');
    // Satır yer değiştirince tarayıcı yakalamayı bırakır; olaylar pencereden dinlenir
    // ve yakalama her taşımadan sonra yenilenir.
    const capture = () => { try { handle.setPointerCapture(pointerId); } catch { /* parmak kalkmış */ } };
    capture();

    function place() {
      const sides = [...discsEl.querySelectorAll('.tracks')];
      const boxes = sides.map((fs) => fs.getBoundingClientRect());
      const dist = (b) => (y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0);
      const fs = sides[boxes.reduce((best, b, i) => (dist(b) < dist(boxes[best]) ? i : best), 0)];
      const list = fs.querySelector('.track-rows');
      const before = [...list.children].find((other) => {
        if (other === row) return false;
        const b = other.getBoundingClientRect();
        return y < b.top + b.height / 2;
      }) || null;
      if (row.parentElement !== list || row.nextElementSibling !== before) {
        list.insertBefore(row, before);
        changed = true;
        capture();
      }
    }
    function tick() {
      if (!row.isConnected) { stop(); return; } // sürüklerken liste değişti ya da ekran kapandı
      if (moved) {
        const edge = 72;
        if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 6));
        else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - window.innerHeight + edge) / 6));
        place();
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      y = ev.clientY;
      if (Math.abs(y - startY) > 8) moved = true;
    };
    function stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      row.classList.remove('dragging');
    }
    function end(ev) {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (!changed || !row.isConnected || !from.isConnected) return;
      const to = row.closest('.tracks');
      if (to !== from) {
        to.querySelectorAll('.track-row').forEach((other) => { if (other !== row && isEmptyRow(other)) other.remove(); });
        if (!from.querySelector('.track-row')) {
          from.querySelector('.track-rows').insertAdjacentHTML('beforeend', trackRow(undefined, from.dataset.side, 0));
        }
      }
      renumberTracks(discsEl, numbersBefore);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
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
      if (!status.isConnected) return; // okuma sürerken başka ekrana geçildi
      const form = status.closest('form');
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
      // Okunan şarkılar, kapsadıkları plakların iki yüzündeki listenin yerine geçer
      // (yalnızca okunan yüzü değiştirmek, elle öbür yüze taşınmış şarkıları iki kez
      // yazardı). Diğer plaklara dokunulmaz. Değişecek yüzlerde şarkı varsa bir kez sorulur.
      const sides = sidesFromCover(info.sides);
      const trackCount = sides.reduce((n, tracks) => n + tracks.length, 0);
      const discs = [...new Set(sides.flatMap((tracks, i) => (tracks.length ? [Math.floor(i / 2)] : [])))];
      const letters = discs.flatMap((di) => [sideLetter(di, 0), sideLetter(di, 1)]);
      const covered = () => [...view.querySelectorAll('.tracks')].filter((fs) => letters.includes(fs.dataset.side));
      const kept = Boolean(trackCount) && covered().some((fs) => readTracks(fs).length)
        && !confirm(`Kapaktan ${trackCount} şarkı okundu. ${joinTr(letters)} yüzlerindeki şarkılar bununla değiştirilsin mi?`);
      if (trackCount && !kept) {
        const neededDiscs = Math.max(...discs) + 1;
        const before = discsEl.querySelectorAll('.disc-edit').length;
        if (neededDiscs > before && setDiscCount(neededDiscs)) filled.push(`${neededDiscs} plak`);
        covered().forEach((fs) => {
          const letter = fs.dataset.side;
          const tracks = sides[letter.charCodeAt(0) - 65] || [];
          fs.querySelector('.track-rows').innerHTML = tracks.length
            ? tracks.map((t, i) => trackRow({ no: t.no || autoTrackNo(letter, i), title: t.title, artist: t.artist }, letter, i)).join('')
            : trackRow(undefined, letter, 0);
        });
        filled.push(`${trackCount} şarkı`);
      }
      normalizeFormText();
      const keptNote = kept ? ' Şarkı listesi değiştirilmedi.' : '';
      status.textContent = filled.length
        ? `Kapaktan dolduruldu: ${filled.join(', ')}.${keptNote} Kontrol etmeyi unutma.`
        : kept ? 'Şarkı listesi değiştirilmedi.' : 'Kapakta yeni bilgi bulunamadı.';
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
      if (!status.isConnected) return; // arama sürerken ekran değişti
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
      normalizeFormText();
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

  // Ad alanları, alandan çıkınca ve kapaktan/internetten doldurulunca
  // "Her Kelimenin İlk Harfi Büyük" biçimine getirilir. Her alanın yazıldığı
  // (ya da okunduğu) hali saklanır ve bütün alanlar her seferinde bu hallerden,
  // kayıttakiyle aynı kuralla yeniden hesaplanır; sonuç alanların dolma sırasına
  // bağlı olmaz. Üzerinde yazılan alana, imleç kaymasın diye, ayrılınca dokunulur.
  const TEXT_FIELDS = '[name=artist], [name=album], [name=genre], [name=label], .t-title, .t-artist';
  function rawText(el) {
    if (el.value !== el.dataset.cased) el.dataset.raw = el.value;
    return el.dataset.raw;
  }
  function normalizeFormText(skip = document.activeElement) {
    const form = document.getElementById('form');
    const field = (name) => rawText(form.elements[name]);
    // Kaydedilirken adı boş satırlar atılır; plağın dili de onlarsız hesaplanır.
    const tracks = [...view.querySelectorAll('.track-row')].map((row) => ({
      title: rawText(row.querySelector('.t-title')),
      artist: rawText(row.querySelector('.t-artist')),
    })).filter((t) => t.title.trim());
    const context = casingContext(field('artist'), field('album'), tracks);
    view.querySelectorAll(TEXT_FIELDS).forEach((el) => {
      const raw = rawText(el);
      const row = el.closest('.track-row');
      const song = row && TextCase.forSinger(context, rawText(row.querySelector('.t-artist')), rawText(row.querySelector('.t-title')));
      const cased = TextCase.title(raw, song || context);
      if (el === skip) return;
      el.dataset.cased = cased;
      if (el.value !== cased) el.value = cased;
    });
  }
  // Alandan çıkılınca: yazılan ya da yazarken kapaktan/internetten dolan alan da
  // düzeltilir; odağın geçtiği alana dokunulmaz.
  document.getElementById('form').addEventListener('focusout', (e) => {
    if (!e.target.matches(TEXT_FIELDS)) return;
    const next = e.relatedTarget;
    normalizeFormText(next && next.matches(TEXT_FIELDS) ? next : null);
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    normalizeFormText(null);
    const f = new FormData(e.target);
    const artist = f.get('artist').trim();
    const album = f.get('album').trim();
    const errorEl = document.getElementById('formError');
    if (!artist || !album) {
      errorEl.textContent = 'Sanatçı ve albüm adı zorunlu.';
      errorEl.hidden = false;
      return;
    }
    // Adların yazıldığı (ya da kapaktan okunduğu) hali; ilk hali saklanmamış plakta
    // saklanır ki kurallar değişince bu halinden yeniden düzeltilebilsin.
    const raw = (name) => (e.target.elements[name].dataset.raw ?? f.get(name)).trim();
    const typed = { artist: raw('artist'), album: raw('album'), genre: raw('genre'), label: raw('label'), discs: readDiscs(true) };
    const record = normalizeRecord({
      id: r.id || DB.newId(),
      no: f.get('no').trim(),
      artist,
      album,
      year: f.get('year').trim(),
      genre: f.get('genre').trim(),
      label: f.get('label').trim(),
      notes: f.get('notes').trim(),
      discs: readDiscs(),
      frontCover: images.frontCover,
      backCover: images.backCover,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...(r.namesBeforeCasing && { namesBeforeCasing: r.namesBeforeCasing }),
      casingVersion: CASING_VERSION, // formda yazılan adlar zaten bu sürümle düzeltildi
    });
    if (!record.namesBeforeCasing && nameText(typed) !== nameText(record)) record.namesBeforeCasing = typed;
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
    await storedRecordsNormalized;
    if (!confirm(`${data.records.length} plak geri yüklensin mi? Aynı plaklar yedekteki haliyle güncellenir.`)) return;
    for (const r of data.records) {
      if (!r.id || !r.artist || !r.album) continue;
      await DB.put(normalizeForStorage({
        ...r,
        frontCover: r.frontCover ? await dataUrlToBlob(r.frontCover) : null,
        backCover: r.backCover ? await dataUrlToBlob(r.backCover) : null,
      }));
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

// Açılıştaki düzeltme bitmeden yedekten geri yükleme başlamaz (yazdıkları karışmasın).
const storedRecordsNormalized = normalizeStoredRecords();
storedRecordsNormalized.finally(route);
