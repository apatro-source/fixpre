# Fixpre — Online Yayın (Neon + Vercel)

Hepsi tarayıcıdan yapılır; bilgisayara program kurman gerekmez.

## 1) Neon bağlantı adresi (DATABASE_URL)
1. https://neon.com → projene gir.
2. **Connection string** (Bağlantı dizesi) kısmından **"Pooled connection"** olanı kopyala.
   - `postgresql://...neon.tech/...?sslmode=require` şeklinde başlar.
3. Bunu bir yere yapıştır, birazdan Vercel'e koyacağız.

## 2) Kodu GitHub'a yükle
1. https://github.com → hesap aç / giriş yap.
2. Sağ üst **+** → **New repository** → ad: `fixpre` → **Private** seç → **Create repository**.
3. Açılan sayfada **"uploading an existing file"** bağlantısına tıkla.
4. `uygulama a` klasöründeki **tüm dosya ve klasörleri** sürükle-bırak:
   - `index.html`, `app.js`, `style.css`, `i18n.js`
   - `api/` klasörü (içinde `state.js`)
   - `package.json`, `KULLANIM.md`, `DEPLOY.md`
5. Aşağıda **Commit changes**.

## 3) Vercel'e bağla ve yayınla
1. https://vercel.com → **Continue with GitHub** ile giriş yap.
2. **Add New… → Project** → `fixpre` deposunu **Import**.
3. **Framework Preset: Other** (otomatik gelir, dokunma).
4. **Environment Variables** kısmına iki değişken ekle:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Neon'dan kopyaladığın bağlantı adresi |
   | `FIXPRE_KEY` | Kendi belirlediğin bir **erişim parolası** (ör. `fixpre2026`) |
5. **Deploy** → bitince bir adres verir: `https://fixpre-xxxx.vercel.app`

## 4) İlk giriş
1. Verilen adresi aç.
2. Çıkan kutuya **erişim anahtarını** (FIXPRE_KEY) yaz → sayfa yenilenir.
3. Giriş: **yonetici@local / 1234** → ⚙️ Profil'den şifreni değiştir.
4. Adresi ve erişim anahtarını ekibinle paylaş. Herkes kendi cihazından girer, **aynı veriyi** görür.

## 5) (Opsiyonel) fixpre.com'u bağla
- Vercel → Proje → **Settings → Domains → Add** → `fixpre.com` yaz, çıkan DNS kayıtlarını alan adı panelinde gir.

## Notlar (bu hızlı sürüm)
- Tüm veri tek yerde tutulur; **aynı anda iki kişi düzenlerse son kaydeden kazanır**.
- Erişim anahtarı paylaşımlıdır; veriyi görmek için bu anahtar gerekir.
- Şifreler şu an düz metin saklanıyor (yerel sürümdeki gibi). İleride "tam güvenli sürüm" ile hash + kişiye özel erişim eklenebilir.
- **Yerelde** `index.html`'i çift tıklayınca yine çalışır ama o localStorage'dır; online sürümle ayrıdır.
