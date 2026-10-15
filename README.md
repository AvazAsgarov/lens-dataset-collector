# Lens Detection - Dataset Collection Web Platform

Bu layihə kompüter görməsi (computer vision) və obyekt aşkarlama (YOLO / Lens Detection) modelləri üçün telefon və linza datasetinin şirkət əməkdaşları tərəfindən rahat toplanması üçün hazırlanmış veb platformadır.

Çəkilən bütün şəkillər avtomatik olaraq mərkəzi **Google Drive** qovluğunda istifadəçinin adına uyğun qovluq açılaraq ora sinxronlaşdırılır.

🔗 **Hədəf Google Drive Qovluğu:** [Google Drive Folder (1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR)](https://drive.google.com/drive/folders/1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR?usp=sharing)

---

## 🌟 Əsas Özəlliklər

1. **Sıfır Quraşdırma (Zero Setup):**
   - İstifadəçilər heç bir proqram və ya Python quraşdırmadan birbaşa brauzerdə linkə daxil olur.
2. **Avtomatik Google Drive Sinxronizasiyası:**
   - İstifadəçi adını yazır (məs: `Avaz`).
   - Sistem Google Drive-da avtomatik `Avaz` qovluğu yaradır və hər şəkli həmin qovluğa yükləyir (`Avaz_timestamp_xxx.jpg`).
3. **Canlı İşıqlandırma Analizi (Live Lighting Quality):**
   - Real-vaxtda video axınından parlaqlıq (luminance) dərəcəsini ölçür:
     - ⚠️ *İşıq zəifdir* (Otaq işığını yandırmaq tövsiyə olunur).
     - ⚠️ *Həddindən artıq parlaqdır* (Parıltı xəbərdarlığı).
     -  *İşıqlandırma idealdır*.
4. **Addım-addım Bələdçi Ssenariləri (Guidance Wizard):**
   - **Ssenari 1:** Telefonu ekrana düz paralel tutun.
   - **Ssenari 2:** Müxtəlif bucaqlar və maillik (30-45 dərəcə).
   - **Ssenari 3:** Yaxın (20 sm) və uzaq (1 metr) məsafələr.
   - **Ssenari 4:** Tək əl, cüt əl və fərqli tutuşlar.
   - **Ssenari 5:** Qarışıq mühit (fincan, qələm, aksesuarlarla).
5. **İntuitiv İdarəetmə və Qısa Yollar:**
   - `Space`: Avtomatik çəkilişi Başlat / Dayandır.
   - `C` və ya `Enter`: Tək kadr çəkilişi (Manual Snap).
   - `W` / `S`: Çəkiliş intervalını 0.5s artır / azalt.
   - `M`: Güzgü effektini (Mirror) aç / bağla.
6. **Asinxron Yükləmə Növbəsi:**
   - Şəkillər çəkilən kimi növbəyə düşür və arxa planda Google Drive-a yüklənir. Şəbəkə zəifləsə belə kadrlar itmir, avtomatik təkrar cəhd edilir.

---

## 🚀 Canlı Bulud Deployu (Cloud 24/7)

Bu tətbiq tamamilə statik və bulud-dostu olduğu üçün kompüterinizi açıq saxlamağa ehtiyac yoxdur.
Aşağıdakı xidmətlərdən istənilən birində 24/7 canlı yayımda işləyə bilər:

- **GitHub Pages:** Repozitoriyaya hər dəfə kod göndərildikdə `.github/workflows/deploy.yml` vasitəsilə avtomatik deploy olunur.
- **Vercel:** `vercel.json` faylı hazırdır; Vercel-ə GitHub repozitoriyasını bağlamaqla dərhal canlı link yaranır.

---

## 💻 Kompüterdə Lokal İşə Salma (İstəyə görə)

1. `RUN_Web_App.bat` faylına iki dəfə klikləyin.
2. Tətbiq avtomatik asılılıqları yoxlayacaq və brauzeri `http://localhost:8000` ünvanında açacaq.

---

## 📁 Layihə Strukturu

```
├── index.html                   # Əsas SPA interfeysi
├── css/
│   └── style.css                # Glassmorphism və HUD stilləri
├── js/
│   ├── camera.js                # Veb-kamera axını və təmiz kadr çəkilişi
│   ├── guidance.js              # İşıq analizi və bələdçi ssenariləri
│   ├── uploader.js              # Asinxron Google Drive yükləyici
│   └── app.js                   # Əsas dövrə və qısa yollar
├── server.py                    # Lokal FastAPI serveri
├── requirements.txt             # Python asılılıqları
├── RUN_Web_App.bat              # İki kliklə işə salma bat faylı
├── vercel.json                  # Vercel konfiqurasiyası
└── .github/workflows/deploy.yml # GitHub Pages avtomatlaşdırması
```
