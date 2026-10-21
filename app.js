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

// Bir dokunuş (ya da fare tıklaması) sürüyor mu: parmak basıldı, tıklaması henüz
// gelmedi. after(fn) fn'i dokunuşun tıklaması işlendikten sonra çağırır; tıklama
// gelmezse (iPhone boş yere dokununca tıklama göndermez) biraz sonra.
const Tap = (() => {
  let downAt = 0;
  let waiting = [];
  let timer = 0;
  const flush = () => {
    downAt = 0;
    clearTimeout(timer);
    const run = waiting;
    waiting = [];
    run.forEach((fn) => setTimeout(fn));
  };
  document.addEventListener('pointerdown', () => { downAt = performance.now(); }, true);
  document.addEventListener('click', flush, true);
  document.addEventListener('pointercancel', flush, true);
  return {
    active: () => downAt > 0 && performance.now() - downAt < 2000,
    after(fn) {
      waiting.push(fn);
      clearTimeout(timer);
      timer = setTimeout(flush, 600);
    },
  };
})();

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
  // İlk sürümle düzeltilmiş plak, o sürümün kuralları (buyuk-harf-v1.js) yüklenemediyse
  // olduğu gibi kalır; bir sonraki açılışta yeniden denenir.
  if (record.namesBeforeCasing && (record.casingVersion || 0) < CASING_VERSION && typeof TextCaseV1 === 'undefined') {
    return record;
  }
  const fixed = normalizeRecord(record);
  if (!record.namesBeforeCasing && nameText(fixed) !== nameText(record)) {
    fixed.namesBeforeCasing = Object.fromEntries(['artist', 'album', 'genre', 'label', 'sideA', 'sideB', 'discs']
      .filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  }
  return fixed;
}

// Daha önce kaydedilmiş plakları bu biçime getirir; bu sürümle düzeltilmiş ya da
// değişmeyen plaklara dokunmaz. İzlenen listeye (başkasının plakları) dokunulmaz.
async function normalizeStoredRecords() {
  if (Cloud.viewer()) return;
  try {
    for (const record of await DB.all()) {
      if ((record.casingVersion || 0) >= CASING_VERSION) continue;
      const fixed = normalizeForStorage(record);
      // Kaydedilemeyen (kapağı açılamayan) plak bir sonraki açılışta yeniden denenir.
      if (JSON.stringify(fixed) !== JSON.stringify(record)) await DB.put(fixed).catch(console.error);
    }
  } catch (err) {
    console.error(err);
  }
}

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
// Liste sanatçı adına göre Türkçe abece sırasıyla dizilir (C'den sonra Ç, büyük/küçük
// harf farkı yok); aynı sanatçının plakları albüm adına göre. Eskiden elle yazılan sıra
// numarası kayıtta durur; yalnızca adları aynı plakların sırasını belirler.
const byRecordOrder = (a, b) =>
  collator.compare(a.artist || '', b.artist || '') || collator.compare(a.album || '', b.album || '') ||
  (!a.no - !b.no) || collator.compare(a.no || '', b.no || '');

// Sıra numarası plağın listedeki yeridir: ilk plak 1, sonraki 2… Yeni plak eklenince
// ondan sonra gelenlerin numarası birer artar, numaralar hep listeyle aynı sırada kalır.
const recordNumbers = (sorted) => new Map(sorted.map((r, i) => [r.id, i + 1]));

// ---------- Yönlendirme ----------

