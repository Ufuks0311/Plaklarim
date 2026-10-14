// Plakları internette, sahibinin GitHub hesabındaki gizli bir depoda (Plaklarim-veri)
// saklar ve bağlı cihazlar arasında eşitler. Sunucu yoktur; uygulama GitHub'ın
// API'sine tarayıcıdan bağlanır. Anahtar (token) yalnızca cihazın yerel deposunda
// tutulur.
//
// Depodaki düzen:
//   plaklar.json             bütün plaklar, her satırda bir plak; kapaklar yerine
//                            görsel dosyasının özeti: { sha, type }
//   kapaklar/<sha>.jpg       kapak görselleri (adı içeriğinin git özeti)
//
// Sahibin cihazları yazma anahtarıyla değiştirir. İzleme bağlantısıyla açan
// cihazlar yalnızca okuma anahtarı taşır, listeyi ayrı bir veritabanına indirir
// ve hiçbir şey değiştiremez.
//
// Eşitleme üç yönlüdür: her plağın son eşitlenen hali 'sync' deposunda durur.
// Yalnızca bu cihazda değişen gönderilir, yalnızca internette değişen indirilir.
// İkisinde de değişmişse son değiştirilen (updatedAt) kalır; birinde silinip
// öbüründe değiştirilmişse değiştirilen kalır.
const Cloud = (() => {
  const CONFIG_KEY = 'plaklarim.bulut';
  const API = 'https://api.github.com';
  const REPO_NAME = 'Plaklarim-veri';
  const DATA_FILE = 'plaklar.json';
  const IMAGE_DIR = 'kapaklar';
  const COVERS = ['frontCover', 'backCover'];
  const META = '#durum'; // 'sync' deposunda eşitleme durumu (plak kimlikleri # ile başlamaz)
  const OWN_DB = 'plaklarim';
  const VIEW_DB = 'plaklarim-izle';
  // Bir seferde gönderilen plak ve görsel miktarı; büyük ilk yükleme parça parça
  // kaydedilir, yarıda kalırsa kaldığı yerden sürer.
  const CHUNK_RECORDS = 25;
  const CHUNK_BYTES = 8 * 1024 * 1024;
  // Bu cihazda bir seferde bundan fazla plak silinmiş görünürse sorulur.
  const DELETE_WARN = 3;

  const NAME = /^[A-Za-z0-9._-]{1,100}$/;
  const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/;
  const TOKEN = /^[A-Za-z0-9_]{20,255}$/;
  const SHA = /^[0-9a-f]{40}$/;

  const README = '# Plaklarım verileri\n\n'
    + 'Bu gizli depo Plaklarım uygulamasının plak listesini (`plaklar.json`) ve kapak\n'
    + 'görsellerini (`kapaklar/`) tutar. Uygulama kendisi günceller; elle değiştirme.\n'
    + 'Eski hallere değişiklik geçmişinden (commits) ulaşılabilir.\n';

  // ---------- Ayar ----------

  const valid = (c) => Boolean(c && (c.mode === 'owner' || c.mode === 'viewer')
    && NAME.test(c.owner) && NAME.test(c.repo) && BRANCH.test(c.branch) && TOKEN.test(c.token));

  function loadConfig() {
    try {
      const c = JSON.parse(localStorage.getItem(CONFIG_KEY));
      return valid(c) ? c : null;
    } catch {
      return null;
    }
  }
  let config = loadConfig();
  function saveConfig(next) {
    config = next;
    try {
      if (next) localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      else localStorage.removeItem(CONFIG_KEY);
    } catch { /* gizli sekmede depolama kapalı olabilir */ }
  }
  const dbName = () => (config?.mode === 'viewer' ? VIEW_DB : OWN_DB);
  const sameRepo = (a, b) => Boolean(a && b) && a.owner.toLowerCase() === b.owner.toLowerCase()
    && a.repo.toLowerCase() === b.repo.toLowerCase();

  // Bağlantılar: #/bagla/<…> sahibin başka cihazını bağlar (yazma anahtarı),
  // #/izle/<…> izleme bağlantısıdır (okuma anahtarı).
  const b64url = (text) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // Cihaz bağlantısı varsa izleme anahtarını da taşır; diğer cihazlar da izleme
  // bağlantısını paylaşabilir.
  function linkFor(kind, c, token) {
    const extra = kind === 'bagla' && c.viewToken ? { v: c.viewToken } : {};
    const payload = b64url(JSON.stringify({ o: c.owner, r: c.repo, b: c.branch, t: token, ...extra }));
    return `${location.origin}${location.pathname}#/${kind}/${payload}`;
  }
  const LINK = /#\/(bagla|izle)\/([A-Za-z0-9_-]+)/;
  // Adres çubuğunda yalnızca adresin tamamı bağlantıysa (bir plağın kimliğinin
  // içine gizlenmiş bağlantı sayılmaz).
  const HASH_LINK = /^#\/(bagla|izle)\/([A-Za-z0-9_-]+)$/;
  function parseLink(text) {
    const m = String(text || '').match(LINK);
    if (!m) return null;
    try {
      const p = JSON.parse(atob(m[2].replace(/-/g, '+').replace(/_/g, '/')));
      const c = { mode: m[1] === 'bagla' ? 'owner' : 'viewer', owner: p.o, repo: p.r, branch: p.b, token: p.t };
      if (c.mode === 'owner' && TOKEN.test(p.v || '')) c.viewToken = p.v;
      return valid(c) ? c : null;
    } catch {
      return null;
    }
  }

  let notice = '';

  // Bağlantıdaki ayarı kaydeder. Veritabanı değişecekse (kendi plakları ↔ izlenen
  // liste) true döner; sayfa yeniden yüklenmeli.
  function applyLink(link) {
    if (!link) {
      notice = 'Bağlantı eksik ya da bozuk; tamamını kopyaladığından emin ol.';
      return false;
    }
    const before = dbName();
    if (link.mode === 'viewer') {
      if (config?.mode === 'owner' && sameRepo(config, link)) {
        notice = 'Bu cihaz plaklarını zaten düzenleyebiliyor; izleme bağlantısı başkaları için.';
        return false;
      }
      // Kendi plakları bağlı olan biri başkasını izlerse, izlemeyi bırakınca kendi
      // bağlantısı geri gelir.
      const previous = config?.mode === 'owner' ? config : config?.previous || null;
      saveConfig({ ...link, ...(previous && { previous }) });
      notice = `${link.owner} kullanıcısının plakları bu cihaza indiriliyor. Yalnızca görüntüleyebilirsin.`;
    } else {
      if (config?.mode === 'owner' && sameRepo(config, link) && config.token === link.token) {
        notice = 'Bu cihaz zaten bağlı.';
        return false;
      }
      const own = config?.mode === 'owner' ? config : config?.previous;
      const viewToken = link.viewToken || (own && sameRepo(own, link) && own.viewToken);
      saveConfig({ ...link, ...(viewToken && { viewToken }) });
      notice = 'Bu cihaz bağlandı; plaklar eşitleniyor.';
    }
    return dbName() !== before;
  }

  // Adres çubuğundan gelen bağlantı (biri göndermiş olabilir) sorulmadan
  // kullanılmaz: başkasının listesine bağlanmak bu cihazdaki plakları oraya yükler.
  function confirmLink(link) {
    if (!link || (config && sameRepo(config, link) && (config.mode === link.mode || config.mode === 'owner'))) return true;
    // Bu cihazın kendi listesi (izlerken kenarda duran dahil).
    const own = config?.mode === 'owner' ? config : config?.previous || null;
    const cut = own && !sameRepo(own, link);
    if (link.mode === 'owner') {
      if (own && !cut) return true; // kendi listesine yeniden bağlanıyor
      return confirm(`Bu cihaz ${link.owner} kullanıcısının plak listesine bağlanacak; `
        + (config?.mode === 'viewer' && own ? `kendi plakların da (${own.owner}/${own.repo}) o listeye eklenecek.` : 'bu cihazdaki plaklar da o listeye eklenecek.')
        + (cut ? ` Şu anki bağlantın (${own.owner}/${own.repo}) kesilecek.` : '')
        + '\n\nBağlantıyı sen gönderdiysen "Tamam"a bas.');
    }
    if (config?.mode === 'owner') {
      return confirm(`${link.owner} kullanıcısının plakları bu cihazda gösterilecek (yalnızca görüntüleme). `
        + 'Kendi plakların silinmez; "İzlemeyi bırak" ile geri dönersin. Devam edilsin mi?');
    }
    return true;
  }

  // Adres çubuğundaki bağlantı alınır ve geçmişten silinir (anahtar orada kalmasın).
  function takeLinkFromAddress() {
    if (!HASH_LINK.test(location.hash)) return false;
    const link = parseLink(location.hash);
    history.replaceState(null, '', `${location.pathname}${location.search}#/${link?.mode === 'viewer' ? '' : 'bulut'}`);
    if (!confirmLink(link)) {
      notice = 'Bağlantı kullanılmadı.';
      return false;
    }
    return applyLink(link);
  }

  // Sayfa açılırken: veritabanı daha açılmadı, doğrudan seçilir. İzlemeden
  // kendi listesine geçen cihazda izlenen liste silinir.
  if (takeLinkFromAddress() && dbName() === OWN_DB) indexedDB.deleteDatabase(VIEW_DB);
  DB.useName(dbName());
  // Uygulama açıkken bağlantı açılırsa (app.js'in yönlendirmesinden önce çalışır).
  window.addEventListener('hashchange', async () => {
    if (!HASH_LINK.test(location.hash)) return;
    const viewerBefore = config?.mode === 'viewer';
    if (takeLinkFromAddress()) {
      if (viewerBefore) await DB.clearAll().catch(console.error); // izlenen liste bırakıldı
      location.reload();
      return;
    }
    if (config) schedule(0);
  });

  // ---------- GitHub ----------

  // GitHub'ın sınırları: saatte 5000 istek (sahibin bütün anahtarları, izleme
  // bağlantıları dahil, birlikte sayılır) ve kısa sürede çok yazma ("secondary").
  class ApiError extends Error {
    constructor(status, message, headers) {
      super(message);
      this.status = status;
      this.rateLimited = status === 429 || (status === 403 && (headers?.get('x-ratelimit-remaining') === '0'
        || headers?.has('retry-after') || /rate limit|abuse/i.test(message || '')));
      const after = Number(headers?.get('retry-after'));
      const reset = Number(headers?.get('x-ratelimit-reset'));
      this.retryAt = after ? Date.now() + after * 1000
        : headers?.get('x-ratelimit-remaining') === '0' && reset ? reset * 1000 : 0;
    }
  }

  const rate = { remaining: null, reset: 0 };
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  // Yazma istekleri arasında kısa bir ara (GitHub'ın önerisi).
  let lastWrite = 0;
  async function pace() {
    const wait = lastWrite + 800 - Date.now();
    if (wait > 0) await sleep(wait);
    lastWrite = Date.now();
  }

  // path '/' ile başlıyorsa API köküne, değilse deponun altına gider.
  // Değişebilen bilgiler (dal) her seferinde GitHub'a sorulur; özetiyle (sha)
  // istenen nesneler değişmez, tarayıcının önbelleğinden gelebilir.
  async function github(c, path, { method = 'GET', body, raw = false, token = c.token, fresh = true } = {}) {
    const base = `${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;
    const url = path.startsWith('/') ? API + path : path ? `${base}/${path}` : base;
    if (method !== 'GET') await pace();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: method === 'GET' && fresh ? 'no-cache' : 'default',
      });
    } catch {
      throw new ApiError(0, 'GitHub\'a ulaşılamadı.');
    }
    if (res.headers.has('x-ratelimit-remaining')) {
      rate.remaining = Number(res.headers.get('x-ratelimit-remaining'));
      rate.reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 || 0;
    }
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch { /* gövde yok */ }
      throw new ApiError(res.status, data.message || res.statusText, res.headers);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }

  // now: kullanıcı bir şey denedi (bağlan, bağlantı oluştur); kendiliğinden yeniden denenmez.
  function explain(err, c = config, now = false) {
    const viewer = c?.mode === 'viewer';
    if (!(err instanceof ApiError)) return err?.message || 'Bilinmeyen bir hata oluştu.';
    if (err.status === 0) return now ? 'İnternet bağlantısı yok; bağlanınca yeniden dene.' : 'İnternet bağlantısı yok; bağlanınca eşitlenecek.';
    if (err.rateLimited) {
      return now ? 'GitHub kısa süreliğine sınır koydu; biraz sonra yeniden dene.'
        : 'GitHub kısa süreliğine sınır koydu; biraz sonra kaldığı yerden sürecek.';
    }
    if (err.status === 401) {
      return viewer ? 'Bu izleme bağlantısı artık geçerli değil; yeni bağlantı iste ve İzleme sayfasına yapıştır.'
        : 'Anahtar geçersiz, süresi dolmuş ya da silinmiş. İnternette saklama sayfasında "Anahtarı yenile"ye yeni anahtar gir.';
    }
    if (err.status === 403) {
      return viewer ? 'Bu bağlantının listeyi görme izni yok.'
        : 'Anahtarın yazma izni yok. Anahtarı oluştururken "Contents" iznini "Read and write" seç.';
    }
    if (err.status === 404) {
      return viewer ? 'Bu izleme bağlantısı artık geçerli değil; yeni bağlantı iste ve İzleme sayfasına yapıştır.'
        : `${c?.repo || REPO_NAME} deposu bulunamadı ya da anahtar bu depoya erişemiyor.`;
    }
    return `GitHub hatası (${err.status}): ${err.message}`;
  }

  const branchPath = (c) => c.branch.split('/').map(encodeURIComponent).join('/');

  // Dalın son değişikliği; depo boşsa null.
  async function headCommit(c) {
    try {
      return (await github(c, `git/ref/heads/${branchPath(c)}`)).object.sha;
    } catch (err) {
      if (err.status === 409) return null; // boş depo
      if (err.status === 404) {
        await github(c, ''); // depo yoksa burada 404 olur
        return null; // depo var, dal henüz yok
      }
      throw err;
    }
  }

  const bytesToBase64 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const blobToBase64 = async (blob) => bytesToBase64(new Uint8Array(await blob.arrayBuffer()));

  // Boş depoya ilk dosya; Git veri API'si boş depoda çalışmaz.
  async function initRepo(c) {
    try {
      await github(c, 'contents/README.md', {
        method: 'PUT',
        body: { message: 'Plaklarım veri deposu', content: bytesToBase64(new TextEncoder().encode(README)) },
      });
    } catch (err) {
      if (err.status !== 422) throw err; // 422: başka bir cihaz bu arada oluşturdu
    }
  }

  // Görselin git özeti (GitHub'daki dosya adı ve kimliği).
  async function gitSha(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head);
    all.set(bytes, head.length);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
    return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Plakların internetteki hali ----------

  // Anahtar sırası sabit JSON: aynı plak her cihazda aynı metni verir.
  function canon(v) {
    if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canon(x))).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
        .map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v ?? null);
  }

  const isBlob = (v) => v instanceof Blob;
  // Yalnızca resim türleri; SVG gibi içinde betik taşıyabilen türler kabul edilmez.
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const imageType = (type) => (Object.hasOwn(EXT, String(type).toLowerCase()) ? String(type).toLowerCase() : null);
  const isRef = (v) => Boolean(v) && typeof v === 'object' && SHA.test(v.sha) && Boolean(imageType(v.type));
  const imagePath = (ref) => `${IMAGE_DIR}/${ref.sha}${EXT[ref.type.toLowerCase()]}`;

  // Bu cihazdaki halin izi: görseller boyut ve türleriyle temsil edilir.
  // Son eşitlenen izle aynıysa plak bu cihazda değişmemiştir.
  function fingerprint(record) {
    if (!record) return null;
    const out = {};
    Object.entries(record).forEach(([k, v]) => { out[k] = isBlob(v) ? { blob: v.size, type: v.type } : v; });
    return canon(out);
  }

  // Plağın internetteki hali ve yüklenecek görselleri.
  async function remoteForm(record) {
    const out = {};
    const blobs = [];
    for (const [k, v] of Object.entries(record)) {
      if (COVERS.includes(k)) {
        if (isBlob(v)) {
          const type = imageType(v.type) || 'image/jpeg';
          const ref = { sha: await gitSha(v), type };
          blobs.push({ ...ref, blob: v });
          out[k] = ref;
        } else {
          out[k] = null;
        }
      } else if (!isBlob(v)) {
        out[k] = v;
      }
    }
    return { obj: out, data: canon(out), blobs };
  }

  const validRemote = (r) => Boolean(r) && typeof r === 'object' && !Array.isArray(r)
    && typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(r.id)
    && COVERS.every((k) => r[k] == null || isRef(r[k]));

  function parseData(text) {
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!data || data.app !== 'plaklarim' || !Array.isArray(data.records)) {
      throw new Error(`İnternetteki ${DATA_FILE} okunamadı; elle değiştirildiyse GitHub'daki geçmişten eski haline döndür.`);
    }
    const records = new Map();
    const extra = []; // tanınmayan satırlar olduğu gibi korunur, dokunulmaz
    data.records.forEach((r) => {
      if (validRemote(r) && !records.has(r.id)) records.set(r.id, r);
      else extra.push(r);
    });
    const list = typeof data.list === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.list) ? data.list : null;
    return { records, extra, list };
  }

  // list: listenin kimliği; liste baştan kurulunca (depo silinip yeniden açıldı)
  // değişir ve her cihaz eski eşitleme bilgisini bırakır.
  function buildData(records, extra, list) {
    const lines = [...records.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(canon)
      .concat(extra.map((r) => JSON.stringify(r)));
    const head = `"app":"plaklarim","version":1,${list ? `"list":${JSON.stringify(list)},` : ''}`;
    return `{${head}"records":[\n${lines.join(',\n')}\n]}\n`;
  }

  const emptyRemote = () => ({ commit: null, tree: null, files: new Map(), records: new Map(), extra: [], list: null });

  // Bir değişiklikteki bütün dosyalar ve plaklar.
  let snapshot = null; // son okunan; aynı değişiklik yeniden indirilmez
  async function loadRemote(c, commitSha) {
    const key = `${c.owner}/${c.repo}`.toLowerCase();
    if (snapshot && snapshot.key === key && snapshot.commit === commitSha) return cloneRemote(snapshot);
    const commit = await github(c, `git/commits/${commitSha}`, { fresh: false });
    const tree = await github(c, `git/trees/${commit.tree.sha}?recursive=1`, { fresh: false });
    if (tree.truncated) throw new Error('İnternetteki depo okunamayacak kadar büyük.');
    const files = new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]));
    let parsed = { records: new Map(), extra: [], list: null };
    if (files.has(DATA_FILE)) {
      const res = await github(c, `git/blobs/${files.get(DATA_FILE)}`, { raw: true, fresh: false });
      parsed = parseData(await res.text());
    }
    snapshot = { key, commit: commitSha, tree: commit.tree.sha, files, ...parsed };
    return cloneRemote(snapshot);
  }
  const cloneRemote = (r) => ({ ...r, files: new Map(r.files), records: new Map(r.records), extra: [...r.extra] });

  // Bu oturumda yüklenen görseller (değişiklik yarıda kalırsa yeniden yüklenmez).
  const uploaded = new Set();

  // Plakların bir kısmını tek değişiklik olarak kaydeder; yeni internet halini döner.
  async function commitChunk(c, remote, items) {
    const present = new Set(remote.files.values());
    const blobs = new Map();
    items.forEach((it) => (it.blobs || []).forEach((b) => blobs.set(b.sha, b)));
    const repoKey = `${c.owner}/${c.repo}`.toLowerCase();
    const has = (sha) => present.has(sha) || uploaded.has(`${repoKey}:${sha}`);
    for (const b of blobs.values()) {
      if (has(b.sha)) continue;
      const res = await github(c, 'git/blobs', {
        method: 'POST', body: { content: await blobToBase64(b.blob), encoding: 'base64' },
      });
      if (res.sha !== b.sha) throw new Error('Kapak görseli yüklenirken bozuldu; yeniden denenecek.');
      uploaded.add(`${repoKey}:${b.sha}`);
    }

    const records = new Map(remote.records);
    items.forEach((it) => (it.obj ? records.set(it.id, it.obj) : records.delete(it.id)));
    // Görseller: plaklarda geçenler kalır, geçmeyenler silinir.
    const wanted = new Map();
    // Depoda olmayan bir görsele (elle bozulmuş kayıt) bağlanılmaz; GitHub reddederdi.
    [...records.values(), ...remote.extra].forEach((r) => COVERS.forEach((k) => {
      if (isRef(r?.[k]) && has(r[k].sha)) wanted.set(imagePath(r[k]), r[k].sha);
    }));
    const tree = [{ path: DATA_FILE, mode: '100644', type: 'blob', content: buildData(records, remote.extra, remote.list) }];
    wanted.forEach((sha, path) => {
      if (remote.files.get(path) !== sha) tree.push({ path, mode: '100644', type: 'blob', sha });
    });
    remote.files.forEach((sha, path) => {
      if (path.startsWith(`${IMAGE_DIR}/`) && !wanted.has(path)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    });

    const saved = items.filter((it) => it.obj);
    const removed = items.length - saved.length;
    const title = (r) => `"${String(r.obj.album || r.obj.artist || 'Adsız').slice(0, 60)}"`;
    const message = [
      saved.length === 1 ? `${title(saved[0])} kaydedildi` : saved.length ? `${saved.length} plak kaydedildi` : '',
      removed ? `${removed} plak silindi` : '',
    ].filter(Boolean).join(', ');

    let newTree;
    try {
      newTree = await github(c, 'git/trees', { method: 'POST', body: { base_tree: remote.tree, tree } });
    } catch (err) {
      // Yüklendiği sanılan bir görsel depoda yok (depo yeniden açılmış): yeniden yüklenir.
      if (err.status === 422) uploaded.clear();
      throw err;
    }
    const commit = await github(c, 'git/commits', {
      method: 'POST', body: { message, tree: newTree.sha, parents: [remote.commit] },
    });
    try {
      await github(c, `git/refs/heads/${branchPath(c)}`, { method: 'PATCH', body: { sha: commit.sha } });
    } catch (err) {
      if (err.status === 422 || err.status === 409) err.conflict = true; // başka bir cihaz bu arada kaydetti
      throw err;
    }

    const files = new Map([...remote.files].filter(([path]) => !path.startsWith(`${IMAGE_DIR}/`) || wanted.has(path)));
    wanted.forEach((sha, path) => files.set(path, sha));
    files.set(DATA_FILE, null); // özeti bilinmiyor; yalnızca varlığı önemli
    snapshot = null;
    return { ...remote, commit: commit.sha, tree: newTree.sha, files, records };
  }

  // ---------- Eşitleme ----------

  // Aynı anda birkaç iş: sırayla, en fazla n tanesi birden.
  // Biri hata verirse yenisine başlanmaz; sürenler bitince hata yükseltilir.
  async function pool(list, n, fn) {
    let next = 0;
    let error = null;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
      while (!error && next < list.length) {
        const i = next++;
        try { await fn(list[i], i); } catch (err) { error = error || err; }
      }
    }));
    if (error) throw error;
  }

  const newer = (a, b) => String(a?.updatedAt || '') > String(b?.updatedAt || '');

  async function syncOnce(c) {
    const viewer = c.mode === 'viewer';
    const repoKey = `${c.owner}/${c.repo}`.toLowerCase();
    let meta = await DB.syncGet(META);
    const resetBase = async () => {
      uploaded.clear();
      await DB.syncClear();
      meta = { id: META, repo: repoKey, commit: null, at: null };
      await DB.syncPut(meta);
    };
    if (!meta || meta.repo !== repoKey) {
      // Başka bir depoya bağlanıldı: eski eşitleme bilgisi geçersiz. İzleyen cihazda
      // önceki listenin plakları da silinir.
      if (viewer) {
        await DB.clearAll();
        remoteChanged();
      }
      await resetBase();
    }

    const [locals, stored] = await Promise.all([DB.all(), DB.syncAll()]);
    let entries = new Map(stored.filter((e) => e.id !== META).map((e) => [e.id, e]));
    const local = new Map(locals.map((r) => [r.id, r]));
    const fps = new Map(locals.map((r) => [r.id, fingerprint(r)]));
    const localChanged = locals.some((r) => entries.get(r.id)?.fp !== fps.get(r.id))
      || [...entries.keys()].some((id) => !local.has(id));

    let head = await headCommit(c);
    if (head === meta.commit && !localChanged) return finish(meta, head, 0);

    let remote = head ? await loadRemote(c, head) : emptyRemote();
    // İnternetteki liste yoksa (depo silinip yeniden açılmış ya da boşaltılmış) ya da
    // başka bir cihaz onu baştan kurmuşsa (kimliği değişmiş), eski eşitleme bilgisi
    // geçersizdir: plakların silindiği anlamına gelmez. İki taraftaki plaklar
    // birleştirilir (aynı plakta son değiştirilen kalır), hiçbiri silinmez.
    const fresh = !remote.files.has(DATA_FILE);
    if (!viewer && entries.size && (fresh || remote.list !== (meta.list ?? null))) {
      await resetBase();
      entries = new Map();
    }
    if (fresh) remote.list = DB.newId();
    if (!viewer && meta.list !== remote.list) {
      meta = { ...meta, list: remote.list };
      await DB.syncPut(meta);
    }
    const skip = new Set(remote.extra.map((r) => r?.id).filter((id) => typeof id === 'string'));

    // Her plak için ne yapılacağı.
    const pulls = []; // internetteki hali buraya
    const drops = []; // bu cihazdan sil
    const pushes = []; // bu cihazdaki hali internete
    const removes = []; // internetten sil
    const settles = []; // ikisi zaten aynı; yalnızca eşitleme kaydı
    const ids = new Set([...local.keys(), ...remote.records.keys(), ...entries.keys()]);
    for (const id of ids) {
      if (skip.has(id)) continue;
      const L = local.get(id);
      const R = remote.records.get(id);
      const E = entries.get(id);
      const lfp = L ? fps.get(id) : null;
      const rdata = R ? canon(R) : null;
      if (viewer) {
        if (R && !(E && L && E.data === rdata && E.fp === lfp)) pulls.push({ id, R, rdata, lfp });
        else if (!R && (L || E)) drops.push({ id, lfp });
        continue;
      }
      const lState = E ? (L ? (E.fp === lfp ? 'same' : 'changed') : 'deleted') : (L ? 'new' : 'none');
      const rState = E ? (R ? (E.data === rdata ? 'same' : 'changed') : 'deleted') : (R ? 'new' : 'none');
      if (lState === 'same') {
        if (rState === 'changed') pulls.push({ id, R, rdata, lfp });
        else if (rState === 'deleted') drops.push({ id, lfp });
      } else if (lState === 'deleted') {
        if (rState === 'same') removes.push({ id });
        else if (rState === 'changed') pulls.push({ id, R, rdata, lfp });
        else settles.push({ id, gone: true });
      } else if (lState === 'none') {
        if (R) pulls.push({ id, R, rdata, lfp });
      } else {
        // Bu cihazda değişti ya da yeni.
        pushes.push({ id, L, R, rdata, lfp });
      }
    }

    // Toplu silme beklenmedik bir durumdur (tek tek silinir); önce sorulur.
    if (!viewer && removes.length > DELETE_WARN && !await confirmDelete(
      `Bu cihazda ${removes.length} plak silinmiş görünüyor. İnternetteki listeden de silinsin mi?\n\n`
      + '"İptal" dersen bu plaklar internetten geri getirilir.',
    )) {
      removes.splice(0).forEach(({ id }) => {
        const R = remote.records.get(id);
        pulls.push({ id, R, rdata: canon(R), lfp: null });
      });
    }
    if (!viewer && drops.length > DELETE_WARN && !await confirmDelete(
      `İnternetteki listeden ${drops.length} plak silinmiş. Bu cihazdan da silinsin mi?\n\n`
      + '"İptal" dersen bu plaklar bu cihazdan yeniden yüklenir.',
    )) {
      drops.splice(0).forEach(({ id }) => pushes.push({ id, L: local.get(id), R: null, rdata: null, lfp: fps.get(id) }));
    }

    let skipped = 0;
    let pulled = 0;
    const total = pulls.length + drops.length;
    const progress = () => setStatus({ state: 'busy', progress: true, text: `İndiriliyor: ${pulled} / ${total} plak` });

    // Bu cihazda değişmemiş plakların görselleri yeniden indirilmez.
    const images = new Map();
    if (pulls.length) {
      locals.forEach((L) => {
        const E = entries.get(L.id);
        if (!E || E.fp !== fps.get(L.id)) return;
        try {
          const data = JSON.parse(E.data);
          COVERS.forEach((k) => { if (isRef(data[k]) && isBlob(L[k])) images.set(data[k].sha, L[k]); });
        } catch { /* bozuk kayıt: görseller indirilir */ }
      });
    }
    async function image(ref) {
      if (!images.has(ref.sha)) {
        images.set(ref.sha, (async () => {
          // İzleyenler sahibin saatlik istek hakkını paylaşır; azalınca durup sonra sürer.
          if (viewer && rate.remaining !== null && rate.remaining < 1500) {
            const err = new ApiError(429, 'budget');
            err.retryAt = rate.reset;
            throw err;
          }
          const res = await github(c, `git/blobs/${ref.sha}`, { raw: true, fresh: false });
          return new Blob([await res.arrayBuffer()], { type: imageType(ref.type) || 'image/jpeg' });
        })());
      }
      return images.get(ref.sha);
    }

    let lastShown = Date.now();
    const shown = () => {
      // Uzun indirmede liste arada bir yenilenir.
      if (Date.now() - lastShown > 3000) { lastShown = Date.now(); remoteChanged(); }
    };
    if (total > 3) progress();
    await pool(pulls, 2, async ({ id, R, rdata, lfp }) => {
      const next = { ...R };
      for (const k of COVERS) if (k in R) next[k] = R[k] ? await image(R[k]) : null;
      const done = await DB.swap(id, (cur) => fingerprint(cur) === lfp, next, { id, fp: fingerprint(next), data: rdata });
      if (!done) skipped++;
      pulled++;
      if (total > 3) progress();
      shown();
    });
    for (const { id, lfp } of drops) {
      if (!await DB.swap(id, (cur) => fingerprint(cur) === lfp, null, null)) skipped++;
      pulled++;
    }
    for (const s of settles) await DB.syncRemove(s.id);
    if (total) remoteChanged();

    // Gönderilecekler: önce internetteki haliyle karşılaştırılır.
    const outgoing = [];
    for (const p of pushes) {
      const form = await remoteForm(p.L);
      if (p.R && form.data === p.rdata) {
        await DB.syncPut({ id: p.id, fp: p.lfp, data: p.rdata });
        continue;
      }
      if (p.R && entries.get(p.id)?.data !== p.rdata && !newer(p.L, p.R)) {
        // İkisinde de değişmiş ve bu cihazdaki daha yeni değil: internetteki kalır.
        const next = { ...p.R };
        for (const k of COVERS) if (k in p.R) next[k] = p.R[k] ? await image(p.R[k]) : null;
        if (!await DB.swap(p.id, (cur) => fingerprint(cur) === p.lfp, next, { id: p.id, fp: fingerprint(next), data: p.rdata })) skipped++;
        remoteChanged();
        continue;
      }
      outgoing.push({ id: p.id, obj: form.obj, data: form.data, blobs: form.blobs, lfp: p.lfp });
    }
    removes.forEach(({ id }) => outgoing.push({ id, obj: null }));

    if (outgoing.length) {
      if (!remote.commit) {
        await initRepo(c);
        head = await headCommit(c);
        remote = await loadRemote(c, head);
        remote.list = remote.list || meta.list;
        if (remote.files.has(DATA_FILE)) {
          // Başka bir cihaz bu arada kaydetti: onun plakları alınarak yeniden planlanır.
          const err = new Error('yeniden');
          err.conflict = true;
          throw err;
        }
      }
      const present = new Set(remote.files.values());
      let sent = 0;
      const showSend = () => {
        if (outgoing.length > 3) setStatus({ state: 'busy', progress: true, text: `Yükleniyor: ${sent} / ${outgoing.length} plak` });
      };
      showSend();
      for (let i = 0; i < outgoing.length;) {
        const chunk = [];
        let bytes = 0;
        while (i < outgoing.length && chunk.length < CHUNK_RECORDS) {
          const it = outgoing[i];
          const size = (it.blobs || []).filter((b) => !present.has(b.sha)).reduce((n, b) => n + b.blob.size, 0);
          if (chunk.length && bytes + size > CHUNK_BYTES) break;
          chunk.push(it);
          bytes += size;
          i++;
        }
        remote = await commitChunk(c, remote, chunk);
        remote.files.forEach((sha) => present.add(sha));
        for (const it of chunk) {
          if (it.obj) await DB.syncPut({ id: it.id, fp: it.lfp, data: it.data });
          else await DB.syncRemove(it.id);
        }
        sent += chunk.length;
        showSend();
      }
    }

    // Bu arada bu cihazda değişen plak olduysa bir sonraki eşitlemede ele alınır.
    return finish(meta, remote.commit, pulled, skipped > 0);
  }

  // retry: bazı plaklar bu arada bu cihazda değişti; internetteki hal bir sonraki
  // eşitlemede yeniden okunur.
  async function finish(meta, commit, pulled, retry = false) {
    const at = new Date().toISOString();
    await DB.syncPut({ ...meta, commit: retry ? null : commit, at });
    lastAt = at;
    if (retry) schedule(2000);
    return pulled;
  }

  // ---------- Zamanlama ve durum ----------

  let status = { state: config ? 'idle' : 'off', text: '' };
  let lastAt = null;
  let lastRun = 0;
  const statusListeners = [];
  const remoteListeners = [];
  function setStatus(next) {
    status = next;
    statusListeners.forEach((fn) => { try { fn(status); } catch (err) { console.error(err); } });
  }
  function remoteChanged() {
    remoteListeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
  }
  let confirmDelete = async (message) => confirm(message);

  let timer = 0;
  let running = null;
  let again = false;
  let started = false;
  let blockedUntil = 0; // GitHub sınır koyduysa o zamana kadar kendiliğinden denenmez
  function schedule(delay) {
    if (!config || !started) return;
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(delay, blockedUntil - Date.now()));
  }

  // Aynı cihazda birden fazla sekme açıksa eşitleme sırayla yapılır.
  const withLock = (fn) => (navigator.locks?.request ? navigator.locks.request('plaklarim-bulut', fn) : fn());

  function run() {
    clearTimeout(timer);
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        await syncWithRetry();
      } while (again && config);
    })().finally(() => { running = null; });
    return running;
  }

  async function syncWithRetry() {
    const c = config;
    // Sayfa başka veritabanına geçmek üzere yeniden yükleniyorsa eşitlenmez.
    if (!c || !DB.useName(dbName())) return;
    lastRun = Date.now();
    setStatus({ state: 'busy', text: 'Eşitleniyor…' });
    for (let attempt = 0; ; attempt++) {
      try {
        await withLock(() => syncOnce(c));
        blockedUntil = 0;
        if (config === c) setStatus({ state: 'ok', text: '', at: lastAt });
        return;
      } catch (err) {
        if (err.conflict && attempt < 3) continue; // başka cihazın değişikliği alınıp yeniden denenir
        console.error(err);
        if (config !== c) return;
        const offline = err instanceof ApiError && err.status === 0;
        const revoked = [401, 404].includes(err.status);
        // İzleme bağlantısı geri alındıysa indirilen liste bu cihazdan da kalkar.
        if (revoked && c.mode === 'viewer') {
          await DB.clearAll().catch(console.error);
          remoteChanged();
        }
        setStatus({ state: offline ? 'offline' : 'error', text: explain(err, c), code: err.rateLimited ? 429 : err.status || 0, at: lastAt });
        if (err.rateLimited) {
          blockedUntil = Math.max(err.retryAt || 0, Date.now() + 60000);
          if (!err.retryAt) blockedUntil = Date.now() + 15 * 60000;
          schedule(0);
        } else if (!offline && !revoked) {
          // Kullanıcının düzeltmesi gerekenler (anahtar, depo) kendiliğinden denenmez.
          schedule(5 * 60000);
        }
        return;
      }
    }
  }

  // app.js açılıştaki düzeltmeler bitince çağırır.
  async function start() {
    if (started) return;
    started = true;
    DB.onChange(() => { if (config?.mode === 'owner') schedule(1500); });
    window.addEventListener('online', () => schedule(0));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > 30000) schedule(0);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > 4 * 60000) schedule(0);
    }, 60000);
    if (config) {
      try { lastAt = (await DB.syncGet(META))?.at || null; } catch { /* önemli değil */ }
      setStatus({ state: 'idle', text: '', at: lastAt });
      run();
    }
  }

  // ---------- Ayar ekranının işleri ----------

  // Yalnızca depo seçilebilen yeni tip anahtarlar (github_pat_…); eski tip (classic)
  // anahtarlar bütün depolara erişir.
  function checkToken(token) {
    if (/^gh[opsu]_/.test(token)) {
      throw new Error('Bu eski tip (classic) bir anahtar ve bütün depolarını açar. Sayfadaki "Anahtar oluştur" düğmesiyle yeni tip anahtar oluştur.');
    }
    if (!TOKEN.test(token) || !token.startsWith('github_pat_')) {
      throw new Error('Bu bir GitHub anahtarına benzemiyor. "github_pat_" ile başlayan anahtarın tamamını yapıştır.');
    }
  }

  // Anahtar Plaklarim-veri dışında başka gizli bir depoyu da okuyabiliyorsa o deponun
  // adı döner. Bağlantıyla paylaşılan anahtar yalnızca bu depoya erişmeli.
  async function otherRepoReadable(c, token) {
    let list;
    try {
      list = await github(c, '/user/repos?visibility=private&per_page=100', { token });
    } catch {
      return null; // anlaşılamadı; engellenmez
    }
    const self = `${c.owner}/${c.repo}`.toLowerCase();
    const others = (Array.isArray(list) ? list : [])
      .filter((r) => typeof r?.full_name === 'string' && r.full_name.toLowerCase() !== self).slice(0, 3);
    for (const r of others) {
      const path = r.full_name.split('/').map(encodeURIComponent).join('/');
      try {
        await github(c, `/repos/${path}/git/ref/heads/${encodeURIComponent(r.default_branch || 'main')}`, { token });
        return r.full_name;
      } catch (err) {
        if (err.status === 409) return r.full_name; // boş depo ama erişebiliyor
      }
    }
    return null;
  }
  const scopeError = (c, other) => new Error(`Bu anahtar başka bir gizli deponu da (${other}) açabiliyor. `
    + `GitHub'da bu anahtarı sil; yenisini oluştururken "Only select repositories" altında yalnızca ${c.repo}'yi seç.`);

  // Yapıştırılan anahtarı ya da bağlantıyı kullanır. Sayfa yeniden yüklenecekse
  // 'reload' döner.
  async function connect(text) {
    const input = String(text || '').trim();
    if (LINK.test(input)) {
      const viewerBefore = config?.mode === 'viewer';
      const link = parseLink(input);
      if (!link) throw new Error('Bağlantı eksik ya da bozuk; tamamını kopyaladığından emin ol.');
      if (!confirmLink(link)) throw new Error('Bağlantı kullanılmadı.');
      if (applyLink(link)) {
        if (viewerBefore) await DB.clearAll();
        return 'reload';
      }
      run();
      const n = notice;
      notice = '';
      return n;
    }
    const token = input.replace(/^(Bearer|token)\s+/i, '');
    checkToken(token);
    const probe = { owner: '-', repo: '-', branch: 'main', token };
    let user;
    try {
      user = await github(probe, '/user');
    } catch (err) {
      throw new Error(err.status === 401 ? 'Anahtar geçersiz ya da süresi dolmuş.' : explain(err, probe, true));
    }
    let repo;
    try {
      repo = await github({ ...probe, owner: user.login, repo: REPO_NAME }, '');
    } catch (err) {
      if (err.status === 404) {
        throw new Error(`${REPO_NAME} deposu bulunamadı. Depoyu oluşturduğundan ve anahtarı oluştururken "Only select repositories" altında bu depoyu seçtiğinden emin ol.`);
      }
      throw new Error(explain(err, probe, true));
    }
    if (!repo.private) {
      throw new Error(`${REPO_NAME} deposu herkese açık; plakların herkese görünür olur. GitHub'da depo ayarlarından "Private" yap, sonra yeniden dene.`);
    }
    const c = { mode: 'owner', owner: repo.owner.login, repo: repo.name, branch: repo.default_branch || 'main', token };
    // Yazma izni denenir: boş depoya ilk dosya yazılır, dolu depoya küçük bir nesne.
    try {
      if (await headCommit(c)) await github(c, 'git/blobs', { method: 'POST', body: { content: 'plaklarim', encoding: 'utf-8' } });
      else await initRepo(c);
    } catch (err) {
      throw new Error(explain(err, c, true));
    }
    // Cihaz bağlantısıyla taşınacak anahtar başka depoları açmamalı.
    const other = await otherRepoReadable(c, token);
    if (other) throw scopeError(c, other);
    const viewerBefore = config?.mode === 'viewer';
    const own = config?.mode === 'owner' ? config : config?.previous;
    const keepView = own && sameRepo(own, c) && own.viewToken;
    saveConfig({ ...c, ...(keepView && { viewToken: keepView }) });
    if (!DB.useName(dbName())) {
      if (viewerBefore) await DB.clearAll();
      return 'reload';
    }
    run();
    return 'Bağlandı; plaklar eşitleniyor.';
  }

  // İzleme bağlantısı: yalnızca okuyabilen ayrı bir anahtarla. Yazabilen anahtar
  // kabul edilmez (izleyenler listeyi değiştirebilirdi).
  async function makeViewLink(text) {
    const c = config;
    if (c?.mode !== 'owner') throw new Error('Önce bu cihazı bağla.');
    const token = String(text || '').trim().replace(/^(Bearer|token)\s+/i, '');
    checkToken(token);
    if (token === c.token) throw new Error('Bu, bu cihazın yazma anahtarı. İzleme için yalnızca okuma izni olan ayrı bir anahtar oluştur.');
    try {
      await github(c, '', { token });
      await github(c, `git/ref/heads/${branchPath(c)}`, { token }); // listeyi okuyabiliyor mu
    } catch (err) {
      if (err.status === 401) throw new Error('Anahtar geçersiz ya da süresi dolmuş.');
      if (err.status === 404) throw new Error(`Bu anahtar ${c.repo} deposunu göremiyor; anahtarı oluştururken bu depoyu seç.`);
      if (err.status === 403 && !err.rateLimited) throw new Error('Bu anahtar listeyi okuyamıyor; "Contents" iznini "Read-only" seç.');
      throw new Error(explain(err, c, true));
    }
    // Yazma denemesi: yalnızca GitHub'ın açık "izin yok" cevabı salt okunur sayılır;
    // sınır ya da geçici hata gibi başka her cevapta bağlantı oluşturulmaz.
    try {
      await github(c, 'git/blobs', { method: 'POST', token, body: { content: 'plaklarim', encoding: 'utf-8' } });
      throw new Error('Bu anahtar plaklarını değiştirebiliyor. İzleme için "Contents" izni "Read-only" olan ayrı bir anahtar oluştur.');
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (!(err.status === 403 && !err.rateLimited && /not accessible/i.test(err.message))) throw new Error(explain(err, c, true));
    }
    const other = await otherRepoReadable(c, token);
    if (other) throw scopeError(c, other);
    saveConfig({ ...c, viewToken: token });
    return linkFor('izle', c, token);
  }

  // Paylaşılacak izleme bağlantısı hâlâ çalışıyor mu (okuma anahtarı silinmiş olabilir).
  // Çalışmıyorsa unutulur; false döner.
  async function checkViewLink() {
    const c = config;
    if (c?.mode !== 'owner' || !c.viewToken) return false;
    try {
      await github(c, `git/ref/heads/${branchPath(c)}`, { token: c.viewToken });
      return true;
    } catch (err) {
      if (![401, 403, 404].includes(err.status) || err.rateLimited) return true; // anlaşılamadı
      if (config === c) saveConfig({ ...c, viewToken: undefined });
      return false;
    }
  }

  function disconnect() {
    saveConfig(null);
    clearTimeout(timer);
    setStatus({ state: 'off', text: '' });
  }

  // İzlemeyi bırakır: indirilen liste silinir, varsa kendi bağlantısı geri gelir.
  async function stopViewing() {
    if (config?.mode !== 'viewer') return;
    await DB.clearAll();
    saveConfig(config.previous || null);
  }

  const enc = encodeURIComponent;
  // GitHub'da anahtar adları tekrarlanamaz; ada tarih eklenir.
  const tokenUrl = (name, description, access) => 'https://github.com/settings/personal-access-tokens/new'
    + `?name=${enc(`${name} ${new Date().toLocaleString('tr')}`)}&description=${enc(description)}`
    + `&expires_in=none&contents=${access}`;

  return {
    REPO_NAME,
    start,
    connect,
    makeViewLink,
    checkViewLink,
    disconnect,
    stopViewing,
    syncNow: () => run(),
    viewer: () => config?.mode === 'viewer',
    // Ekranda gösterilecek bilgiler (anahtarlar hariç).
    info: () => (config ? {
      mode: config.mode, owner: config.owner, repo: config.repo, hasViewLink: Boolean(config.viewToken),
    } : null),
    deviceLink: () => (config?.mode === 'owner' ? linkFor('bagla', config, config.token) : ''),
    viewLink: () => (config?.mode === 'owner' && config.viewToken ? linkFor('izle', config, config.viewToken) : ''),
    status: () => status,
    takeNotice: () => { const n = notice; notice = ''; return n; },
    onStatus: (fn) => statusListeners.push(fn),
    onRemoteChange: (fn) => remoteListeners.push(fn),
    setConfirm: (fn) => { confirmDelete = fn; },
    links: {
      newRepo: `https://github.com/new?name=${REPO_NAME}&visibility=private&description=${enc('Plaklarım uygulamasının verileri')}`,
      get writeToken() { return tokenUrl('Plaklarım', 'Plaklarım uygulaması: plakları kaydetme', 'write'); },
      get readToken() { return tokenUrl('Plaklarım izleme', 'Plaklarım uygulaması: listeyi yalnızca görme', 'read'); },
      tokens: 'https://github.com/settings/personal-access-tokens',
    },
    // Testler için.
    _internal: { canon, fingerprint, gitSha, parseLink, buildData, parseData },
  };
})();
