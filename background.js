/**
 * NoCats Browser — Background Script
 * Loads TensorFlow.js MobileNetV2 model and classifies images on request.
 * All processing happens 100% on-device.
 */

// ─── Cat class indices in ImageNet-1001 (background class at index 0) ───
// These are standard ImageNet-1000 indices +1 for the 1001-class TFHub model.
const CAT_CLASSES = [
  282, // tabby cat
  283, // tiger cat
  284, // Persian cat
  285, // Siamese cat
  286, // Egyptian cat
  287, // cougar, puma, mountain lion
  288, // lynx, catamount
  289, // leopard
  290, // snow leopard
  291, // jaguar
  292, // lion
  293, // tiger
  294, // cheetah
];

// ─── State ──────────────────────────────────────────────────────────
let model = null;
let modelReady = false;

// Promise that resolves when the model is loaded
let modelReadyResolve;
const modelReadyPromise = new Promise((resolve) => {
  modelReadyResolve = resolve;
});

const classificationCache = new Map();
const MAX_CACHE_SIZE = 500;

// ─── Default settings ───────────────────────────────────────────────
let settings = {
  imageBlocking: true,
  textFiltering: true,
  confidenceThreshold: 0.15,
};

// ─── Load settings from storage ─────────────────────────────────────
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.storage.local.get(['nocats_settings'], (result) => {
  if (result.nocats_settings) {
    settings = { ...settings, ...result.nocats_settings };
  }
});

browserAPI.storage.onChanged.addListener((changes) => {
  if (changes.nocats_settings) {
    settings = { ...settings, ...changes.nocats_settings.newValue };
    classificationCache.clear();
  }
});

// ─── Load TF.js model ──────────────────────────────────────────────
async function loadModel() {
  try {
    console.log('[NoCats] Loading MobileNetV2 model...');

    // Try WebGL first, fall back to CPU
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('[NoCats] Using WebGL backend');
    } catch (e) {
      console.log('[NoCats] WebGL not available, trying CPU...');
      await tf.setBackend('cpu');
      await tf.ready();
      console.log('[NoCats] Using CPU backend');
    }

    const modelUrl = browserAPI.runtime.getURL('model/model.json');
    model = await tf.loadGraphModel(modelUrl);

    // Warm up with a dummy tensor
    const warmup = tf.zeros([1, 224, 224, 3]);
    const warmupResult = model.predict(warmup);
    warmupResult.dispose();
    warmup.dispose();

    modelReady = true;
    modelReadyResolve(); // Signal that model is ready

    console.log('[NoCats] ✅ Model loaded and ready!');
  } catch (err) {
    console.error('[NoCats] ❌ Failed to load model:', err);
    console.error('[NoCats] Error details:', err.message || String(err));
    // Still resolve so we don't block forever — classification will just return false
    modelReadyResolve();
  }
}

// Start loading model immediately
loadModel();

// ─── Image classification ───────────────────────────────────────────
async function classifyImage(imageUrl) {
  // Check cache first
  if (classificationCache.has(imageUrl)) {
    return classificationCache.get(imageUrl);
  }

  // WAIT for model to finish loading (this is the key fix!)
  await modelReadyPromise;

  if (!modelReady || !model) {
    console.log('[NoCats] Model failed to load, cannot classify');
    return false;
  }

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.log('[NoCats] Fetch failed for:', imageUrl.substring(0, 80));
      return false;
    }

    const blob = await response.blob();

    // Check if it's actually an image
    if (!blob.type.startsWith('image/')) return false;

    // Skip tiny images (icons, spacers, etc.)
    if (blob.size < 1000) return false;

    const bitmap = await createImageBitmap(blob);

    // Skip very small images (likely icons)
    if (bitmap.width < 50 || bitmap.height < 50) {
      bitmap.close();
      return false;
    }

    // Draw to 224×224 canvas for model input
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 224, 224);
    bitmap.close();

    // Create tensor — TFHub MobileNetV2 expects [0, 1] range input
    const tensor = tf.tidy(() => {
      const img = tf.browser.fromPixels(canvas);
      return img.toFloat().div(255.0).expandDims(0);
    });

    // Run inference
    const predictions = model.predict(tensor);
    const logits = await predictions.data();

    tensor.dispose();
    predictions.dispose();

    // Apply softmax to get probabilities
    const maxLogit = Math.max(...logits);
    const expValues = new Float32Array(logits.length);
    let sumExp = 0;
    for (let i = 0; i < logits.length; i++) {
      expValues[i] = Math.exp(logits[i] - maxLogit);
      sumExp += expValues[i];
    }

    // Sum probabilities for all cat classes
    let catScore = 0;
    for (const classIdx of CAT_CLASSES) {
      catScore += expValues[classIdx] / sumExp;
    }

    // Also find top prediction for debugging
    let topIdx = 0;
    let topScore = 0;
    for (let i = 0; i < expValues.length; i++) {
      const prob = expValues[i] / sumExp;
      if (prob > topScore) {
        topScore = prob;
        topIdx = i;
      }
    }

    const isCat = catScore >= settings.confidenceThreshold;

    // Cache the result
    if (classificationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = classificationCache.keys().next().value;
      classificationCache.delete(firstKey);
    }
    classificationCache.set(imageUrl, isCat);

    console.log(`[NoCats] ${isCat ? '🐱 CAT!' : '✅ Safe'} (cat: ${(catScore * 100).toFixed(1)}%, top: idx=${topIdx} ${(topScore * 100).toFixed(1)}%) — ${imageUrl.substring(0, 80)}`);

    return isCat;
  } catch (err) {
    console.error('[NoCats] Classification error:', err.message, '—', imageUrl.substring(0, 80));
    return false;
  }
}

// ─── Message handling from content scripts ─────────────────────────
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'classifyImage') {
    if (!settings.imageBlocking) {
      sendResponse({ isCat: false });
      return false;
    }
    classifyImage(message.url).then((isCat) => {
      sendResponse({ isCat });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'getSettings') {
    sendResponse({ settings, modelReady });
    return false;
  }

  if (message.type === 'getStats') {
    sendResponse({
      cacheSize: classificationCache.size,
      modelReady,
      backend: tf ? tf.getBackend() : 'unknown',
    });
    return false;
  }

  if (message.type === 'classifyBatch') {
    if (!settings.imageBlocking) {
      const results = {};
      message.urls.forEach(url => results[url] = false);
      sendResponse({ results });
      return false;
    }
    (async () => {
      const results = {};
      for (const url of message.urls) {
        results[url] = await classifyImage(url);
      }
      sendResponse({ results });
    })();
    return true;
  }

  return false;
});

console.log('[NoCats] Background script loaded.');
