# Lens Detection - Dataset Collection Web Platform

Bu layihə kompüter görməsi (computer vision) və obyekt aşkarlama (YOLO / Lens Detection) modelləri üçün telefon və linza datasetinin şirkət əməkdaşları tərəfindən rahat toplanması üçün hazırlanmış veb platformadır.

Çəkilən bütün şəkillər avtomatik olaraq mərkəzi **Google Drive** qovluğunda istifadəçinin adına uyğun qovluq açılaraq (və ya mövcud qovluq seçilərək) ora sinxronlaşdırılır.

* 🌐 **Canlı Veb Sayt (24/7 Açıqdır):** [https://avazasgarov.github.io/lens-dataset-collector/](https://avazasgarov.github.io/lens-dataset-collector/)
* 📦 **GitHub Repozitoriyası:** [https://github.com/AvazAsgarov/lens-dataset-collector](https://github.com/AvazAsgarov/lens-dataset-collector)
* 📁 **Hədəf Google Drive Qovluğu:** [Google Drive Folder (1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR)](https://drive.google.com/drive/folders/1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR?usp=sharing)

---

## 📚 Ətraflı Texniki Sənədləşmə (Docs)

Layihəni təhvil alan başqa bir AI agent və ya proqramçı üçün `docs/` qovluğunda dərinləşdirilmiş sənədlər hazırlanmışdır:

1. 🤝 **[docs/HANDOVER.md](docs/HANDOVER.md)**: AI və Mühəndis üçün tam Təhvil-Təslim sənədi, əsas etimadnamələr (credentials), unikal mühəndislik həlləri və növbəti addımlar.
2. 🏗️ **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Sistemin Mermaid diaqramları, JavaScript modullarının strukturu, məlumat axını və lokal yaddaş sxemi.
3. ☁️ **[docs/GOOGLE_DRIVE_INTEGRATION.md](docs/GOOGLE_DRIVE_INTEGRATION.md)**: Serverless Google Apps Script arxitekturası, kod izahı, CORS tənzimləməsi və təkrar yerləşdirmə (deploy) bələdçisi.
4. 🎯 **[docs/DATASET_SPECIFICATION.md](docs/DATASET_SPECIFICATION.md)**: Kompüter görməsi təhlükə modeli, 5 addımlı bələdçi ssenariləri, işıqlandırma hədləri və YOLO təliminə ixrac qaydaları.
5. 🚀 **[docs/DEPLOYMENT_AND_DEV.md](docs/DEPLOYMENT_AND_DEV.md)**: GitHub Pages, Vercel və lokal FastAPI mühitinin quraşdırılması, WebRTC HTTPS icazə qaydaları.

---

## 🌟 Əsas Xüsusiyyətlər

1. **Sıfır Quraşdırma (Zero Setup):**
   - İstifadəçilər heç bir proqram və ya Python quraşdırmadan birbaşa brauzerdə linkə daxil olur.
2. **Qovluq Seçimi və Ağıllı Birləşdirmə (Deduplication):**
   - Sayt Google Drive-dakı mövcud əməkdaş qovluqlarını çəkir və açılan siyahıda (dropdown) göstərir.
   - Böyük/kiçik hərf fərqi aradan qaldırılıb (`mahammad` vs `Mahammad`); heç bir halda 2-ci dublikat qovluq yaranmır.
   - Yeni istifadəçi üçün *"➕ Yeni əməkdaş əlavə et..."* imkanı mövcuddur.
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
├── docs/                        # Tam texniki sənədləşmə toplusu
│   ├── HANDOVER.md              # AI & Dev Təhvil-təslim sənədi
│   ├── ARCHITECTURE.md          # Memarlıq və modullar
│   ├── GOOGLE_DRIVE_INTEGRATION.md # Drive API və GAS bələdçisi
│   ├── DATASET_SPECIFICATION.md # Kompüter görməsi və dataset qaydaları
│   └── DEPLOYMENT_AND_DEV.md    # Cloud və Lokal deploy təlimatı
├── google_drive_script.js       # Google Apps Script kodu
├── server.py                    # Lokal FastAPI serveri
├── requirements.txt             # Python asılılıqları
├── RUN_Web_App.bat              # İki kliklə işə salma bat faylı
├── vercel.json                  # Vercel konfiqurasiyası
└── .github/workflows/deploy.yml # GitHub Pages avtomatlaşdırması
```
