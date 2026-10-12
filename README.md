# Plaklarım

Sahip olduğun plakların arşivi. Telefonda tarayıcıdan açılır, ana ekrana
uygulama gibi eklenebilir ve internet olmadan da çalışır.

Her plak için saklananlar:

- Ön kapak ve arka kapak görseli (görsel kutusuna dokununca uygulamanın kendi kamerası açılır,
  çekilen kare onay sorulmadan köşe ekranına gelir; galeriden de seçilebilir;
  fotoğraftaki kapağın dört köşesi otomatik bulunur, eğiklik ve perspektif düzeltilerek
  kapak tam kareye oturtulur; köşeler gerekirse elle sürüklenebilir, beğenilmezse
  "Tekrar çek" ile yeniden çekilir; telefonun geri tuşu kamerayı ya da köşe ekranını kapatıp
  forma döner. Kamera izni verilmezse telefonun kendi kamerası kullanılır)
- Koleksiyon sıra numarası, sanatçı, albüm adı, yıl, tür, plak şirketi
- Plak sayısı (varsayılan 1) ve her plağın yüz yüz şarkıları: 1. plak A-B, 2. plak C-D… yüzleri;
  her şarkı sıra numarası (A1, A2, C1…), adı ve söyleyeniyle ayrı tutulur (karma plaklar için).
  Şarkılar soldaki ⠿ tutamağından sürüklenerek sıralanabilir ya da başka yüze taşınabilir
- Notlar (baskı, durum, nereden alındığı…)

Liste ekranında sanatçı, albüm ya da şarkı adına göre arama yapılabilir.

Sanatçı, albüm, tür, plak şirketi ve şarkı adları her kelimenin ilk harfi büyük,
gerisi küçük olacak biçimde saklanır (ör. "BARIŞ MANÇO" → "Barış Manço"); notlar
olduğu gibi kalır. Büyük harfle yazılmış adlardaki I harfinin ı mı i mi olacağı
kelimenin kendisine, plağın diğer adlarına ve Türkçe ses uyumuna bakılarak seçilir
("KADIN" → "Kadın", "BILLIE JEAN" → "Billie Jean"). Daha önce kaydedilmiş plaklar
uygulama açılınca bu biçime getirilir; ilk halleri yedek dosyasında da duran
`namesBeforeCasing` alanında saklanır.

## Kapaktan otomatik doldurma

Ön kapak fotoğrafı yüklenince sanatçı ve albüm adı, arka kapak fotoğrafı
yüklenince her yüzün şarkıları kendiliğinden doldurulur; arka kapakta C, D… yüzleri
varsa plak sayısı da artırılır. Okumayı Claude
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
