// Uygulama içi kamera. Telefonun kendi kamerası çekimden sonra "Fotoğrafı kullan /
// Yeniden çek" diye sorar; burada deklanşöre basınca kare doğrudan köşe ekranına
// gider, beğenilmezse oradan tekrar çekilir. Kamera bir kez açılır ve close()
// çağrılana kadar açık kalır; böylece tekrar çekmek beklemeden olur.
const Camera = (() => {
  const supported = () => Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

  function errorText(err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'Kameraya izin verilmedi.';
    if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'Kamera bulunamadı.';
    return 'Kamera açılamadı.';
  }

  function open() {
    const overlay = document.createElement('div');
    overlay.className = 'camera';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="camera-stage">
        <video playsinline muted autoplay></video>
        <div class="camera-guide"></div>
        <div class="camera-msg">
          <p>Kamera açılıyor…</p>
          <label class="btn primary" hidden>Telefonun kamerasıyla çek
            <input type="file" accept="image/*" capture="environment" hidden>
          </label>
        </div>
      </div>
      <div class="camera-actions">
        <button type="button" class="btn" data-act="cancel">Vazgeç</button>
        <button type="button" class="shutter" data-act="shoot" aria-label="Fotoğraf çek" disabled></button>
        <span></span>
      </div>`;
    const video = overlay.querySelector('video');
    const msg = overlay.querySelector('.camera-msg');
    const msgText = msg.querySelector('p');
    const nativeBtn = msg.querySelector('label');
    const shutter = overlay.querySelector('.shutter');
    document.body.append(overlay);

    let stream = null;
    let starting = null;
    let finish = null; // açık olan shoot() çağrısını sonuçlandırır
    let closed = false;

    const live = () => Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live'));
    function start() {
      if (live()) return Promise.resolve();
      starting ??= (async () => {
        shutter.disabled = true;
        msg.hidden = false;
        msgText.textContent = 'Kamera açılıyor…';
        nativeBtn.hidden = true;
        try {
          stream?.getTracks().forEach((t) => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } },
          });
          if (closed) { // açılırken kapatıldı
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play();
          msg.hidden = true;
          shutter.disabled = false;
        } catch (err) {
          console.error(err);
          msgText.textContent = `${errorText(err)} Telefonun kendi kamerasıyla çekebilirsin.`;
          nativeBtn.hidden = false;
        } finally {
          starting = null;
        }
      })();
      return starting;
    }

    // Telefon uyuyup uyanınca ya da başka uygulamaya geçip dönünce kamera kapanır; yeniden aç.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !overlay.hidden) start();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Telefonun geri tuşuyla başka ekrana geçilirse kamerayı bırak.
    const onLeave = () => finish?.(null);
    window.addEventListener('hashchange', onLeave);

    function frame() {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return canvas;
    }

    overlay.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') finish?.(null);
      if (act === 'shoot' && video.videoWidth) finish?.(frame());
    });
    nativeBtn.querySelector('input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) finish?.(file);
    });

    // Bir kare çeker: canvas (kamera), File (telefonun kamerası) ya da vazgeçilirse null.
    function shoot() {
      overlay.hidden = false;
      document.body.classList.add('no-scroll');
      start();
      return new Promise((resolve) => {
        finish = (value) => {
          finish = null;
          overlay.hidden = true;
          document.body.classList.remove('no-scroll');
          resolve(value);
        };
      });
    }

    function close() {
      closed = true;
      finish?.(null);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('hashchange', onLeave);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      overlay.remove();
    }

    return { shoot, close };
  }

  return { supported, open };
})();
