# 🚫🐱 NoCats Browser

A Firefox extension that **blocks cat images** using on-device machine learning and **filters all cat-related text** from web pages. Everything runs 100% on your device — no data is ever sent to any server.

👉 **[Download on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/nocats-browser/)**

[![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/nocats-browser/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-MobileNetV2-FF6F00?logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)

---

## ✨ Features

### 🖼️ Image Blocking (ML-Powered)
- **On-device image classification** using MobileNetV2 (TensorFlow.js)
- Detects **all cat species**: domestic cats, lions, tigers, leopards, cheetahs, jaguars, panthers, cougars, pumas, lynx, and more
- **Scan-first mode** — pages are hidden until all images are scanned, then revealed
- Handles **lazy-loaded images** (WordPress, SPAs) via periodic rescanning
- Scans **CSS background images** too
- Adjustable confidence threshold via popup settings

### 📝 Text Filtering
- Filters **cat-related words** with `███` blocks
- Covers all cat species names: lion, tiger, leopard, cheetah, jaguar, etc.
- Covers cat breeds: Persian, Siamese, Maine Coon, Bengal, Ragdoll, Sphynx, etc.
- Covers related terms: kitten, feline, meow, purr, catnip, whiskers, litter box
- Handles **leetspeak** variations (c4t, k1tt3n, etc.)
- Filters page titles, alt text, and ARIA labels

### 🔒 Privacy First
- **100% on-device** — the ML model runs locally in your browser
- **Zero network requests** for classification
- No tracking, no analytics, no data collection
- Model weights bundled with the extension (~13MB)

---

## 📸 How It Works

1. **Page loads** → Extension hides the page body (opacity: 0)
2. **Text scan** → All cat-related text is immediately redacted
3. **Image scan** → Every image is classified by MobileNetV2
4. **Page reveal** → Once all images are scanned, page smoothly fades in
5. **Continuous monitoring** → MutationObserver + periodic rescan catches dynamic content

---

## 🛠️ Installation

### From Firefox Add-ons (Recommended)
1. Visit the [NoCats Browser listing on AMO](https://addons.mozilla.org/en-US/firefox/addon/nocats-browser/)
2. Click **"Add to Firefox"**

### From Source (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/samirkumar13/NoCats-Browser.git
   ```
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Select `manifest.json` from the cloned directory

---

## ⚙️ Configuration

Click the 🚫🐱 icon in the Firefox toolbar to open the popup settings:

| Setting | Default | Description |
|---------|---------|-------------|
| **Image Blocking** | ✅ On | Enable/disable ML-based cat image detection |
| **Text Filtering** | ✅ On | Enable/disable cat text redaction |
| **Confidence Threshold** | 15% | How confident the model must be to block an image |

### Threshold Guide
| Threshold | Effect |
|-----------|--------|
| **10%** | Aggressive — catches almost everything feline |
| **15%** | Balanced (default) — good accuracy, rare false positives |
| **25%** | Conservative — only obvious cat photos |
| **50%+** | Very strict — high confidence required |

---

## 🏗️ Architecture

```
NoCats-Browser/
├── manifest.json        # Extension manifest (MV2)
├── background.html      # Background page (loads TF.js)
├── background.js        # ML model loading & image classification
├── content.js           # DOM scanning, text filtering, image blocking
├── content.css          # Scan-first CSS (hide → reveal)
├── popup.html/css/js    # Settings popup UI
├── model/               # MobileNetV2 TFLite model (TFHub)
│   ├── model.json       # Model topology
│   └── group1-shard*    # Weight files (~14MB total)
├── lib/
│   └── tf.min.js        # TensorFlow.js runtime
└── icons/               # Extension icons
```

### Key Technical Details

- **Model**: MobileNetV2 from TensorFlow Hub, converted to TF.js format
- **Input**: 224×224 RGB images, normalized to [0, 1]
- **Output**: 1001 ImageNet classes (background class at index 0)
- **Cat Classes**: 13 feline classes (indices 282–294 in 1001-class model)
- **Backend**: WebGL (preferred) or CPU fallback
- **CSP**: Requires `unsafe-eval` for TF.js CPU backend kernel compilation

---

## 🐛 Known Limitations

- First page load may be slow (~5-10s) while the model loads on CPU backend
- Some sites with aggressive lazy loading may show images briefly before blocking
- Images behind authentication or hotlink protection can't be fetched for classification
- Very small images (<50px) are skipped to avoid false positives on icons

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Credits

- [TensorFlow.js](https://www.tensorflow.org/js) — On-device ML runtime
- [MobileNetV2](https://tfhub.dev/google/imagenet/mobilenet_v2_100_224/classification/5) — Image classification model from TensorFlow Hub
- [ImageNet](https://www.image-net.org/) — Training dataset with 1000+ object categories

---

<p align="center">
  Made with ❤️ and a healthy fear of cats
</p>
