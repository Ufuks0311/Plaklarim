// Tam ekran katmanlar (kamera, köşe ekranı) açıkken telefonun geri tuşu ya da
// kenardan kaydırma sayfadan çıkmak yerine katmanları kapatır; form olduğu gibi
// kalır. İlk katman açılınca geçmişe aynı adreste bir adım eklenir, son katman
// kendiliğinden kapanınca bu adım geri alınır.
const Overlay = (() => {
  const open = new Set();
  let id = 0;

  function closeAll() {
    [...open].forEach((close) => close());
  }
  window.addEventListener('popstate', () => { if (open.size) closeAll(); });
  window.addEventListener('hashchange', () => { if (open.size) closeAll(); });

  // close: katmanı "Vazgeç"e basılmış gibi kapatır. Dönen işlev, katman
  // kapanınca (hangi yolla olursa olsun) bir kez çağrılmalıdır.
  function add(close) {
    if (!open.size) {
      id += 1;
      history.pushState({ plaklarimOverlay: id }, '');
    }
    open.add(close);
    return () => {
      if (!open.delete(close)) return;
      if (!open.size && history.state?.plaklarimOverlay === id) history.back();
    };
  }

  return { add };
})();
