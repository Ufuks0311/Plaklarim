// Plak kayıtlarını tarayıcının IndexedDB veritabanında saklar.
// Kapak görselleri Blob olarak tutulur; yedek dosyasında base64'e çevrilir.
const DB = (() => {
  const NAME = 'plaklarim';
  const VERSION = 1;
  const STORE = 'records';
  let dbPromise;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('artist', 'artist');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; });
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

  return {
    newId,
    all: () => tx('readonly', (s) => request(s.getAll())),
    get: (id) => tx('readonly', (s) => request(s.get(id))),
    put: (record) => tx('readwrite', (s) => request(s.put(record))),
    remove: (id) => tx('readwrite', (s) => request(s.delete(id))),
  };
})();
