/**
 * NoCats Browser — Content Script
 * Filters cat-related text and triggers image classification.
 * Hides the page until initial scan is complete ("scan first, show later").
 */

(() => {
    'use strict';

    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

    // ─── Settings (fetched from background) ─────────────────────────
    let settings = {
        imageBlocking: true,
        textFiltering: true,
    };
    let modelReady = false;

    // Fetch settings from background
    browserAPI.runtime.sendMessage({ type: 'getSettings' }, (response) => {
        if (browserAPI.runtime.lastError) {
            console.error('[NoCats] Settings fetch error:', browserAPI.runtime.lastError.message);
            init();
            return;
        }
        if (response && response.settings) {
            settings = response.settings;
            modelReady = response.modelReady || false;
            console.log('[NoCats] Settings loaded. imageBlocking:', settings.imageBlocking, 'modelReady:', modelReady);
        } else {
            console.warn('[NoCats] No settings response, using defaults');
        }
        init();
    });

    // ─── Cat text regex patterns ────────────────────────────────────
    // ─── Cat species & related terms ─────────────────────────────────
    // Matches: cat/cats/kitten/kitty/feline/meow + all cat species names
    const CAT_SPECIES_REGEX = /\b(?:lions?|tigers?|leopards?|cheetahs?|jaguars?|panthers?|cougars?|pumas?|lynx(?:es)?|bobcats?|ocelots?|servals?|caracals?|margays?|wildcats?|snow\s*leopards?|mountain\s*lions?|tabby|tabbies|persian\s*cats?|siamese\s*cats?|maine\s*coons?|bengals?\s*cats?|ragdolls?|sphynx|sphinx\s*cats?|calico|manx|burmese|abyssinians?|scottish\s*folds?|british\s*shorthairs?)\b/gi;
    const COMBINED_CAT_REGEX = /\b[ck][\s.\-_]*[a@4][\s.\-_]*[t7]\w*|k[i1!][t7]{1,2}[e3]ns?|k[i1!][t7]{2}(?:y|ie|ies)?|f[e3]l[i1!]n[e3]s?|m[e3][o0]w+s?|purr(?:s|ing|ed)?|catnip|litter\s*box(?:es)?|whiskers?\b/gi;

    const REPLACEMENT = '███';

    // ─── Text filtering ─────────────────────────────────────────────
    function filterTextNode(textNode) {
        if (!settings.textFiltering) return;

        const original = textNode.nodeValue;
        if (!original || original.trim().length === 0) return;

        const filtered = original
            .replace(CAT_SPECIES_REGEX, REPLACEMENT)
            .replace(COMBINED_CAT_REGEX, REPLACEMENT);

        if (filtered !== original) {
            textNode.nodeValue = filtered;
        }
    }

    function filterElement(element) {
        if (!settings.textFiltering) return;

        const attrsToFilter = ['alt', 'title', 'placeholder', 'aria-label'];
        attrsToFilter.forEach((attr) => {
            const val = element.getAttribute?.(attr);
            if (val) {
                const filtered = val
                    .replace(CAT_SPECIES_REGEX, REPLACEMENT)
                    .replace(COMBINED_CAT_REGEX, REPLACEMENT);
                if (filtered !== val) {
                    element.setAttribute(attr, filtered);
                }
            }
        });
    }

    function walkAndFilterText(root) {
        if (!settings.textFiltering) return;

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    const tag = parent.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'INPUT') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                },
            }
        );

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach(filterTextNode);

        if (root.querySelectorAll) {
            root.querySelectorAll('[alt], [title], [placeholder], [aria-label]').forEach(filterElement);
        }
    }

    // ─── Filter page title ──────────────────────────────────────────
    function filterPageTitle() {
        if (!settings.textFiltering) return;
        if (document.title) {
            const filtered = document.title
                .replace(CAT_SPECIES_REGEX, REPLACEMENT)
                .replace(COMBINED_CAT_REGEX, REPLACEMENT);
            if (filtered !== document.title) {
                document.title = filtered;
            }
        }
    }

    // ─── Image scanning & classification ────────────────────────────
    const processedImages = new WeakSet();

    function getImageUrl(img) {
        // Check standard src first, then lazy-loading attributes
        return img.currentSrc || img.src
            || img.getAttribute('data-src')
            || img.getAttribute('data-lazy-src')
            || img.getAttribute('data-original')
            || img.getAttribute('data-srcset')?.split(',')[0]?.trim()?.split(' ')[0]
            || '';
    }

    function isValidImageUrl(url) {
        if (!url) return false;
        if (url.startsWith('data:')) return false;
        if (url.startsWith('blob:')) return false;
        if (url === '') return false;
        if (url.includes('1x1') || url.includes('pixel') || url.includes('spacer')) return false;
        return true;
    }

    /**
     * Classify a single image and block/reveal it.
     * Returns a promise that resolves when classification is done.
     */
    function classifyAndBlockImage(img) {
        return new Promise((resolve) => {
            const url = getImageUrl(img);
            if (!url || !isValidImageUrl(url)) {
                resolve();
                return;
            }
            if (processedImages.has(img)) {
                resolve();
                return;
            }

            processedImages.add(img);

            // Apply pending blur
            img.setAttribute('data-nocats-pending', 'true');

            console.log('[NoCats] Sending image for classification:', url.substring(0, 100));

            browserAPI.runtime.sendMessage({
                type: 'classifyImage',
                url: url,
            }, (response) => {
                if (browserAPI.runtime.lastError) {
                    console.error('[NoCats] Message error:', browserAPI.runtime.lastError.message);
                    img.setAttribute('data-nocats-safe', 'true');
                    img.removeAttribute('data-nocats-pending');
                    resolve();
                    return;
                }

                console.log('[NoCats] Classification result for', url.substring(0, 60), ':', response);

                if (response && response.isCat) {
                    // Block the cat image
                    img.setAttribute('data-nocats-blocked', 'true');
                    img.removeAttribute('data-nocats-pending');
                    img.setAttribute('alt', '🚫 Image blocked by NoCats');
                    img.setAttribute('title', 'This image was blocked because it contains a cat');
                    filterElement(img);
                    console.log('[NoCats] 🐱 BLOCKED cat image:', url.substring(0, 80));
                } else {
                    // Safe image — remove blur
                    img.setAttribute('data-nocats-safe', 'true');
                    img.removeAttribute('data-nocats-pending');
                    console.log('[NoCats] ✅ Safe image:', url.substring(0, 80));
                }
                resolve();
            });
        });
    }

    /**
     * Scan all images in root. Returns a promise that resolves when all
     * images in the initial scan are classified.
     */
    function scanImages(root) {
        if (!settings.imageBlocking) {
            console.log('[NoCats] Image blocking disabled, skipping scan');
            return Promise.resolve();
        }

        const images = [];
        if (root && root.nodeType === Node.ELEMENT_NODE && root.tagName === 'IMG') {
            images.push(root);
        }
        if (root && root.querySelectorAll) {
            root.querySelectorAll('img').forEach((img) => images.push(img));
        }

        const rootLabel = root && root.tagName ? root.tagName : 'root';
        console.log('[NoCats] Found', images.length, 'total <img> elements in', rootLabel);

        const promises = [];
        let skippedCount = 0;
        let queuedCount = 0;
        let waitingCount = 0;

        images.forEach((img) => {
            if (processedImages.has(img)) {
                skippedCount++;
                return;
            }

            const url = getImageUrl(img);
            if (!isValidImageUrl(url)) {
                skippedCount++;
                return;
            }

            // If image is already loaded and we can check its size
            if (img.complete && img.naturalWidth > 0) {
                // Skip tiny images (icons, spacers)
                if (img.naturalWidth < 50 || img.naturalHeight < 50) {
                    img.setAttribute('data-nocats-safe', 'true');
                    processedImages.add(img);
                    skippedCount++;
                    return;
                }
            }

            // Classify ALL images immediately by URL — the background script
            // fetches via fetch() independently, so we don't need the browser
            // to have loaded the image. This fixes lazy-loaded images.
            queuedCount++;
            promises.push(classifyAndBlockImage(img));
        });

        console.log(`[NoCats] Scan summary: ${queuedCount} ready to classify, ${skippedCount} skipped`);

        return Promise.all(promises);
    }

    // ─── MutationObserver for dynamic content ───────────────────────
    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        filterTextNode(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        walkAndFilterText(node);
                        scanImages(node);
                        filterElement(node);
                    }
                }

                if (mutation.type === 'characterData') {
                    filterTextNode(mutation.target);
                }

                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (target.tagName === 'IMG' && ['src', 'srcset', 'data-src', 'data-lazy-src', 'data-original'].includes(mutation.attributeName)) {
                        processedImages.delete(target);
                        target.removeAttribute('data-nocats-pending');
                        target.removeAttribute('data-nocats-safe');
                        target.removeAttribute('data-nocats-blocked');
                        classifyAndBlockImage(target);
                    }
                    if (['alt', 'title', 'placeholder', 'aria-label'].includes(mutation.attributeName)) {
                        filterElement(target);
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'data-src', 'data-lazy-src', 'data-original', 'alt', 'title', 'placeholder', 'aria-label'],
        });
    }

    // ─── Periodic rescan for missed images ──────────────────────────
    function periodicRescan() {
        if (!settings.imageBlocking) return;

        const allImages = document.querySelectorAll('img');
        let newCount = 0;
        allImages.forEach((img) => {
            if (processedImages.has(img)) return;
            const url = getImageUrl(img);
            if (!isValidImageUrl(url)) return;
            // Skip tiny loaded images
            if (img.complete && img.naturalWidth > 0 && (img.naturalWidth < 50 || img.naturalHeight < 50)) return;
            newCount++;
            classifyAndBlockImage(img);
        });

        // Also scan CSS background images
        const bgElements = document.querySelectorAll('[style*="background"]');
        bgElements.forEach((el) => {
            if (el.hasAttribute('data-nocats-bg-checked')) return;
            const bg = window.getComputedStyle(el).backgroundImage;
            if (!bg || bg === 'none') return;
            const urlMatch = bg.match(/url\(["']?(.*?)["']?\)/);
            if (urlMatch && isValidImageUrl(urlMatch[1])) {
                el.setAttribute('data-nocats-bg-checked', 'true');
                browserAPI.runtime.sendMessage({
                    type: 'classifyImage',
                    url: urlMatch[1],
                }, (response) => {
                    if (response && response.isCat) {
                        el.style.backgroundImage = 'none';
                        el.setAttribute('data-nocats-blocked', 'true');
                        console.log('[NoCats] 🐱 Blocked background image:', urlMatch[1].substring(0, 80));
                    }
                });
            }
        });

        if (newCount > 0) {
            console.log(`[NoCats] Periodic rescan: found ${newCount} new images`);
        }
    }

    // ─── Initialization ─────────────────────────────────────────────
    let initialized = false;

    async function init() {
        if (initialized) return;
        initialized = true;

        console.log('[NoCats] Content script initializing (scan-first mode)...');
        console.log('[NoCats] Settings:', JSON.stringify(settings));

        // Phase 1: Filter all existing text IMMEDIATELY
        walkAndFilterText(document.body);
        filterPageTitle();

        // Phase 2: Scan all existing images and WAIT for all to be classified
        const scanStart = performance.now();
        await scanImages(document.body);
        const scanTime = (performance.now() - scanStart).toFixed(0);

        // Phase 3: Reveal the page! 🎉
        document.documentElement.setAttribute('data-nocats-ready', 'true');
        console.log(`[NoCats] Initial scan complete in ${scanTime}ms — page revealed!`);

        // Phase 4: Watch for dynamic content (new images, text changes)
        setupObserver();

        // Phase 5: Periodic rescan to catch anything we missed (WordPress lazy loaders, etc.)
        setInterval(periodicRescan, 3000);

        // Re-filter title periodically (SPAs may change it)
        setInterval(filterPageTitle, 2000);

        console.log('[NoCats] Content script ready.');
    }

    // Timeout safety net — never leave the page hidden for more than 15 seconds
    setTimeout(() => {
        if (!document.documentElement.hasAttribute('data-nocats-ready')) {
            console.log('[NoCats] Safety timeout — revealing page');
            document.documentElement.setAttribute('data-nocats-ready', 'true');
        }
    }, 15000);

    // If settings message fails (e.g., background script not loaded), init with defaults
    setTimeout(() => {
        if (!initialized) {
            console.warn('[NoCats] Settings callback never fired, initializing with defaults');
            init();
        }
    }, 3000);
})();
