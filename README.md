# UygurTube

Uygurca videoları yerel Python veri hattıyla toplayıp statik bir sitede listeler. Yayındaki site yalnızca `site/data/videos.json` dosyasını okur; API anahtarı, sunucu kodu veya veritabanı içermez. Videolar indirilmez; YouTube'un gizlilik geliştirilmiş iframe oynatıcısı kullanılır.

Arayüz; arama, kategori ve yazı türü filtreleri, sıralama, açılır sağ gezinme paneli ve video sayfaları sunar. Kategoriler ana sayfadan açılan menü panelinde listelenir. 20 dakika ve üzerindeki videolar **Uzun videolar** bölümünde listelenir. Beğenilenler, Sonra izle listesi, izleme geçmişi ve tema tercihi yalnızca kullandığınız tarayıcının yerel depolamasında tutulur; hesap veya sunucu gerekmez.

## Gereksinimler

- Python 3.10 veya üzeri
- Google Cloud projesinden alınmış YouTube Data API v3 anahtarı
- Ücretsiz yayın için GitHub hesabı ve GitHub Pages veya Cloudflare hesabı

## 1. YouTube Data API anahtarı alma

1. [Google Cloud Console](https://console.cloud.google.com/) üzerinden bir proje oluşturun veya seçin.
2. **API'ler ve hizmetler → Kitaplık** bölümünde **YouTube Data API v3** hizmetini etkinleştirin.
3. **API'ler ve hizmetler → Kimlik bilgileri → Kimlik bilgileri oluştur → API anahtarı** yolunu izleyin.
4. Anahtarı yerel `.env` dosyasına yazın. Bu anahtarı siteye, GitHub'a veya herkese açık başka bir yere koymayın.

Proje klasöründe PowerShell ile sanal ortam ve bağımlılıkları hazırlayın:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env` dosyasını açıp örnek değeri kendi anahtarınızla değiştirin:

```dotenv
YOUTUBE_API_KEY=anahtarinizi_buraya_yazin
```

`channels.json` dosyasına izlemek istediğiniz kanalları ve kategori adlarını ekleyin. Her kayıtta `handle` veya `channelId` alanlarından yalnızca birini kullanın:

```json
[
  { "handle": "@ornekkanal", "category": "Müzik" },
  { "channelId": "UCxxxxxxxxxxxxxxxxxxxxxx", "category": "Eğitim" }
]
```

`channels.json` içindeki kategori, o kanalın videolarına atanır.

## 2. Veri hattını çalıştırma

Proje kökünde ve sanal ortam etkin durumdayken:

```powershell
python pipeline\01_fetch.py
python pipeline\02_clean.py
python pipeline\03_build.py
```

- `01_fetch.py`, kanalın uploads listesini sayfalayarak tarar; `search.list` kullanmaz. Video bilgilerini 50'li gruplarla alır ve `data/videos_raw.json` dosyasını önbellek olarak kullanır. Daha önce önbelleğe alınmış videoların ayrıntılarını tekrar çağırmaz. Günlük kota dolarsa o ana kadarki veriyi kaydedip uyarı verir.
- `02_clean.py`, Unicode yazı türünü belirler. 60 saniyeden kısa videolar varsayılan olarak dışarıda kalır; dahil etmek için `python pipeline\02_clean.py --include-shorts` çalıştırın. İncelemeye ihtiyaç duyan kayıtlar `data/review.json` dosyasına yazılır ve temiz katalogda yer almaz.
- `03_build.py`, yalnızca site için gereken alanlarla `site/data/videos.json` dosyasını üretir.

`data/review.json` içindeki kayıtları elle inceleyebilirsiniz. Kaynak kanal listesini veya videoları değiştirdikten sonra yukarıdaki üç komutu yeniden çalıştırın.

## 3. Siteyi yerelde deneme

`videos.json` üretildikten sonra proje kökünde:

```powershell
python -m http.server 8000 --directory site
```

Tarayıcıda [http://localhost:8000](http://localhost:8000) adresini açın. HTML dosyasını doğrudan `file://` ile açmayın; katalog dosyası `fetch` ile yüklendiğinden yerel web sunucusu gerekir. Sunucuyu durdurmak için terminalde `Ctrl+C` tuşlarına basın.

## 4. Ücretsiz yayınlama

Yayınlanacak klasör yalnızca `site/` olmalıdır. Bu klasörde `.env` veya API anahtarı bulunmaz. Site kataloğu, video başlıkları ve herkese açık video kimlikleri web'de görünür; kaynak kanal listesi ve Python hattı statik sitede yayımlanmaz.

### Cloudflare Pages

1. Projeyi bir GitHub deposuna yükleyin. `.gitignore`, `.env` dosyasını dışarıda tutar; yüklemeden önce `git status` ile kontrol edin.
2. Cloudflare Dashboard'da **Workers & Pages → Create → Pages → Connect to Git** yolunu izleyip depoyu bağlayın.
3. Framework preset olarak **None** seçin; build komutunu boş bırakın ve **Build output directory** değerini `site` yapın.
4. Yayınlamayı başlatın. Cloudflare ücretsiz `*.pages.dev` adresini verir.

### GitHub Pages

1. Projeyi GitHub deposuna yükleyin; `.env` dosyasını kesinlikle eklemeyin.
2. Depo **Settings → Pages → Build and deployment → Source** bölümünde **GitHub Actions** seçin.
3. Depodaki `.github/workflows/pages.yml`, her `main` dalı güncellemesinde `site/` klasörünü GitHub Pages'e yayınlar. `main` farklıysa workflow dosyasındaki dal adını değiştirin.
4. İlk GitHub Actions dağıtımı tamamlandığında Pages ekranında gösterilen ücretsiz `github.io` adresini açın.

## 5. Yeni video ekleme

Yeni bir kanal eklediyseniz `channels.json` dosyasını güncelleyin. Ardından proje kökünde hattı tekrar çalıştırın:

```powershell
python pipeline\01_fetch.py
python pipeline\02_clean.py
python pipeline\03_build.py
```

Yeni videolar ham kataloğa eklenir ve site kataloğu yeniden oluşturulur. `site/` klasörünü GitHub'a yükleyince bağlı Pages/Cloudflare yayını güncellenir.