const currentPage = () => location.hash.replace(/^#/, '').split('/')[1] || '';

// Ekran yakınlaştırılmış kaldıysa (iPhone yazı kutusuna dokununca ya da iki parmakla
// büyütülünce) yeniden ekrana sığdırılır: en büyük yakınlaştırma bir an 1'e
// indirilir, sonra yine serbest bırakılır.
const viewportMeta = document.querySelector('meta[name=viewport]');
const viewportContent = viewportMeta?.content || '';
function fitScreen() {
  if (!viewportMeta || !(window.visualViewport?.scale > 1.01)) return;
  viewportMeta.content = `${viewportContent}, maximum-scale=1`;
  setTimeout(() => { viewportMeta.content = viewportContent; }, 300);
}

// keepScroll: internetten gelen değişiklikle yenilenirken sayfa yerinde kalır.
// Ekranlar sırayla çizilir: önceki çizim (ör. eşitleme sonrası yenileme) bitmeden
// başka sayfaya geçilirse, geç biten eski çizim yeni sayfanın üzerine yazmasın.
let routing = Promise.resolve();
function route(options) {
  routing = routing.catch(console.error).then(() => renderRoute(options));
  return routing;
}
async function renderRoute({ keepScroll = false } = {}) {
  const y = window.scrollY;
  if (!keepScroll) fitScreen();
  releaseUrls();
  closeMenu();
  const [, page, id] = location.hash.replace(/^#/, '').split('/');
  const editing = page === 'yeni' || page === 'duzenle';
  try {
    if (page === 'plak' && id) await renderDetail(id);
    else if (editing && Cloud.viewer()) await renderList(); // izleyen değiştiremez
    else if (page === 'yeni') await renderForm();
    else if (page === 'duzenle' && id) await renderForm(id);
    else if (page === 'bulut') renderCloud();
    else await renderList();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<p class="empty">Bir hata oluştu: ${esc(err.message)}</p>`;
  }
  window.scrollTo(0, keepScroll ? y : 0);
  const notice = Cloud.takeNotice();
  if (notice) toast(notice);
}

// Formdan çıkarken (kaydet, vazgeç) ve plak silinince, gidilecek ekran bir önceki
// ekransa geri gidilir; değilse bu ekranın yerine geçilir. Böylece telefonun geri
// tuşu kaydedilmiş formu ya da silinmiş plağı yeniden açmaz.
let previousHash = null;
let currentHash = location.hash;
let replacing = false;
window.addEventListener('hashchange', () => {
  if (!replacing) previousHash = currentHash;
  replacing = false;
  currentHash = location.hash;
  route();
});
const sameHash = (a, b) => (a && a !== '#' ? a : '#/') === (b && b !== '#' ? b : '#/');
function leaveTo(hash) {
  if (sameHash(location.hash, hash)) return;
  if (previousHash !== null && sameHash(previousHash, hash)) {
    previousHash = null; // ikinci dokunuş (çift tıklama) bir adım daha geri gitmesin
    history.back();
  } else {
    replacing = true;
    location.replace(hash);
  }
}

// ---------- Liste ----------

// Arama çubuğu kaydırınca üst çubuğun hemen altında kalır; üst çubuğun yüksekliği
// (eşitleme satırı açılınca) değişebilir.
const topbar = document.querySelector('.topbar');
function setTopbarHeight() {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.getBoundingClientRect().height}px`);
}
if (window.ResizeObserver) new ResizeObserver(setTopbarHeight).observe(topbar, { box: 'border-box' });
else window.addEventListener('resize', setTopbarHeight);
setTopbarHeight();

let lastQuery = '';
let lastGenre = '';
// Plaklarım başlığına basınca tür seçimi "Tüm türler"e döner. Liste zaten açıksa
// adres değişmediği için menü burada sıfırlanır; geri tuşu seçimi korur.
document.querySelector('.brand').addEventListener('click', () => {
  if (!lastGenre) return;
  lastGenre = '';
  const genre = document.getElementById('genre');
  if (genre) {
    genre.value = '';
    genre.dispatchEvent(new Event('change'));
  }
});
// Liste ekranı açıkken internetten gelen değişiklikleri, arama kutusuna dokunmadan
// listeye yansıtır.
let refreshList = null;

// Arama ve tür karşılaştırması büyük/küçük harfe ve Türkçe harflere bakmaz: "iron"
// Iron Maiden'ı, "baris" Barış'ı bulur; "Indie" ile "İndie" aynı türdür.
const fold = (text) => String(text).toLocaleLowerCase('tr').replace(/ı/g, 'i')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Tür alanında virgül, noktalı virgül ya da eğik çizgiyle ayrılmış birden çok tür
// olabilir ("Rock, Pop Rock"); plak her birinin altında listelenir.
const genresOf = (r) => String(r.genre || '').split(/[,;/]/)
  .map((g) => g.trim().replace(/\s+/g, ' ')).filter(Boolean);
const genreValue = (name) => `g:${fold(name)}`;
const NO_GENRE = 'yok';

// Arama metni ve tür anahtarları her plak için bir kez hazırlanır, her tuşta yeniden
// hazırlanmaz. Liste her açılışta plakları veritabanından yeniden okuduğu için
// düzenlenen plağın eski anahtarları kullanılmaz.
const matchKeys = new WeakMap();
function keysOf(r, no) {
  let keys = matchKeys.get(r);
  if (!keys || keys.no !== no) {
    keys = {
      no,
      text: fold([`#${no}`, r.artist, r.album, r.label, r.genre, r.year,
        ...allTracks(r).flatMap((t) => [t.title, t.artist])].join('\n')),
      genres: genresOf(r).map(genreValue),
    };
    matchKeys.set(r, keys);
  }
  return keys;
}

// Menüdeki türler: büyük/küçük harf farkı yok sayılır, aynı tür farklı yazılmışsa
// en çok kullanılan yazılışı gösterilir; her türün yanında plak sayısı durur.
function genreOptions(records) {
  const groups = new Map();
  let none = 0;
  for (const r of records) {
    const names = genresOf(r);
    if (!names.length) none++;
    const seen = new Set();
    for (const name of names) {
      const value = genreValue(name);
      const group = groups.get(value) || { value, count: 0, spellings: new Map() };
      groups.set(value, group);
      group.spellings.set(name, (group.spellings.get(name) || 0) + 1);
      if (!seen.has(value)) { seen.add(value); group.count++; }
    }
  }
  const options = [...groups.values()].map((g) => ({
    value: g.value,
    name: [...g.spellings].reduce((a, b) => (b[1] > a[1] ? b : a))[0],
    count: g.count,
  })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return { options, none };
}

async function renderList() {
  refreshList = null;
  let records = (await DB.all()).sort(byRecordOrder);
  let numbers = recordNumbers(records);
  const viewer = Cloud.viewer();
  const cloud = Cloud.info();
  view.innerHTML = `
    ${viewer ? `<p class="viewing"><a href="#/bulut">${esc(cloud.owner)} kullanıcısının plakları · yalnızca görüntüleme</a></p>` : ''}
    <div class="search">
      <input type="search" id="q" placeholder="Sanatçı, albüm veya şarkı ara" value="${esc(lastQuery)}" autocomplete="off">
    </div>
    <div class="list-bar">
      <p class="count" id="count"></p>
      <select id="genre" class="genre-select" aria-label="Türe göre seç" hidden></select>
    </div>
    <ul class="grid" id="grid"></ul>
    ${viewer ? '' : '<a href="#/yeni" class="fab" aria-label="Yeni plak ekle">+</a>'}
  `;

  const grid = document.getElementById('grid');
  const count = document.getElementById('count');
  const q = document.getElementById('q');
  const genre = document.getElementById('genre');

  if (!records.length) {
    // Boş ekranda tür menüsünün satırı kalkar; boş sayı satırı eskisi gibi tek boşluk bırakır.
    count.parentElement.replaceWith(count);
    grid.outerHTML = viewer
      ? `<div class="empty"><p>${esc({ ok: 'Listede henüz plak yok.', error: Cloud.status().text }[Cloud.status().state] || 'Plaklar yükleniyor…')}</p></div>`
      : `<div class="empty">
      <p>Henüz plak eklemedin.</p>
      <p><a href="#/yeni" class="btn primary">İlk plağı ekle</a></p>
    </div>`;
    q.disabled = true;
    return;
  }

  let thumbs = new Map(records.map((r) => [r.id, r.frontCover ? blobUrl(r.frontCover) : '']));

  // Seçili tür artık hiçbir plakta yoksa (plak silindi ya da türü değişti) bütün türlere dönülür.
  function fillGenres() {
    const { options, none } = genreOptions(records);
    if (!options.length || (lastGenre === NO_GENRE ? !none : !options.some((o) => o.value === lastGenre))) {
      lastGenre = '';
    }
    genre.hidden = !options.length;
    genre.innerHTML = '<option value="">Tüm türler</option>'
      + options.map((o) => `<option value="${esc(o.value)}">${esc(o.name)} (${o.count})</option>`).join('')
      + (none ? `<option value="${NO_GENRE}">Türü yazılmamış (${none})</option>` : '');
    genre.value = lastGenre;
  }

  function draw() {
    const term = fold(q.value.trim());
    lastQuery = q.value;
    const shown = !term && !lastGenre ? records : records.filter((r) => {
      const keys = keysOf(r, numbers.get(r.id));
      return (!lastGenre || (lastGenre === NO_GENRE ? !keys.genres.length : keys.genres.includes(lastGenre)))
        && (!term || keys.text.includes(term));
    });
    count.textContent = term || lastGenre
      ? `${shown.length} / ${records.length} plak`
      : `${records.length} plak`;
    genre.classList.toggle('active', !!lastGenre);
    grid.innerHTML = shown.map((r) => `
      <li>
        <a href="#/plak/${esc(r.id)}" class="card">
          ${thumbs.get(r.id)
            ? `<img src="${thumbs.get(r.id)}" alt="" loading="lazy">`
            : '<div class="no-cover" aria-hidden="true"></div>'}
          <span class="badge">#${numbers.get(r.id)}</span>
          <strong>${esc(r.album)}</strong>
          <span>${esc(r.artist)}${r.year ? ` · ${esc(r.year)}` : ''}${discsOf(r).length > 1 ? ` · ${discsOf(r).length} plak` : ''}</span>
        </a>
      </li>`).join('') || '<li class="empty">Sonuç yok.</li>';
  }

  // Aşağıdayken aranırsa sonuçlar baştan gösterilir (ilkleri arama çubuğunun altında kalmasın).
  q.addEventListener('input', () => {
    draw();
    if (window.scrollY > 0) window.scrollTo(0, 0);
  });
  genre.addEventListener('change', () => {
    lastGenre = genre.value;
    draw();
    if (window.scrollY > 0) window.scrollTo(0, 0);
  });
  fillGenres();
  draw();

  refreshList = async () => {
    const fresh = (await DB.all()).sort(byRecordOrder);
    if (!grid.isConnected) return;
    if (!fresh.length) { route({ keepScroll: true }); return; }
    const old = thumbs;
    records = fresh;
    numbers = recordNumbers(records);
    thumbs = new Map(records.map((r) => [r.id, r.frontCover ? blobUrl(r.frontCover) : '']));
    fillGenres();
    draw();
    old.forEach((url) => url && URL.revokeObjectURL(url));
  };
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
  const all = (await DB.all()).sort(byRecordOrder);
  const r = all.find((x) => x.id === id);
  if (!r) {
    view.innerHTML = '<p class="empty">Plak bulunamadı. <a href="#/">Listeye dön</a></p>';
    return;
  }
  const no = recordNumbers(all).get(id);
  const covers = [['Ön kapak', r.frontCover], ['Arka kapak', r.backCover]]
    .filter(([, blob]) => blob)
    .map(([label, blob]) => {
      const url = blobUrl(blob);
      // Büyütmek için yeni sekmede yalnızca düz resimler açılır (SVG betik taşıyabilir).
      const img = `<img src="${url}" alt="${label}">`;
      return `
      <figure>
        ${/^image\/(jpeg|png|webp|gif)$/i.test(blob.type) ? `<a href="${url}" target="_blank" rel="noopener">${img}</a>` : img}
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
      <p class="record-no">Sıra no #${no}</p>
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
      ${Cloud.viewer() ? '' : `<div class="actions">
        <a href="#/duzenle/${esc(r.id)}" class="btn primary">Düzenle</a>
        <button class="btn danger" id="deleteBtn">Sil</button>
      </div>`}
    </article>`;

  // Açılamayan görselin yerinde boş kare yerine açıklama görünür. İnternetteki
  // listede kopyası varsa oradan yeniden indirilir.
  let healing = null;
  view.querySelectorAll('.covers img').forEach((img) => img.addEventListener('error', () => {
    const box = document.createElement('div');
    box.className = 'cover-error';
    box.textContent = Cloud.viewer() ? 'Görsel açılamadı.' : 'Görsel açılamadı; plağı düzenleyip yeniden çekebilirsin.';
    (img.closest('a') || img).replaceWith(box);
    healing ??= Cloud.repairCovers(r.id).then((fixed) => {
      if (fixed && box.isConnected) route({ keepScroll: true });
    }, console.error);
  }));

  document.getElementById('deleteBtn')?.addEventListener('click', async () => {
    if (!confirm(`"${r.album}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    await DB.remove(r.id);
    toast('Plak silindi');
    leaveTo('#/');
  });
}

// ---------- Form ----------

// Görsel kutusuna dokununca telefonun fotoğraf kamerası açılır.
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
// silinince ya da eklenince numaralar kendiliğinden kayar. Numara kutusuna başka
// bir şarkının numarası yazılınca şarkı oraya taşınır (bkz. moveByNumber).
function trackRow(t = { no: '', title: '', artist: '' }, letter, i) {
  const auto = autoTrackNo(letter, i);
  return `
    <li class="track-row">
      <input class="t-no" placeholder="${auto}" value="${t.no === auto ? '' : esc(t.no)}" autocomplete="off" aria-label="Sıra no">
      <input class="t-title" placeholder="Şarkı adı" value="${esc(t.title)}" autocomplete="off" aria-label="Şarkı adı">
      <input class="t-artist" placeholder="Söyleyen" value="${esc(t.artist)}" autocomplete="off" aria-label="Söyleyen">
      <button type="button" class="icon-btn remove-track" aria-label="Şarkıyı sil">×</button>
      <button type="button" class="icon-btn drag-handle" tabindex="-1" aria-label="Sürükleyerek taşı">⠿</button>
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

// Her yüzün ilk şarkısının görünen numarası (6, A6 → 6; otomatik numara da sayılır);
// o özel bir numaraysa yüzdeki düz numaraların en küçüğü, o da yoksa null.
const numberOf = (no) => parseInt(no.replace(/^[A-Z]\s*/i, ''), 10);
const sideNumbers = (fs) => [...fs.querySelectorAll('.t-no')].map((input) => input.value.trim()).filter(Boolean);
function firstNumbers(container) {
  return new Map([...container.querySelectorAll('.tracks')].map((fs) => {
    const nos = sideNumbers(fs).filter((no) => SIMPLE_NO.test(no));
    const row = [...fs.querySelectorAll('.track-row')].find((other) => !isEmptyRow(other));
    const shown = row && (row.querySelector('.t-no').value.trim() || row.querySelector('.t-no').placeholder);
    return [fs, shown && SIMPLE_NO.test(shown) ? numberOf(shown) : nos.length ? Math.min(...nos.map(numberOf)) : null];
  }));
}

// Şarkı taşındıktan sonra numaralar. Hepsi düzse (1, 2… ya da A1, A2…) yeni
// sıraya göre yeniden verilir, harfli numaralar bulundukları yüzün harfini alır.
// Taşımadan önce 1'den başlayan yüz yine 1'den başlar, önceki yüzden devam
// eden yüz (A: 1–5, B: 6–10, otomatik numaralı A1–A4'ten sonra B5–B8) yine
// devam eder; ilk kez numara alan yüz plaktaki diğer yüzlere uyar. "A1a", "2-3"
// gibi özel numaralı yüze dokunulmaz, ondan sonraki yüz kendi başlangıcını korur;
// numarası boş yüzler boş kalır. Otomatik numarayla aynı olan numaralar boş
// gösterilir (yer değişince kendiliğinden kayar).
// before: taşımadan önceki firstNumbers().
function renumberTracks(container, before) {
  const sides = [...container.querySelectorAll('.tracks')];
  const all = sides.flatMap(sideNumbers);
  const lettered = (nos) => nos.some((no) => /^[A-Z]/i.test(no));
  // İlk yüzden sonra 1'den büyük başlayan bir yüz varsa numaralar yüzden yüze sürüyordur.
  const continuous = [...before.values()].filter((first) => first != null).slice(1).some((first) => first > 1);
  let next = null;
  let afterCustom = false;
  sides.forEach((fs) => {
    const nos = sideNumbers(fs);
    const filledRows = [...fs.querySelectorAll('.track-row')].filter((row) => !isEmptyRow(row)).length;
    if (!nos.length) {
      if (filledRows) next = filledRows + 1; // otomatik numaralı yüz 1'den sayar
      return;
    }
    if (!nos.every((no) => SIMPLE_NO.test(no))) {
      next = null;
      afterCustom = true;
      return;
    }
    const first = before.get(fs);
    const prefix = lettered(nos) || (first == null && lettered(all)) ? fs.dataset.side : '';
    const continues = next != null && (first == null ? continuous : first > 1);
    let n = continues ? next : (afterCustom && first > 1 ? first : 1);
    afterCustom = false;
    [...fs.querySelectorAll('.track-row')].filter((row) => !isEmptyRow(row)).forEach((row) => {
      row.querySelector('.t-no').value = `${prefix}${n++}`;
    });
    next = n;
  });
  sides.forEach((fs) => {
    renumberPlaceholders(fs);
    fs.querySelectorAll('.t-no').forEach((input) => {
      if (input.value.trim().toUpperCase() === input.placeholder) input.value = '';
    });
  });
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
  const r = existing || {};
  const discs = discsOf(r);
  const images = { frontCover: r.frontCover || null, backCover: r.backCover || null };

  view.innerHTML = `
    <form class="form" id="form" novalidate>
      <a href="${id ? `#/plak/${esc(id)}` : '#/'}" class="back" id="cancelForm">‹ Vazgeç</a>
      <h1>${id ? 'Plağı düzenle' : 'Yeni plak'}</h1>

      <p class="hint">Önce kapak fotoğraflarını ekle; okuma açıksa aşağıdaki bilgiler kapaktan doldurulur.</p>
      <div class="covers-edit">
        ${coverPicker('frontCover', 'Ön kapak', images.frontCover)}
        ${coverPicker('backCover', 'Arka kapak', images.backCover)}
      </div>

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
        Bir şarkıyı başka yere taşımak için × altındaki ⠿ tutamağına basılı tutup sürükle ya da numara kutusuna
        gideceği yerin numarasını yaz (ör. B yüzünün başına B1); diğer numaralar kendiliğinden kayar.</p>
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

    // Görselin köşeleri bulunur, seçilen alan kareye oturtulur; vazgeçilirse önceki
    // görsel kalır. onRetake verilirse köşe ekranında "Tekrar çek" düğmesi çıkar.
    async function useImage(file, onRetake) {
      let cropped;
      try {
        cropped = await CoverCropper.open(file, MAX_IMAGE_SIDE, { onRetake });
      } catch (err) {
        console.error(err);
        preview.innerHTML = '<span>Görsel okunamadı</span>';
        return;
      } finally {
        fitScreen();
      }
      if (!cropped || cropped === CoverCropper.RETAKE) return;
      if (!picker.isConnected) return; // bu arada başka ekrana geçildi
      images[key] = cropped;
      preview.innerHTML = `<img src="${blobUrl(images[key])}" alt="">`;
      removeBtn.hidden = false;
      readCover(key === 'frontCover' ? 'front' : 'back', images[key], status);
    }

    // Kutuya dokununca telefonun fotoğraf kamerası açılır (etiket bağlı olduğu
    // girişi açar); "Tekrar çek" de onu yeniden açar.
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
      // Yazılmış numara önce uygulanır; yoksa taşıma yeni açılan boş satırı silerdi.
      applyTypedNumber();
      rows.insertAdjacentHTML('beforeend', trackRow(undefined, fs.dataset.side, rows.children.length));
      rows.lastElementChild.querySelector('.t-title').focus();
    });
    rows.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-track');
      if (!btn) return;
      // Silinen şarkının kutusuna yazılmış numara uygulanmaz: şarkı önce taşınır (plak
      // eklenir, bir yüz satırsız kalır), sonra silinirdi. Başka satıra yazılan uygulanır.
      const box = btn.closest('.track-row').querySelector('.t-no');
      if (document.activeElement === box || pendingMove?.input === box) {
        box.value = box.dataset.prev ?? '';
        if (pendingMove?.input === box) pendingMove = null;
      }
      applyTypedNumber();
      if (!btn.isConnected) return;
      const numbersBefore = firstNumbers(discsEl);
      const list = btn.closest('.track-rows');
      btn.closest('.track-row').remove();
      if (!list.children.length) list.insertAdjacentHTML('beforeend', trackRow(undefined, list.closest('.tracks').dataset.side, 0));
      renumberTracks(discsEl, numbersBefore);
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

  // Numara kutusuna başka bir şarkının numarası (A3, B1, 7…) yazılınca şarkı o
  // şarkının yerine taşınır. O numarada şarkı yoksa ve bir yüz harfi yazıldıysa
  // (B3, A9) şarkı o yüzün o sırasına ya da sonuna gider; sıradaki plağın yüzü
  // yazıldıysa (tek plakta C1) plak eklenir. Düz numara (7) yalnızca kendi yüzünde,
  // numaralar yüzden yüze sürüyorsa (A 1–5, B 6–10) bütün plakta aranır. Bulunamayan
  // düz numaralar ve özel numaralar ("A1a", "2-3") taşımaz, numara olarak kalır.
  discsEl.addEventListener('focusin', (e) => {
    if (e.target.matches('.t-no')) e.target.dataset.prev = e.target.value;
  });
  // Numara kutusundan çıkmak için başka yere dokunulduysa taşıma dokunuş bitince
  // yapılır; yoksa satırlar kayar ve dokunulan düğme (Kaydet) parmağın altından
  // kaçar. Kaydet'e basıldıysa önce taşınır, sonra kaydedilir (bkz. submit).
  let pendingMove = null;
  const runPendingMove = () => {
    const run = pendingMove;
    pendingMove = null;
    run?.();
  };
  discsEl.addEventListener('change', (e) => {
    if (!e.target.matches('.t-no')) return;
    const input = e.target;
    pendingMove = Object.assign(() => moveByNumber(input), { input });
    if (Tap.active()) Tap.after(runPendingMove);
    else runPendingMove();
  });
  // Numara kutusuna yazılmış ama henüz uygulanmamış numarayı uygular. iPhone'da bir
  // düğmeye (Kaydet, ×) dokunmak numara kutusundan çıkarmaz, "change" gelmez.
  // Önce kutudan çıkılır: odaktaki satırı taşımak tarayıcıya kutudan çıkarttırır ve
  // taşıma ortasında ikinci bir "change" gelirdi.
  // Bir taşıma yapıldıysa (satırlar yer değiştirdiyse) true döner.
  function applyTypedNumber() {
    const rowsBefore = [...discsEl.querySelectorAll('.track-row')];
    const active = document.activeElement;
    if (active?.matches('.t-no') && discsEl.contains(active)) {
      active.blur(); // yazılan numara değiştiyse "change" burada gelir
      if (!pendingMove && active.value !== (active.dataset.prev ?? '')) pendingMove = Object.assign(() => moveByNumber(active), { input: active });
    }
    runPendingMove();
    const rowsAfter = discsEl.querySelectorAll('.track-row');
    return rowsAfter.length !== rowsBefore.length || rowsBefore.some((r, i) => r !== rowsAfter[i]);
  }
  // iPhone'da boş bir yere dokunmak da numara kutusundan çıkarmaz (klavye açık kalır);
  // formda yazı kutusu ya da düğme dışında bir yere dokununca kutudan çıkılır.
  document.getElementById('form').addEventListener('pointerdown', (e) => {
    const active = document.activeElement;
    if (active?.matches('.t-no') && !e.target.closest('input, textarea, select, button, label, a')) active.blur();
  });

  function moveByNumber(input) {
    const row = input.closest('.track-row');
    const from = row?.closest('.tracks');
    if (!from || !row.isConnected) return;
    let typed = input.value.trim().toUpperCase().replace(/\s+/g, '');
    const m = typed.match(/^([A-Z])?(\d+)$/);
    if (!m) return;
    let letter = m[1] || '';
    const n = parseInt(m[2], 10);
    // Kutudaki ya da (boşsa) soluk yazılı numara.
    const numberOfRow = (other) => {
      const v = other.querySelector('.t-no').value.trim().toUpperCase().replace(/\s+/g, '');
      return v || other.querySelector('.t-no').placeholder;
    };
    const sameNumber = (no) => {
      const k = no.match(/^([A-Z])?(\d+)$/);
      return Boolean(k) && (k[1] || '') === letter && parseInt(k[2], 10) === n;
    };
    // Taşımadan önceki numaralar, yazılan numara olmadan.
    const typedValue = input.value;
    input.value = input.dataset.prev ?? '';
    const numbersBefore = firstNumbers(discsEl);
    input.value = typedValue;
    // Numaralar yüzden yüze sürüyor mu (ilk yüzden sonra 1'den büyük başlayan yüz var).
    const continuous = [...numbersBefore.values()].filter((first) => first != null).slice(1).some((first) => first > 1);

    const rows = [...discsEl.querySelectorAll('.track-row')];
    const filled = (fs) => [...fs.querySelectorAll('.track-row')].filter((other) => !isEmptyRow(other));
    // Aynı numaralı başka şarkı: önce kendi yüzünde, sonra (harfliyse ya da numaralar
    // sürüyorsa) plağın diğer yüzlerinde.
    const matches = rows.filter((other) => other !== row && !isEmptyRow(other) && sameNumber(numberOfRow(other)));
    // Numara dizisi: 1'den (ya da otomatik numarayla) başlayan yüz ve onu sürdüren yüzler.
    const sidesList = [...discsEl.querySelectorAll('.tracks')];
    const runOf = (fs) => {
      let i = sidesList.indexOf(fs);
      while (i > 0 && (numbersBefore.get(sidesList[i]) ?? 2) > 1) i--;
      return sidesList[i];
    };
    let target = matches.find((other) => other.closest('.tracks') === from)
      || (letter ? matches[0] : continuous ? matches.find((other) => runOf(other.closest('.tracks')) === runOf(from)) : undefined);
    // Harfli ya da otomatik numaralı (A1, A2…) yüzde düz numara (3) o düzenin
    // numarasıdır: önce kendi yüzünde (A3), numaralar yüzden yüze sürüyorsa dizinin
    // diğer yüzlerinde (B6) aranır; yoksa kendi yüzünün o sırası sayılır.
    const ownNo = (input.dataset.prev ?? '').trim().toUpperCase() || input.placeholder;
    if (!target && !letter && /^[A-Z]\d+$/.test(ownNo)) {
      const sameN = rows.filter((other) => {
        const k = numberOfRow(other).match(/^([A-Z])(\d+)$/);
        return other !== row && !isEmptyRow(other) && Boolean(k) && parseInt(k[2], 10) === n;
      });
      target = sameN.find((other) => other.closest('.tracks') === from)
        || (continuous ? sameN.find((other) => runOf(other.closest('.tracks')) === runOf(from)) : undefined);
      if (!target) {
        letter = from.dataset.side;
        typed = `${letter}${n}`;
      }
    }
    let to;
    let before;
    if (target) {
      to = target.closest('.tracks');
      // Aşağı taşınan şarkı, kendisi çıkınca hedefin numarası bir azalıyorsa (aynı
      // yüz ya da süren numaralar) hedefin altına, değilse üstüne girer.
      const after = rows.indexOf(target) > rows.indexOf(row) && (to === from || (continuous && runOf(to) === runOf(from)));
      before = after ? target.nextElementSibling : target;
    } else if (letter && n >= 1) {
      const index = letter.charCodeAt(0) - 65;
      const discs = discsEl.querySelectorAll('.disc-edit').length;
      // Yalnızca sıradaki plak eklenir; yanlış harf (S2) plak doldurmasın.
      if (index >= MAX_DISCS * 2 || Math.floor(index / 2) > discs) {
        input.value = typed;
        return;
      }
      if (!discsEl.querySelector(`.tracks[data-side="${letter}"]`) && !setDiscCount(Math.floor(index / 2) + 1)) return;
      to = discsEl.querySelector(`.tracks[data-side="${letter}"]`);
      // Şarkı, o yüzün diğer şarkıları arasında n. sıraya girer.
      const others = filled(to).filter((other) => other !== row);
      before = others[n - 1] || (others.length ? others.at(-1).nextElementSibling : to.querySelector('.track-row'));
    }
    if (before === row) before = row.nextElementSibling;
    if (!to || (to === from && before === row.nextElementSibling)) {
      // Taşınmadı: kendi numarasıysa kutu boşalır (otomatik numara), harfli numara büyük harfle.
      if (typed === input.placeholder) input.value = '';
      else if (letter) input.value = typed;
      return;
    }

    // Taşınırken odak kaybolmasın (ör. Enter'la şarkı adına geçildi).
    const active = document.activeElement;
    const list = to.querySelector('.track-rows');
    list.insertBefore(row, before?.parentElement === list ? before : null);
    if (to !== from) {
      // Boş satırlar kalkar; o an yazılan (dokunulan ya da "+ Şarkı ekle" ile açılan) satır kalır.
      to.querySelectorAll('.track-row').forEach((other) => { if (other !== row && isEmptyRow(other) && !other.contains(active)) other.remove(); });
      if (!from.querySelector('.track-row')) {
        from.querySelector('.track-rows').insertAdjacentHTML('beforeend', trackRow(undefined, from.dataset.side, 0));
      }
    }
    // Yazılan numara hedefi gösterir; şarkının numarasını yeni yeri belirler. Gittiği
    // yüzde elle yazılmış numara yoksa şarkı da otomatik numara (B1, B2…) alır.
    input.value = input.dataset.prev ?? '';
    if (![...to.querySelectorAll('.t-no')].some((other) => other !== input && other.value.trim())) input.value = '';
    renumberTracks(discsEl, numbersBefore);
    input.dataset.prev = input.value;
    // Odaktaki kutunun numarası da değişmiş olabilir; değişmeden kalırsa sonra taşıma sayılmasın.
    if (active?.matches?.('.t-no')) active.dataset.prev = active.value;
    if (active?.isConnected && document.activeElement !== active) active.focus({ preventScroll: true });
    // Taşınan şarkı bir an vurgulanır ve görünür yere kaydırılır.
    row.classList.remove('moved');
    void row.offsetWidth;
    row.classList.add('moved');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ⠿ üzerinden fiskeyle kaydırılan sayfa, parmak kalkınca iPhone'daki gibi yavaşlayarak
  // kaymayı sürdürür. Ekrana yeniden dokunmak durdurur; o dokunuş bir şeye tıklamaz.
  function coast(samples, upTime) {
    const recent = samples.filter(([t]) => t >= upTime - 100); // son 100 ms
    if (recent.length < 2) return; // parmak durup kalktı
    const [t0, y0] = recent[0];
    const [t1, y1] = recent[recent.length - 1];
    let v = (y0 - y1) / Math.max(t1 - t0, 1); // px/ms; artı: sayfa aşağı kayar
    let pos = window.scrollY;
    let last = 0;
    let frame = requestAnimationFrame(step);
    function step(now) {
      const dt = last ? Math.min(now - last, 50) : 16;
      last = now;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      pos = Math.min(Math.max(pos + v * dt, 0), max);
      window.scrollTo(0, pos);
      v *= 0.998 ** dt;
      if (Math.abs(v) < 0.02 || pos <= 0 || pos >= max) halt();
      else frame = requestAnimationFrame(step);
    }
    function halt() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('wheel', halt);
    }
    function touched() {
      halt();
      const swallow = (c) => { c.preventDefault(); c.stopImmediatePropagation(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      const unswallow = () => setTimeout(() => document.removeEventListener('click', swallow, true), 600);
      ['pointerup', 'pointercancel'].forEach((type) => window.addEventListener(type, unswallow, { once: true }));
    }
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('wheel', halt, { passive: true });
  }

  // Şarkılar × düğmesinin altındaki tutamaktan (⠿) sürüklenerek sıralanır ya da başka
  // yüze, başka plağa taşınır (ör. kapakta hepsi A yüzüne okunduysa bir kısmı B yüzüne).
  // Satır parmağı izleyerek yer değiştirir; ekranın kenarına gelince sayfa kayar.
  // Bırakınca numaralar, numarayla taşımadaki gibi yeniden verilir.
  discsEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || e.button > 0) return;
    e.preventDefault();
    // Bu basışta satırlar parmağın altından kayabilir; parmak kalkınca gelen tıklama
    // altta kalan × düğmesine gidip başka bir şarkıyı silmesin. Tutamağın kendisine
    // giden tıklama geçer (açık ⋮ menüsü kapansın).
    const swallow = (c) => {
      if (c.target.closest?.('.drag-handle') === handle) return;
      c.preventDefault();
      c.stopImmediatePropagation();
    };
    const unswallow = () => document.removeEventListener('click', swallow, true);
    document.addEventListener('click', swallow, { capture: true, once: true });
    document.addEventListener('pointerdown', unswallow, { capture: true, once: true });
    ['pointerup', 'pointercancel'].forEach((type) => window.addEventListener(type, () => setTimeout(unswallow, 600), { once: true }));
    // Numara kutusuna yazılmış numara varsa bu basış yalnızca onu uygular (klavye kapanır).
    if (applyTypedNumber()) return;
    document.activeElement?.blur();
    const row = handle.closest('.track-row');
    const from = row?.closest('.tracks');
    if (!from || isEmptyRow(row)) return; // boş satır şarkı değildir, taşınmaz
    const numbersBefore = firstNumbers(discsEl);
    const homeList = row.parentElement;
    const homeNext = row.nextElementSibling;
    const pointerId = e.pointerId;
    const downTime = e.timeStamp;
    const startY = e.clientY;
    const grab = startY - row.getBoundingClientRect().top; // parmağın satırdaki yeri
    let fingerY = startY;
    let moved = false; // parmak kıpırdamadan basılı tutmak satırı yerinden oynatmaz
    let scrolling = false;
    const samples = []; // kaydırırken parmağın son konumları (zaman, y)
    let changed = false;
    let frame = 0;
    row.classList.add('dragging');
    // Satır yer değiştirince tarayıcı yakalamayı bırakabilir; olaylar pencereden
    // dinlenir ve yakalama her taşımadan sonra yenilenir.
    const capture = () => { try { handle.setPointerCapture(pointerId); } catch { /* parmak kalkmış */ } };
    capture();

    function place() {
      // Satırın parmakla birlikte gideceği üst kenar; üst çubuğun altına konmaz.
      const top = Math.max(fingerY - grab, topbar.getBoundingClientRect().bottom + 1);
      const y = top + grab;
      const sides = [...discsEl.querySelectorAll('.tracks')];
      const boxes = sides.map((fs) => fs.getBoundingClientRect());
      const dist = (b) => (y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0);
      const fs = sides[boxes.reduce((best, b, i) => (dist(b) < dist(boxes[best]) ? i : best), 0)];
      const list = fs.querySelector('.track-rows');
      // Satır listeden çıkarılmış gibi bakılır (altındakiler onun boyu kadar yukarıda
      // sayılır); böylece parmak geri gelince satır da eski yerine döner.
      const h = row.getBoundingClientRect().height;
      let below = false;
      const before = [...list.children].find((other) => {
        if (other === row) { below = true; return false; }
        const b = other.getBoundingClientRect();
        return top < b.top + b.height / 2 - (below ? h : 0);
      }) || null;
      if (row.parentElement !== list || row.nextElementSibling !== before) {
        list.insertBefore(row, before);
        changed = true;
        capture();
      }
    }
    function tick() {
      if (!row.isConnected) { stop(); return; } // sürüklerken ekran kapandı
      if (moved) {
        // Kenara yaklaşınca sayfa kayar; üstte kenar, üst çubuğun (iPhone'da saat
        // şeridiyle birlikte) altından ölçülür.
        // Şarkı listesinin başı ya da sonu göründüyse daha fazla kaymaz.
        const edge = 72;
        const top = topbar.getBoundingClientRect().bottom;
        const span = discsEl.getBoundingClientRect();
        if (fingerY < top + edge && span.top < top) window.scrollBy(0, -Math.ceil((top + edge - Math.max(fingerY, top)) / 6));
        else if (fingerY > window.innerHeight - edge && span.bottom > window.innerHeight) window.scrollBy(0, Math.ceil((fingerY - window.innerHeight + edge) / 6));
        place();
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      if (scrolling) {
        window.scrollBy(0, fingerY - ev.clientY);
        fingerY = ev.clientY;
        samples.push([ev.timeStamp, fingerY]);
        return;
      }
      fingerY = ev.clientY;
      if (!moved && Math.abs(fingerY - startY) > 8) {
        // Parmakla hızlı bir fiske sürükleme değil, sayfayı kaydırır (sayfayı kaydırırken
        // parmak ⠿'e denk gelince şarkılar karışmasın).
        if (e.pointerType !== 'mouse' && Math.abs(fingerY - startY) / Math.max(ev.timeStamp - downTime, 1) > 0.3) { // px/ms
          scrolling = true;
          samples.push([downTime, startY], [ev.timeStamp, fingerY]);
          row.classList.remove('dragging');
          window.scrollBy(0, startY - fingerY);
          return;
        }
        moved = true;
      }
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
      if (scrolling) coast(samples, ev.timeStamp);
      if (!changed || !row.isConnected || !from.isConnected) return;
      // Bırakılan satır üst çubuğun altında ya da ekranın dışında kaldıysa görünür yere kaydırılır.
      const barBottom = topbar.getBoundingClientRect().bottom;
      const box = row.getBoundingClientRect();
      if (box.top < barBottom) window.scrollBy(0, box.top - barBottom - 8);
      else if (box.bottom > window.innerHeight) window.scrollBy(0, box.bottom - window.innerHeight + 8);
      if (row.parentElement === homeList && row.nextElementSibling === homeNext) return; // yerine geri bırakıldı
      const to = row.closest('.tracks');
      if (to === from) {
        // "+ Şarkı ekle" ile açılmış boş satır şarkıların arasında kalmasın, sona gider.
        const list = row.parentElement;
        [...list.children].forEach((other) => { if (other !== row && isEmptyRow(other)) list.append(other); });
      } else {
        to.querySelectorAll('.track-row').forEach((other) => { if (other !== row && isEmptyRow(other)) other.remove(); });
        if (!from.querySelector('.track-row')) {
          from.querySelector('.track-rows').insertAdjacentHTML('beforeend', trackRow(undefined, from.dataset.side, 0));
        }
        // Gittiği yüzde şarkı varsa ve hiçbirine elle numara yazılmamışsa şarkı da
        // otomatik numara (B1, B2…) alır.
        const no = row.querySelector('.t-no');
        if (numbersBefore.get(to) != null && ![...to.querySelectorAll('.t-no')].some((other) => other !== no && other.value.trim())) no.value = '';
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

  document.getElementById('cancelForm').addEventListener('click', (e) => {
    e.preventDefault();
    leaveTo(e.currentTarget.getAttribute('href'));
  });

  // Kaydederken (kapak onarımı birkaç saniye sürebilir) Kaydet kapalı kalır; ikinci
  // dokunuş ikinci kez kaydetmez.
  let saving = false;
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    saving = true;
    const submitBtn = e.target.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    try {
      await saveForm(e.target);
    } finally {
      saving = false;
      submitBtn.disabled = false;
    }
  });

  async function saveForm(form) {
    applyTypedNumber();
    normalizeFormText(null);
    const f = new FormData(form);
    const artist = f.get('artist').trim();
    const album = f.get('album').trim();
    const errorEl = document.getElementById('formError');
    errorEl.hidden = true;
    if (!artist || !album) {
      errorEl.textContent = 'Sanatçı ve albüm adı zorunlu.';
      errorEl.hidden = false;
      return;
    }
    // Adların yazıldığı (ya da kapaktan okunduğu) hali; ilk hali saklanmamış plakta
    // saklanır ki kurallar değişince bu halinden yeniden düzeltilebilsin.
    const raw = (name) => (form.elements[name].dataset.raw ?? f.get(name)).trim();
    const typed = { artist: raw('artist'), album: raw('album'), genre: raw('genre'), label: raw('label'), discs: readDiscs(true) };
    const record = normalizeRecord({
      id: r.id || DB.newId(),
      no: r.no || '',
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
    // Bu cihazda açılamayan (bozulmuş) kapak önce internetteki kopyasından onarılır;
    // plağın şimdiki hali onarımdan (ya da bu arada biten eşitlemeden) sonra okunur.
    const keep = existing ? ['frontCover', 'backCover'].filter((k) => images[k] === (existing[k] || null)) : [];
    const stored = keep.length ? await DB.get(existing.id) : null;
    let broken = false;
    for (const k of keep) if (stored?.[k] instanceof Blob && !await DB.readable(stored[k])) broken = true;
    if (broken) {
      errorEl.textContent = 'Kapak internetteki kopyasından getiriliyor…';
      errorEl.hidden = false;
      const repair = Cloud.repairCovers(existing.id, true).catch((err) => { console.error(err); return false; });
      await Promise.race([repair, new Promise((done) => setTimeout(done, 10000, false))]);
      errorEl.hidden = true;
      if (!form.isConnected) return; // beklerken formdan çıkıldı (Vazgeç): kaydedilmez
    }
    // Değiştirilmeyen kapaklar plağın şimdiki halinden alınır (form açıkken eşitleme
    // ya da onarım değiştirmiş olabilir). Form açıkken plak başka bir cihazda
    // değiştirildiyse (eşitlemeyle geldi), burada değiştirilmeyen alanlar da o yeni halinden alınır.
    const current = existing && await DB.get(existing.id);
    const untouched = ['frontCover', 'backCover'].filter((k) => current && images[k] === (existing[k] || null));
    untouched.forEach((k) => { record[k] = current[k] || null; });
    if (current && current.updatedAt !== existing.updatedAt) {
      const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
      ['no', 'artist', 'album', 'year', 'genre', 'label', 'notes'].forEach((k) => {
        if (same(record[k], existing[k])) record[k] = current[k];
      });
      if (same(record.discs, discsOf(existing))) record.discs = discsOf(current);
      if (current.namesBeforeCasing && !existing.namesBeforeCasing) record.namesBeforeCasing = current.namesBeforeCasing;
    }
    try {
      await DB.put(record);
    } catch (err) {
      console.error(err);
      const retry = Cloud.info()?.mode === 'owner' ? 'İnternete bağlıyken yeniden dene; olmazsa kapağı' : 'Kapağı';
      errorEl.textContent = err.unreadable
        ? `Kaydedilemedi: kapak bu cihazda açılamıyor. ${retry} "Kaldır" ile silip yeniden çek.`
        : `Kaydedilemedi: ${String(err.message || err).replace(/\.?$/, '.')}`;
      errorEl.hidden = false;
      return;
    }
    toast('Kaydedildi');
    // Kaydedilirken başka ekrana geçildiyse oraya dokunulmaz, yalnızca yenilenir.
    if (form.isConnected) leaveTo(`#/plak/${record.id}`);
    else refreshFromRemote();
  }
}

// ---------- Menü: yedekleme ----------

const menu = document.getElementById('menu');
function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  if (refreshPending) setTimeout(refreshFromRemote, 0);
}
// İzlenen listede plak eklenmez, kapak okunmaz, yedek geri yüklenmez.
if (Cloud.viewer()) {
  menu.querySelector('[data-action=reader]').hidden = true;
  document.getElementById('importItem').hidden = true;
  menu.querySelector('[data-action=cloud]').textContent = 'İzleme';
}
menu.querySelector('[data-action=cloud]').addEventListener('click', closeMenu);
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
  // Açılamayan kapak yedeğe girmez; yedeğin geri kalanı yine alınır.
  let unreadable = 0;
  const cover = async (blob) => {
    if (!blob) return null;
    try {
      return await blobToDataUrl(blob);
    } catch (err) {
      console.error(err);
      unreadable++;
      return null;
    }
  };
  const out = [];
  for (const r of records) {
    out.push({ ...r, frontCover: await cover(r.frontCover), backCover: await cover(r.backCover) });
  }
  const json = JSON.stringify({ app: 'plaklarim', version: 1, exportedAt: new Date().toISOString(), records: out });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `plaklarim-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(unreadable
    ? `${records.length} plak yedeklendi; açılamayan ${unreadable} kapak yedeğe girmedi`
    : `${records.length} plak yedeklendi`);
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

// ---------- İnternette saklama ----------

function timeText(iso) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('tr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
function cloudStatusText(st = Cloud.status()) {
  if (st.state === 'busy') return st.text || 'Eşitleniyor…';
  if (st.state === 'error' || st.state === 'offline') return st.text;
  return st.at ? `Son eşitleme: ${timeText(st.at)}` : '';
}

// Bağlantı telefonun paylaş menüsüyle gönderilir; yoksa kopyalanır.
async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Bağlantı kopyalandı');
  } catch {
    prompt('Bağlantıyı kopyala:', url);
  }
}

const TOKEN_INPUT = 'placeholder="github_pat_…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

function renderCloud() {
  const info = Cloud.info();
  const links = Cloud.links;
  const ext = 'target="_blank" rel="noopener"';
  const repo = esc(info?.repo || Cloud.REPO_NAME);
  let body;
  if (!info) {
    body = `
      <p>Plakların GitHub hesabındaki gizli bir depoda saklanır; bağladığın her cihazda aynı liste
        açılır ve değişiklikler kendiliğinden eşitlenir. GitHub ücretsizdir. Bir kere kurulur:</p>
      <ol class="steps">
        <li><strong>Gizli depo oluştur.</strong>
          <p class="hint">Açılan sayfada adı <b>${repo}</b>, görünürlüğü <b>Private</b> gelir; en alttaki
            <b>Create repository</b>'ye bas. GitHub hesabın yoksa önce ücretsiz hesap aç.</p>
          <a class="btn small" href="${links.newRepo}" ${ext}>GitHub'da depo oluştur</a></li>
        <li><strong>Anahtar oluştur.</strong>
          <p class="hint"><b>Repository access</b> bölümünde <b>Only select repositories</b>'i seçip
            <b>${repo}</b>'yi işaretle (izinler hazır gelir), en alttaki <b>Generate token</b>'a bas
            ve çıkan anahtarı kopyala.</p>
          <a class="btn small" href="${links.writeToken}" ${ext}>Anahtar oluştur</a></li>
        <li><strong>Anahtarı buraya yapıştır.</strong>
          <form class="cloud-form" id="connectForm">
            <input id="connectInput" ${TOKEN_INPUT} aria-label="Anahtar ya da bağlantı">
            <button class="btn primary">Bağlan</button>
          </form>
          <p class="error" id="connectError" hidden></p>
          <p class="hint">Anahtar yalnızca bu cihazda saklanır. Diğer cihazlarında anahtar yerine, bağlı
            cihazdan paylaştığın bağlantıyı açman ya da buraya yapıştırman yeterli. Birinin
            gönderdiği izleme bağlantısını da buraya yapıştırabilirsin.</p></li>
      </ol>`;
  } else if (info.mode === 'viewer') {
    body = `
      <p>Bu cihazda <b>${esc(info.owner)}</b> kullanıcısının plak listesini izliyorsun. Listeyi
        görebilirsin ama değiştiremezsin; her açılışta güncellenir.</p>
      <p class="hint">Uygulamayı ana ekrana eklediysen orada liste boş görünür; aldığın bağlantıyı
        oradaki ⋮ → İnternette saklama sayfasına yapıştır.</p>
      <p class="cloud-status" id="cloudStatus"></p>
      <div class="actions">
        <button class="btn" id="syncNow">Şimdi yenile</button>
        <button class="btn danger" id="stopViewing">İzlemeyi bırak</button>
      </div>
      <section>
        <h2>Yeni bağlantı aldıysan</h2>
        <form class="cloud-form" id="connectForm">
          <input id="connectInput" placeholder="https://…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="İzleme bağlantısı">
          <button class="btn primary">Aç</button>
        </form>
        <p class="error" id="connectError" hidden></p>
      </section>`;
  } else {
    body = `
      <p>Plakların <b>${esc(info.owner)}/${repo}</b> gizli deposunda saklanıyor; bu cihazda yaptığın
        değişiklikler kendiliğinden eşitlenir.</p>
      <p class="cloud-status" id="cloudStatus"></p>
      <button class="btn" id="syncNow">Şimdi eşitle</button>
      <details class="renew"${[401, 403, 404].includes(Cloud.status().code) ? ' open' : ''}>
        <summary>Anahtarı yenile</summary>
        <p class="hint">Anahtar silindiyse ya da çalışmıyorsa <a href="${links.writeToken}" ${ext}>yeni anahtar oluştur</a>
          (<b>Only select repositories</b> → <b>${repo}</b>) ve buraya yapıştır.</p>
        <form class="cloud-form" id="connectForm">
          <input id="connectInput" ${TOKEN_INPUT} aria-label="Yeni anahtar">
          <button class="btn primary">Kaydet</button>
        </form>
        <p class="error" id="connectError" hidden></p>
      </details>

      <section>
        <h2>Başka bir cihazını bağla</h2>
        <p class="hint">Bu bağlantıyı diğer telefonunda ya da bilgisayarında aç. Ana ekrana eklenmiş
          uygulamada açılmazsa bağlantıyı kopyalayıp oradaki <b>İnternette saklama</b> sayfasına yapıştır.
          Bu bağlantıyla plakların değiştirilebilir; kimseyle paylaşma.</p>
        <button class="btn" id="shareDevice">Bağlantıyı paylaş</button>
      </section>

      <section>
        <h2>İzin verdiklerin görsün</h2>
        <p class="hint">İzleme bağlantısını açanlar listeni görür ama değiştiremez. Bunun için yalnızca
          okuma izni olan ayrı bir anahtar gerekir.</p>
        ${info.hasViewLink ? '<p><button class="btn primary" id="shareView">İzleme bağlantısını paylaş</button></p>' : ''}
        <ol class="steps">
          <li><a class="btn small" href="${links.readToken}" ${ext}>Okuma anahtarı oluştur</a>
            <p class="hint"><b>Only select repositories</b> altında <b>${repo}</b>'yi seç, en alttaki
              <b>Generate token</b>'a bas ve anahtarı kopyala.</p></li>
          <li><form class="cloud-form" id="viewForm">
              <input id="viewInput" ${TOKEN_INPUT} aria-label="Okuma anahtarı">
              <button class="btn">${info.hasViewLink ? 'Yeni bağlantı' : 'Bağlantı oluştur'}</button>
            </form>
            <p class="error" id="viewError" hidden></p></li>
        </ol>
        <p class="hint">Kimse görmesin istersen GitHub'daki <a href="${links.tokens}" ${ext}>anahtarlar</a>
          sayfasından okuma anahtarını sil; o anahtarla verilen bütün izleme bağlantıları çalışmaz olur ve
          liste izleyenlerin cihazından, uygulamayı bir sonraki açışlarında silinir.</p>
      </section>

      <section>
        <button class="btn danger" id="disconnect">Bu cihazın bağlantısını kes</button>
        <p class="hint">Plaklar bu cihazda kalır; internetteki kopyaya dokunulmaz.</p>
      </section>`;
  }
  view.innerHTML = `
    <article class="cloud-page">
      <h1>${info?.mode === 'viewer' ? 'İzleme' : 'İnternette saklama'}</h1>
      ${body}
    </article>`;
  showCloudStatus();

  // Anahtar ya da bağlantı gönderen formlar.
  function wireForm(formId, errorId, action) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      const error = document.getElementById(errorId);
      error.hidden = true;
      btn.disabled = true;
      try {
        await action(form.querySelector('input').value);
      } catch (err) {
        console.error(err);
        if (!error.isConnected) return;
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }
  wireForm('connectForm', 'connectError', async (text) => {
    const result = await Cloud.connect(text);
    if (result === 'reload') {
      location.reload();
      return;
    }
    toast(result);
    if (currentPage() === 'bulut') renderCloud();
  });
  wireForm('viewForm', 'viewError', async (text) => {
    await Cloud.makeViewLink(text);
    toast('İzleme bağlantısı hazır; paylaşabilirsin.');
    if (currentPage() === 'bulut') renderCloud();
  });

  // Okuma anahtarı GitHub'da silindiyse paylaşma düğmesi kaldırılır.
  if (info?.hasViewLink) {
    Cloud.checkViewLink().then((ok) => {
      if (!ok && currentPage() === 'bulut') renderCloud();
    });
  }

  document.getElementById('syncNow')?.addEventListener('click', () => Cloud.syncNow());
  document.getElementById('shareDevice')?.addEventListener('click', () => shareLink(Cloud.deviceLink(), 'Plaklarım: cihaz bağlantısı'));
  document.getElementById('shareView')?.addEventListener('click', () => shareLink(Cloud.viewLink(), 'Plaklarım'));
  document.getElementById('disconnect')?.addEventListener('click', () => {
    if (!confirm('Bu cihazın bağlantısı kesilsin mi? Plaklar bu cihazda kalır ama artık eşitlenmez.')) return;
    Cloud.disconnect();
    renderCloud();
  });
  document.getElementById('stopViewing')?.addEventListener('click', async () => {
    if (!confirm('İzlemeyi bırakınca indirilen liste bu cihazdan silinir. Bırakılsın mı?')) return;
    await Cloud.stopViewing();
    history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    location.reload();
  });
}

// Üst çubuktaki bulut simgesi ve uzun işlemlerde altındaki bilgi satırı.
const cloudBtn = document.getElementById('cloudBtn');
const cloudLine = document.getElementById('cloudLine');
function showCloudStatus(st = Cloud.status()) {
  const text = cloudStatusText(st);
  cloudBtn.hidden = st.state === 'off';
  cloudBtn.dataset.state = st.state;
  cloudBtn.title = text || 'İnternette saklama';
  const line = st.state === 'error' || st.progress ? text : '';
  cloudLine.textContent = line;
  cloudLine.hidden = !line || currentPage() === 'bulut';
  cloudLine.classList.toggle('error', st.state === 'error');
  const el = document.getElementById('cloudStatus');
  if (el) {
    el.textContent = text;
    el.classList.toggle('error', st.state === 'error');
  }
  // Anahtar çalışmıyorsa yenileme alanı kendiliğinden açılır.
  const renew = view.querySelector('details.renew');
  if (renew && st.state === 'error' && [401, 403, 404].includes(st.code)) renew.open = true;
}
// İnternetten gelen değişiklikler ekrana yansır. Liste yerinde yenilenir (arama
// sürerken de); plak sayfası menü kapanınca yenilenir; düzenleme formuna
// dokunulmaz (kaydederken başka cihazdaki değişiklikler korunur).
let refreshPending = false;
function refreshFromRemote() {
  const page = currentPage();
  if (page === 'yeni' || page === 'duzenle' || page === 'bulut') return;
  if (page === '' && refreshList) { refreshList(); return; }
  if (!menu.hidden) { refreshPending = true; return; }
  refreshPending = false;
  route({ keepScroll: true });
}
Cloud.onRemoteChange(refreshFromRemote);
Cloud.onStatus((st) => {
  showCloudStatus(st);
  // İzlenen liste boşken "yükleniyor" yazısı eşitleme bitince güncellenir.
  if (['ok', 'error'].includes(st.state) && Cloud.viewer() && currentPage() === '' && !refreshList) refreshFromRemote();
});
window.addEventListener('hashchange', () => showCloudStatus());

// ---------- Başlat ----------

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
// Tarayıcıdan verilerin kalıcı saklanmasını iste (otomatik temizlenmesin).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// Açılıştaki düzeltme bitmeden yedekten geri yükleme başlamaz (yazdıkları karışmasın).
// Eşitleme de bu düzeltmeden sonra başlar.
const storedRecordsNormalized = normalizeStoredRecords();
showCloudStatus();
storedRecordsNormalized.finally(() => {
  route();
  Cloud.start();
});
