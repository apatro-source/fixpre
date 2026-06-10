# Fixpre — Kullanım Kılavuzu

> fixpre.com

## Nasıl Açılır?
`index.html` dosyasına **çift tıklayın**. Tarayıcıda (Chrome/Edge) açılır. Kurulum, internet veya program gerekmez.

## İlk Giriş (Yönetici)
- **E-posta:** `yonetici@local`
- **Şifre:** `1234`

## Profil (Dil & Şifre)
Sağ üstteki **⚙️ Profil** ile her kullanıcı kendi **dilini** (Türkçe, English, Deutsch, Русский, Español, Italiano) seçebilir, adını ve **şifresini** değiştirebilir. Dil tercihi kişiye özeldir.

## Roller
Üç rol vardır: **Yönetici → Şef → Personel**.

- **Yönetici** (en üst): Mekanları ve şefleri tanımlar. Şefleri mekanlara atar. Tüm
  mekanları, şefleri, personeli ve görevleri görebilir. Kendisi de personel/görev ekleyebilir.
- **Şef**: Yöneticinin atadığı mekanlardan sorumludur. **Kendi personelini** ekler ve onlara
  görev verir. Yalnızca kendi mekanlarını, personelini ve oluşturduğu görevleri görür.
- **Personel**: Sadece kendisine atanmış görevleri görür ve tamamlar.

## Yönetici Ne Yapabilir?
- **Mekanlar:** Yeni mekan/şube açar.
- **Şefler:** Şef ekler (e-posta + şifre belirler), şefi sorumlu olduğu mekanlara atar.
  Bir şefe tıklayınca o şefin personelini ve görevlerini görür.
- **Personel:** Personel ekler, e-posta + şifresini belirler, personeli mekanlara atar.
  (Eklenen e-posta ve şifreyi kişiye verirsiniz; onlar bununla giriş yapar.)
- **Görevler:** Görev oluşturur, bir göreve **birden fazla personel** atar, mekan ekler.
  Her personelin görevi tamamlama saatini görür.
- **Tekrar seçenekleri:** Her görev için tekrar tipi seçilir:
  - **Tek seferlik** — bir kez yapılır (isteğe bağlı son tarih).
  - **Her gün** — her gün tekrar eder.
  - **Haftalık** — seçilen günlerde (örn. Pzt, Çar, Cum) tekrar eder.
  - **Aylık** — ayın seçilen tarihlerinde (örn. 1, 15) tekrar eder.
  Tekrar eden görevler her yeni günde personelin listesinde otomatik yeniden çıkar; her günün
  tamamlanması ayrı olarak "Kayıtlar"da saatiyle tutulur.
- **Kayıtlar:** Tamamlanan tüm görevler personel ve saatiyle listelenir.

## Personel Ne Görür?
- Sadece **kendisine atanmış görevleri** görür.
- "Görevi Tamamla" der → tamamlama saati kaydedilir ve yöneticiye iletilir.

## Test Senaryosu
1. `yonetici@local` / `1234` ile girin.
2. **Mekanlar** → bir mekan ekleyin.
3. **Şefler** → bir şef ekleyin (örn. `sef@local` / `1234`) ve mekana atayın.
4. Çıkış → şef hesabıyla girin.
5. Şef olarak **Personelim** → bir personel ekleyin (örn. `ahmet@local` / `1234`).
6. Şef olarak **Görevler** → görev oluşturup personeli seçin.
7. Çıkış → personel hesabıyla girin → görevi tamamlayın.
8. Şef veya yöneticiyle girin → **Kayıtlar**'da tamamlama saatini görün.
   (Yönetici, **Şefler** sekmesinden o şefin tüm personel ve görevlerini de görebilir.)

## Önemli Not (Yerel Sürüm)
- Veriler şu an **bu tarayıcıda** saklanır (localStorage). Yani personel başka bir bilgisayardan/telefondan giriş yapamaz — herkesin aynı tarayıcıyı kullanması gerekir.
- Farklı cihazlardan giriş, gerçek sunucu/veritabanı gerektirir. Test aşamasını beğenirsen bir sonraki adımda bunu (online sürüm) ekleyebiliriz.
- Tarayıcı geçmişini/site verisini temizlersen kayıtlar silinir.
