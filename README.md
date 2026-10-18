# Lens Dataset Collector

Kompüter görməsi (YOLO / Lens Detection) modelləri üçün şəkil datasetini komanda üzvlərinin brauzerdən rahat toplaması üçün veb platforma. Heç nə quraşdırmaq lazım deyil — link açılır, kamera icazəsi verilir, çəkiliş başlayır.

Hər şəkil avtomatik olaraq Google Drive-da **Ad → Sinif** strukturu ilə saxlanılır:

```
Lens_Dataset/
├── Leyla/
│   ├── mouse/
│   │   ├── mouse_Leyla_20261018-164803-123_k3f9.jpg
│   │   └── …
│   └── notebook/
│       └── …
└── Sanan/
    └── phone/
        └── …
```

* **Canlı sayt:** <https://avazasgarov.github.io/lens-dataset-collector/>
* **GitHub:** <https://github.com/AvazAsgarov/lens-dataset-collector>
* **Drive qovluğu:** [Lens_Dataset](https://drive.google.com/drive/folders/1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR)

---

## İstifadə qaydası

1. Saytı açın və brauzerə kamera icazəsi verin.
2. **Adınız** — siyahıdan adınızı seçin və ya yenisini yazın (məs. `Leyla`).
3. **Obyektin sinfi** — şəkildə nə olduğunu yazın (məs. `mouse`, `notebook`, `phone`). Əvvəl istifadə olunmuş siniflər düymə kimi görünür.
4. Aşağıdakı “Şəkillər bu qovluğa yüklənəcək” sətrində yolu yoxlayın: `Drive / Leyla / mouse /`.
5. `Space` ilə avtomatik çəkilişi başladın və ya `C` ilə tək kadr çəkin. Başqa obyektə keçəndə sadəcə sinfi dəyişin.

| Qısa yol | Əməliyyat |
|---|---|
| `Space` | Avtomatik çəkilişi başlat / dayandır |
| `C` | Tək kadr |
| `W` / `S` | İntervalı 0.5 s artır / azalt (0.5–10 s) |
| `M` | Güzgü rejimini aç / bağla |

---

## Əsas xüsusiyyətlər

- **Ad + sinif qovluqları.** Ad və sinif böyük/kiçik hərfdən asılı olmayaraq mövcud qovluqla birləşdirilir (`leyla` → `Leyla`), dublikat qovluq yaranmır. Sinif adları kiçik hərflə və boşluqsuz saxlanılır (`Mouse Pad` → `mouse_pad`).
- **Hər şəklin metadatası.** Fayl adında sinif və ad var; Drive-da faylın təsvirində (description) JSON metadata saxlanılır: çəkiliş vaxtı, ssenari, güzgü, ölçü, kamera, işıq səviyyəsi.
- **Addımlı bələdçi.** 5 ssenari (düz, bucaqlar, məsafə, tutuş, qarışıq mühit — cəmi 55 kadr). İrəliləyiş hər **ad + sinif** üçün ayrıca brauzerdə yadda saxlanılır.
- **Canlı işıq yoxlaması** və rule-of-thirds vizir xətləri (saxlanılan şəkildə görünmür).
- **Etibarlı yükləmə növbəsi.** 3 paralel yükləmə, avtomatik təkrar cəhdlər (2→4→8→16 s), internet kəsiləndə gözləmə, uğursuz kadrların hər 60 saniyədən bir avtomatik (və ya “Yenidən” düyməsi ilə dərhal) təkrar yüklənməsi, növbədə 40 kadr yığılanda çəkilişin dayanması və səhifə bağlananda xəbərdarlıq.
- **Təhlükəsiz redaktə.** Ad və ya sinif yazılarkən avtomatik çəkiliş dayanır; kadrlar yalnız təsdiqlənmiş (Enter / sahədən çıxış / siyahıdan seçim) qovluğa gedir.
- **Minimalist interfeys** — açıq və tünd mövzu, klaviatura və ekran oxuyucu dəstəyi, mobil uyğunluq.

---

## Layihə strukturu

```
├── index.html                 # Tətbiqin interfeysi
├── css/style.css              # Dizayn sistemi (açıq/tünd mövzu)
├── js/
│   ├── utils.js               # Ad/sinif normallaşdırması, yaddaş, formatlama
│   ├── camera.js              # Kamera axını, cihaz dəyişmə, təmiz kadr
│   ├── guidance.js            # Ssenarilər, işıq analizi, vizir
│   ├── uploader.js            # Drive yükləmə növbəsi və qovluq ağacı
│   ├── combobox.js            # Təklifli giriş sahəsi
│   └── app.js                 # Əsas koordinator
├── google_drive_script.js     # Google Apps Script backend (API v2)
├── server.py                  # Lokal FastAPI serveri
├── RUN_Web_App.bat            # Windows üçün iki kliklə lokal işə salma
├── vercel.json, .vercelignore # Vercel konfiqurasiyası (istəyə görə)
└── docs/                      # Texniki sənədlər
```

## Sənədlər

1. [docs/HANDOVER.md](docs/HANDOVER.md) — təhvil-təslim, əsas linklər, vacib qaydalar
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modullar, məlumat axını, API sxemləri
3. [docs/GOOGLE_DRIVE_INTEGRATION.md](docs/GOOGLE_DRIVE_INTEGRATION.md) — Apps Script backend və yeniləmə qaydası
4. [docs/DATASET_SPECIFICATION.md](docs/DATASET_SPECIFICATION.md) — qovluq strukturu, ssenarilər, metadata, ixrac
5. [docs/DEPLOYMENT_AND_DEV.md](docs/DEPLOYMENT_AND_DEV.md) — GitHub Pages, lokal işə salma, test

## Lokal işə salma (istəyə görə)

`RUN_Web_App.bat` faylına iki dəfə klikləyin və ya:

```bash
pip install -r requirements.txt
python server.py
```

Brauzer `http://localhost:8000` ünvanında açılır. Şəkillər yenə də Google Drive-a yüklənir, ona görə internet lazımdır.
