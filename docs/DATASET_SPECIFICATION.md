# Dataset Specification & Collection Guidelines

---

## 1. Purpose

The collector gathers labelled-by-folder images for object detection. Each collector chooses a **class** for what they photograph (`phone`, `mouse`, `notebook`, …), so a single session produces images that are already grouped by class and by person.

The original use case is DLP screen protection: detecting a phone or lens pointed at a screen. The reference model in `lkazimzadehh/lens-detection` is a 1024 px YOLO checkpoint whose phone class is id 0, validated at confidence 0.60. The new class folders also allow collecting negatives and other objects.

---

## 2. Folder and file naming

```
Lens_Dataset/<Name>/<class>/<class>_<Name>_<YYYYMMDD-HHMMSS-mmm>_<rand4>.jpg
```

| Part | Rule | Example |
|---|---|---|
| `<Name>` | The collector's name as typed. Matched case-insensitively against existing folders (the existing spelling wins). Max 60 characters, no `/` or `\`. | `Leyla`, `Ləman Əliyeva` |
| `<class>` | Lowercase, spaces become `_`, max 60 characters. Matched case-insensitively. | `mouse`, `mouse_pad`, `phone` |
| Timestamp | The collector's local time at capture, to the millisecond | `20261018-164803-123` |
| `<rand4>` | Random suffix that keeps file names unique (uploads are idempotent by file name) | `k3f9` |

Recommended class names: short English nouns in singular form (`phone`, `mouse`, `notebook`, `cup`). Agree on the list as a team, and pick an existing class from the chips before creating a new one, so that `notebook` and `notebooks` do not both appear.

Images uploaded before v2 (2026-10-18) sit directly in `<Name>/` without a class folder.

---

## 3. Per-image metadata

Stored as JSON in the Drive file description:

| Key | Meaning |
|---|---|
| `user`, `class` | Final folder names |
| `capturedAt`, `uploadedAt` | ISO timestamps (UTC) |
| `scenario` | 1–5 in wizard mode, `null` in free mode |
| `mode` | `wizard` or `free` |
| `mirror` | `true` if the saved frame is horizontally flipped |
| `width`, `height` | Frame resolution |
| `camera` | Camera label reported by the browser |
| `luminance` | Mean centre luma (0–255) at capture time |
| `app` | Client version (`web-2.0`) |

---

## 4. Guided scenarios

The wizard walks through five scenarios per **person + class**. Progress is stored in the browser, so switching from `mouse` to `notebook` starts a fresh run and switching back restores it.

| # | Scenario | What to do | Frames |
|---|---|---|---|
| 1 | Düz və paralel | Hold the object straight and parallel to the camera; front and back | 10 |
| 2 | Müxtəlif bucaqlar | Tilt 30–45° left, right, up and down | 10 |
| 3 | Yaxın və uzaq | 20–30 cm up to about 1 m; also near the corners and edges of the frame | 10 |
| 4 | Fərqli tutuş | Left hand, right hand, both hands, partial occlusion by fingers | 10 |
| 5 | Qarışıq mühit | Other objects on the desk; object resting on the desk; different backgrounds | 15 |

When a scenario reaches its target, the wizard moves to the next unfinished one. *Sərbəst* (free) mode does not count towards the scenarios.

---

## 5. Image quality

- **Lighting** (mean luma of the centre region): below 55 shows *İşıq zəifdir*, above 215 shows *Kadr çox işıqlıdır*. Captures are still allowed, because some dark or bright frames are useful, but aim for the green state most of the time.
- **Clean frames:** the grid, corner marks and HUD are drawn on an overlay canvas and never appear in the saved JPEG.
- **What you see is what is saved:** the preview uses `object-fit: contain` at the camera's real aspect ratio, so the visible area is exactly the saved frame.
- **Mirror:** on by default, matching `cv2.flip(frame, 1)` in the reference inference daemon. Keep it on for the phone/lens model. The state is recorded per image.

---

## 6. Exporting for training

1. Download the class folders you need from Drive (for example `Lens_Dataset/*/phone/`).
2. Copy them into the reference repo, for example `lens-detection-ref/data/captures/images/<class>/`.
3. Index and deduplicate:
   ```powershell
   python tools/collect_dataset_images.py data/captures/images --from-default-sources
   ```
4. Annotate (Roboflow) and train as described in the reference repo.
