# Plaklarım

Sahip olduğun plakların arşivi. Telefonda tarayıcıdan açılır, ana ekrana
uygulama gibi eklenebilir ve internet olmadan da çalışır.

Her plak için saklananlar:

- Ön kapak ve arka kapak görseli (telefonun kamerasıyla çekilebilir ya da galeriden seçilebilir)
- Sanatçı, albüm adı, yıl, tür, plak şirketi
- A yüzü ve B yüzü şarkıları
- Notlar (baskı, durum, nereden alındığı…)

Liste ekranında sanatçı, albüm ya da şarkı adına göre arama yapılabilir.

## Veriler nerede duruyor?

Kayıtlar ve görseller, uygulamayı açtığın tarayıcının kendi veritabanında
(IndexedDB) saklanır. Sunucu, hesap ya da ücret yoktur; veriler yalnızca
senin telefonunda durur.

Bu yüzden ara sıra sağ üstteki **⋮ → Yedeği indir** ile yedek al. Yedek dosyası
tüm plakları ve kapak görsellerini içerir; telefon değiştirdiğinde ya da
tarayıcı verisini sildiğinde **⋮ → Yedekten geri yükle** ile geri alırsın.

Telefon fotoğrafları kaydedilirken en uzun kenarı 1600 piksele küçültülür,
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
