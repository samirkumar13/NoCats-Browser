/**
 * NoCats Browser — Popup Script
 * Manages settings and displays stats from the background script.
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ─── Elements ──────────────────────────────────────────────────────
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const imageBlocking = document.getElementById('imageBlocking');
const textFiltering = document.getElementById('textFiltering');
const confidenceThreshold = document.getElementById('confidenceThreshold');
const thresholdValue = document.getElementById('thresholdValue');
const cacheSize = document.getElementById('cacheSize');
const backendType = document.getElementById('backendType');

// ─── Load current settings ─────────────────────────────────────────
function loadSettings() {
    browserAPI.storage.local.get(['nocats_settings'], (result) => {
        if (result.nocats_settings) {
            const s = result.nocats_settings;
            imageBlocking.checked = s.imageBlocking !== false;
            textFiltering.checked = s.textFiltering !== false;
            confidenceThreshold.value = Math.round((s.confidenceThreshold || 0.15) * 100);
            thresholdValue.textContent = confidenceThreshold.value;
        }
    });
}

// ─── Save settings ─────────────────────────────────────────────────
function saveSettings() {
    const settings = {
        imageBlocking: imageBlocking.checked,
        textFiltering: textFiltering.checked,
        confidenceThreshold: parseInt(confidenceThreshold.value) / 100,
    };
    browserAPI.storage.local.set({ nocats_settings: settings });
}

// ─── Event listeners ───────────────────────────────────────────────
imageBlocking.addEventListener('change', saveSettings);
textFiltering.addEventListener('change', saveSettings);
confidenceThreshold.addEventListener('input', () => {
    thresholdValue.textContent = confidenceThreshold.value;
    saveSettings();
});

// ─── Fetch stats from background ───────────────────────────────────
function updateStats() {
    browserAPI.runtime.sendMessage({ type: 'getStats' }, (response) => {
        if (response) {
            cacheSize.textContent = response.cacheSize || 0;
            backendType.textContent = response.backend || '—';

            if (response.modelReady) {
                statusDot.classList.add('ready');
                statusDot.classList.remove('loading');
                statusText.textContent = 'Model ready';
            } else {
                statusDot.classList.add('loading');
                statusDot.classList.remove('ready');
                statusText.textContent = 'Loading model...';
            }
        }
    });
}

// ─── Init ──────────────────────────────────────────────────────────
loadSettings();
updateStats();

// Refresh stats every 2 seconds while popup is open
setInterval(updateStats, 2000);
