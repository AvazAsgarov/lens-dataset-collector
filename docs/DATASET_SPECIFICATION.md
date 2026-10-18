# Dataset Specification & Collection Guidelines

This document outlines the computer vision requirements, camera geometry, guidance scenarios, and formatting specifications for collecting lens/phone detection datasets.

---

## 1. Computer Vision Threat Model

**Objective:**  
Detect when an insider or user points a smartphone camera, lens, or recording device at a computer screen to covertly photograph sensitive data (Data Loss Prevention / DLP screen shield).

**Model Context (from `lkazimzadehh/lens-detection`):**
- **Model Checkpoint:** 1024px custom-trained YOLO checkpoint (`models/best.pt`).
- **Detection Target:** Custom phone class (class `0`).
- **Operating Resolution:** 1024px input size, validation confidence threshold `0.60`.
- **Invariance Requirement:** The inference daemon (`src/run_shield.py`) executes a horizontal mirror flip on camera frames before inference:
  ```python
  frame = cv2.flip(frame, 1)
  ```
  Therefore, our data collector **must** mirror frames during capture so that training data and production inference reside in the exact same geometric domain.

---

## 2. The 5 Guided Collection Scenarios

The web application includes an automated **Step-by-Step Guidance Wizard** (`guidance.js`) that walks users through 5 distinct capture scenarios:

| Step | Scenario Title | Goal & Poses | Target Count |
|---|---|---|---|
| **1** | **Ekrana Paralel və Düz** | Hold phone flat at eye level, directly parallel to the screen and webcam. Alternate between screen-facing and back-camera-facing orientations. | 10 frames |
| **2** | **Müxtəlif Bucaqlar və Maillik** | Tilt phone 30° to 45° left, right, upward, and downward. Real-world adversaries rarely hold devices perfectly square. | 10 frames |
| **3** | **Yaxın və Uzaq Məsafələr** | Vary distance: Extreme close-up (20–30 cm from screen) to medium distance (50–70 cm) to arm's length (1 m+). | 10 frames |
| **4** | **Fərqli Tutuş və Əllər** | Left hand only, right hand only, both hands, fingers partially occluding the edges or bezels of the phone. | 10 frames |
| **5** | **Qarışıq və Əşyalı Mühit** | Hold phone alongside distraction objects: coffee mug, pen, notebook, headphones, or resting flat on the desk facing up. | 15 frames |

---

## 3. Real-Time Lighting & Image Quality Rules

### 3.1. Lighting Thresholds (Luminance)
The client continuously samples video pixels:
$$\text{Luminance} = 0.299R + 0.587G + 0.114B$$

- **Under-exposed ($\text{Luminance} < 55$):**  
  Displays warning: `⚠️ İşıq zəifdir - Otaq işığını yandırın`.  
  *Rationale:* Extremely dark frames cause false negatives and noisy gradients.
- **Over-exposed ($\text{Luminance} > 215$):**  
  Displays warning: `⚠️ Çox parlaqdır - Parıltı yaranır`.  
  *Rationale:* Glare and washed-out highlights obscure the phone's lens and bezel reflections.
- **Optimal ($55 \le \text{Luminance} \le 215$):**  
  Displays confirmation: `✓ İşıqlandırma idealdır`.

### 3.2. Image Artifact Invariance
- **Clean Camera Frame:** The captured JPEG must be extracted directly from the video stream onto an offscreen canvas.
- **No HUD Burn-in:** Bounding boxes, crosshairs, timer overlays, and status badges must **never** appear in the saved image.

---

## 4. Exporting Collected Data for Model Training

Once photos are uploaded to Google Drive:

1. **Folder Layout in Google Drive:**
   ```
   1PIz4lSXEC4cz7PRve9MRHmyTAh8n4wVR/
   ├── Avaz/
   │   ├── Avaz_1792070001000_102.jpg
   │   └── Avaz_1792070004000_105.jpg
   ├── Mahammad/
   │   └── Mahammad_1792070010000_204.jpg
   └── Leyla/
       └── Leyla_1792070020000_301.jpg
   ```
2. **Importing into the ML Pipeline:**
   Download employee folders into `lens-detection-ref/data/captures/images/` and execute:
   ```powershell
   python tools/collect_dataset_images.py data/captures/images --from-default-sources
   ```
   This performs SHA-256 deduplication and prepares a clean batch for Roboflow annotation and YOLO model retraining.
