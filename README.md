# Plaklarım

Sahip olduğun plakların arşivi. Telefonda tarayıcıdan açılır, ana ekrana
uygulama gibi eklenebilir ve internet olmadan da çalışır.

Her plak için saklananlar:

- Ön kapak ve arka kapak görseli (görsel kutusuna dokununca kamera açılır; galeriden de seçilebilir;
  fotoğraftaki kapağın dört köşesi otomatik bulunur, eğiklik ve perspektif düzeltilerek
  kapak tam kareye oturtulur; köşeler gerekirse elle sürüklenebilir)
- Koleksiyon sıra numarası, sanatçı, albüm adı, yıl, tür, plak şirketi
- A yüzü ve B yüzü şarkıları; her şarkı sıra numarası (A1, A2, B1…), adı ve söyleyeniyle ayrı tutulur (karma plaklar için)
- Notlar (baskı, durum, nereden alındığı…)

Liste ekranında sanatçı, albüm ya da şarkı adına göre arama yapılabilir.

## Kapaktan otomatik doldurma

Ön kapak fotoğrafı yüklenince sanatçı ve albüm adı, arka kapak fotoğrafı
yüklenince A ve B yüzü şarkıları kendiliğinden doldurulur. Okumayı Claude
(Anthropic) görsel tanıma yapar:

- Sağ üstteki **⋮ → Kapak okuma ayarı**'na bir Anthropic API anahtarı
  yapıştır (console.anthropic.com → API Keys). Anahtar yalnızca o cihazdaki
  tarayıcıda saklanır, başka hiçbir yere gönderilmez.
- Ücretlidir: kapak başına birkaç kuruşluk API kullanımı. Anahtar girilmezse
  uygulama eskisi gibi elle doldurularak çalışır.
- Elle yazdığın alanların üzerine yazılmaz; şarkı listesi doluysa değiştirmeden
  önce sorar. Okunan bilgileri kaydetmeden önce kontrol et.

## İnternetten yıl, tür ve plak şirketi

Formdaki **Yıl, tür ve plak şirketini internetten bul** düğmesi, sanatçı ve
albüm adına göre bu bilgileri [MusicBrainz](https://musicbrainz.org) müzik
veritabanından getirir. Ücretsizdir, anahtar gerekmez. Kapaktan sanatçı ve
albüm okunduğunda arama kendiliğinden yapılır. Yalnızca boş alanlar doldurulur;
plak baskısı varsa onun yılı ve plak şirketi tercih edilir.

## Veriler nerede duruyor?

Kayıtlar ve görseller, uygulamayı açtığın tarayıcının kendi veritabanında
(IndexedDB) saklanır. Sunucu, hesap ya da ücret yoktur; veriler yalnızca
senin telefonunda durur.

Bu yüzden ara sıra sağ üstteki **⋮ → Yedeği indir** ile yedek al. Yedek dosyası
tüm plakları ve kapak görsellerini içerir; telefon değiştirdiğinde ya da
tarayıcı verisini sildiğinde **⋮ → Yedekten geri yükle** ile geri alırsın.

Kareye oturtulan kapaklar kaydedilirken en fazla 1600×1600 piksele küçültülür,
böylece yüzlerce plak bile az yer kaplar.

## Telefona kurulum

Uygulama GitHub Pages üzerinden ücretsiz yayınlanır:

1. Depoda **Settings → Pages → Build and deployment** bölümünde **Source**
   alanını **Deploy from a branch**, **Branch** alanını **main** ve **/ (root)**
   yapıp **Save**'e bas.
2. Bir iki dakika içinde uygulama `https://<kullanıcı-adı>.github.io/<depo-adı>/`
   adresinde yayınlanır; `main` dalına her gönderimde kendiliğinden güncellenir.
3. Adresi telefonda aç:
   - **iPhone (Safari):** Paylaş → Ana Ekrana Ekle
   - **Android (Chrome):** ⋮ → Ana ekrana ekle / Uygulamayı yükle

## Bilgisayarda denemek

Derleme adımı yoktur, düz HTML/CSS/JavaScript'tir:

```sh
python3 -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç.
