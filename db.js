// Plak kayıtlarını tarayıcının IndexedDB veritabanında saklar.
// Kapak görselleri Blob olarak tutulur; yedek dosyasında base64'e çevrilir.
// 'sync' deposu internetteki kopyayla son eşitlenen hali tutar (bkz. bulut.js).
const DB = (() => {
  let name = 'plaklarim';
  const VERSION = 2;
  const STORE = 'records';
  const SYNC = 'sync';
  let dbPromise;
  const listeners = [];

  // Başka birinin plaklarını izleyen cihaz ayrı veritabanı kullanır; kendi plakları
  // karışmaz. Veritabanı açılmadan önce çağrılmalı; açıldıysa false döner.
  function useName(next) {
    if (dbPromise) return next === name;
    name = next;
    return true;
  }

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(name, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('artist', 'artist');
          }
          if (!db.objectStoreNames.contains(SYNC)) db.createObjectStore(SYNC, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          // Yeni sürüm başka sekmede açılınca bu bağlantı kapanır, yoksa onu bekletirdi.
          req.result.onversionchange = () => req.result.close();
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
        // Eski sürüm başka bir pencerede açıksa yeni sürüm onun kapanmasını bekler.
        req.onblocked = () => {
          const view = document.getElementById('view');
          if (view) view.innerHTML = '<p class="empty">Plaklarım başka bir pencerede de açık. Onu kapatıp bu sayfayı yenile.</p>';
        };
      });
    }
    return dbPromise;
  }

  // fn depoları alır (tek depoda doğrudan depoyu); sonucu işlem bitince döner.
  async function tx(mode, fn, stores = STORE) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const arg = Array.isArray(stores) ? stores.map((s) => t.objectStore(s)) : t.objectStore(stores);
      let result;
      Promise.resolve(fn(arg)).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  function newId() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Kaydedilecek plaktaki görseller (kapaklar) bellekte yeni bir kopyaya alınır.
  // Veritabanından okunan görsel olduğu gibi yeniden kaydedilince iPhone'da
  // (Safari) bozulabiliyor: plak düzenlenip kaydedilince kapaklar görünmüyordu.
  // Okunamayan (zaten bozuk) görsel olduğu gibi bırakılır; adı unreadable'da döner.
  async function detach(record) {
    const copy = { ...record };
    const unreadable = [];
    for (const [key, value] of Object.entries(record)) {
      if (!(value instanceof Blob)) continue;
      try {
        copy[key] = new Blob([await value.arrayBuffer()], { type: value.type });
      } catch (err) {
        console.error(err);
        unreadable.push(key);
      }
    }
    return { copy, unreadable };
  }

  // Kullanıcının yaptığı değişiklikler (kaydet, sil, geri yükle) dinleyicilere bildirilir.
  const changed = (result) => {
    listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    return result;
  };

  return {
    newId,
    useName,
    onChange: (fn) => listeners.push(fn),
    all: () => tx('readonly', (s) => request(s.getAll())),
    get: (id) => tx('readonly', (s) => request(s.get(id))),
    // Bozuk görsel yüzünden kaydedilemezse plak o görsel olmadan kaydedilir.
    put: async (record) => {
      const { copy, unreadable } = await detach(record);
      try {
        await tx('readwrite', (s) => request(s.put(copy)));
      } catch (err) {
        if (!unreadable.length) throw err;
        console.error(err);
        unreadable.forEach((key) => { copy[key] = null; });
        await tx('readwrite', (s) => request(s.put(copy)));
      }
      return changed(copy.id);
    },
    remove: (id) => tx('readwrite', (s) => request(s.delete(id))).then(changed),

    // Eşitleme: plak, check(şimdiki hali) doğruysa next ile değiştirilir (next null ise
    // silinir) ve eşitleme kaydı (entry; null ise silinir) aynı işlemde yazılır.
    // Bu arada plak bu cihazda değiştirildiyse dokunulmaz, false döner.
    swap: async (id, check, next, entry) => {
      const copy = next && (await detach(next)).copy;
      return tx('readwrite', ([records, sync]) => new Promise((resolve) => {
        const get = records.get(id);
        get.onsuccess = () => {
          if (!check(get.result)) { resolve(false); return; }
          if (copy) records.put(copy); else records.delete(id);
          if (entry) sync.put(entry); else sync.delete(id);
          resolve(true);
        };
      }), [STORE, SYNC]);
    },
    syncAll: () => tx('readonly', (s) => request(s.getAll()), SYNC),
    syncGet: (id) => tx('readonly', (s) => request(s.get(id)), SYNC),
    syncPut: (entry) => tx('readwrite', (s) => request(s.put(entry)), SYNC),
    syncRemove: (id) => tx('readwrite', (s) => request(s.delete(id)), SYNC),
    syncClear: () => tx('readwrite', (s) => request(s.clear()), SYNC),
    // İzleme bırakılınca o veritabanı boşaltılır.
    clearAll: () => tx('readwrite', ([records, sync]) => { records.clear(); sync.clear(); }, [STORE, SYNC]),
  };
})();
