# Plaklarım

Sahip olduğun plakların arşivi. Telefonda tarayıcıdan açılır, ana ekrana
uygulama gibi eklenebilir ve internet olmadan da çalışır.

Her plak için saklananlar:

- Ön kapak ve arka kapak görseli (görsel kutusuna dokununca telefonun fotoğraf kamerası açılır;
  galeriden de seçilebilir; fotoğraftaki kapağın dört köşesi otomatik bulunur, köşeler
  gerekirse elle sürüklenir ve "Seçimi kullan" ile eğiklik ve perspektif düzeltilerek
  kapak tam kareye oturtulur; beğenilmezse "Tekrar çek" ile yeniden çekilir; telefonun
  geri tuşu köşe ekranını kapatıp forma döner)
- Koleksiyon sıra numarası, sanatçı, albüm adı, yıl, tür, plak şirketi
- Plak sayısı (varsayılan 1) ve her plağın yüz yüz şarkıları: 1. plak A-B, 2. plak C-D… yüzleri;
  her şarkı sıra numarası (A1, A2, C1…), adı ve söyleyeniyle ayrı tutulur (karma plaklar için).
  Şarkılar × düğmesinin altındaki ⠿ tutamağına basılı tutup sürüklenerek ya da numara
  kutusuna başka bir yerin numarası yazılarak (ör. B1, ya da kendi yüzünde 3) taşınır;
  ⠿ üzerinden hızlıca kaydırmak şarkıyı taşımaz, sayfayı kaydırır. Düz numaralar
  (1, 2… ya da A1, A2…) yeni sıraya göre yeniden verilir
- Notlar (baskı, durum, nereden alındığı…)

Liste sanatçı adına göre Türkçe abece sırasıyla dizilir (C'den sonra Ç, I'dan sonra
İ); aynı sanatçının plakları albüm adına göre sıralanır. Liste ekranında sanatçı,
albüm ya da şarkı adına göre arama yapılabilir; arama çubuğu liste kaydırılınca da
üstte görünür kalır. Arama büyük/küçük harfe ve Türkçe harflere bakmaz: "baris"
yazınca Barış Manço da bulunur. Plak sayısının yanındaki tür
menüsünden bir tür seçilince yalnızca o türdeki plaklar listelenir ("Tüm türler"
hepsini geri getirir). Menüde her türün yanında kaç plak olduğu yazar; "Rock, Pop"
gibi birden çok tür yazılmış plak her iki türde de çıkar. Arama ve tür birlikte
kullanılabilir. Üstteki Plaklarım yazısına basınca tür yeniden "Tüm türler" olur;
plak sayfasından geri tuşuyla dönünce seçilen tür korunur.

Sanatçı, albüm, tür, plak şirketi ve şarkı adları her kelimenin ilk harfi büyük,
gerisi küçük olacak biçimde saklanır; notlar olduğu gibi kalır. Plağın dili
şarkıcıya göre belirlenir: şarkıcı Türkse plağın bütün adları (şarkılar, tür ve
plak şirketi dahil) Türkçe, yabancıysa İngilizce kurallarla yazılır; şarkıcının
adından anlaşılmıyorsa albüm ve şarkı adlarına bakılır. Karma plaklarda (Çeşitli
Sanatçılar) her şarkı, söyleyeni yazılmışsa onun diliyle yazılır.

- İngilizce kurallar: a, the, and, of, in, on, to gibi kısa kelimeler küçük kalır
  ("THE DARK SIDE OF THE MOON" → "The Dark Side of the Moon").
- Türkçe kurallar: ve, ile, ya, ki, de/da ve mı/mi küçük kalır, I harfinin ı mı i mi
  olacağı Türkçe sözlükten ve ses uyumundan bulunur ("YALNIZ KADIN" → "Yalnız Kadın",
  "HAZIR MISIN" → "Hazır mısın").

Daha önce kaydedilmiş plaklar uygulama açılınca bu biçime getirilir; ilk halleri
yedek dosyasında da duran `namesBeforeCasing` alanında saklanır. Kurallar değişince
elle değiştirilmemiş adlar bu ilk hallerinden yeniden düzeltilir; elle düzeltilmiş
adlara dokunulmaz.

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
(IndexedDB) saklanır; internet olmadan da açılır.

### İnternette saklama (isteğe bağlı)

**⋮ → İnternette saklama** ile plaklar senin GitHub hesabındaki gizli bir depoda
(`Plaklarim-veri`) da saklanır. Böylece bağladığın her cihazda aynı liste açılır;
bir cihazda eklenen, değiştirilen ya da silinen plak diğerlerine kendiliğinden
geçer. Sunucu ya da ücret yoktur; uygulama GitHub'a doğrudan bağlanır.

1. Sayfadaki **GitHub'da depo oluştur** düğmesi adı ve gizliliği hazır gelen depo
   sayfasını açar; **Create repository**'ye bas.
2. **Anahtar oluştur** düğmesi izinleri hazır gelen anahtar sayfasını açar;
   **Only select repositories** altında `Plaklarim-veri`'yi seçip **Generate token**'a bas.
3. Anahtarı uygulamaya yapıştır. Anahtar yalnızca o cihazda saklanır.

Diğer cihazlarında **Başka bir cihazını bağla** bağlantısını aç (ana ekrana eklenmiş
uygulamada açılmazsa bağlantıyı kopyalayıp oradaki İnternette saklama sayfasına
yapıştır).

**İzin verdiklerin görsün:** yalnızca okuma izni olan ikinci bir anahtarla bir izleme
bağlantısı oluşturulur. Bağlantıyı açanlar listeyi görür ama değiştiremez; kendi
plakları varsa onlara karışmaz. Okuma anahtarını GitHub'da silince bütün izleme
bağlantıları çalışmaz olur.

Depoda `plaklar.json` (her satırda bir plak) ve `kapaklar/` klasörü durur. Her
değişiklik GitHub'da geçmişe yazılır; yanlışlıkla silinen bir plak oradan geri
alınabilir. İki cihazda aynı plak değiştirilmişse son değiştirilen kalır; birinde
silinip öbüründe değiştirilmişse değiştirilen kalır.

### Yedek

İnternette saklamayı kullanmıyorsan ara sıra sağ üstteki **⋮ → Yedeği indir** ile
yedek al. Yedek dosyası tüm plakları ve kapak görsellerini içerir; telefon
değiştirdiğinde ya da tarayıcı verisini sildiğinde **⋮ → Yedekten geri yükle** ile
geri alırsın.

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
