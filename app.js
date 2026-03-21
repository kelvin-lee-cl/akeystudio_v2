// Deepseek API Configuration
const DEEPSEEK_API_KEY = 'sk-ec4311eb31674d1ca4aee5645392daf4'; // Replace with your actual API key
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Catch unhandled promise rejections (e.g. FetchError) so buttons still work
window.addEventListener('unhandledrejection', function (event) {
    console.warn('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});

// Cache system
let memoryCache = {};
let lyricsCacheData = null;

// 0243 words cache (pattern -> array of words)
let words0243Cache = null;

// 主題詞語 lexicon (topic.json: topicOrder + per-topic arrays)
let topicLexiconCache = null;

/**
 * Load topic.json once (topicOrder + word lists per topic).
 * @returns {Promise<object|null>}
 */
async function loadTopicLexicon() {
    if (topicLexiconCache) return topicLexiconCache;
    try {
        let res = await fetch('topic.json').catch(function () { return null; });
        if (!res || !res.ok) {
            res = await fetch('./topic.json').catch(function () { return null; });
        }
        if (!res || !res.ok) {
            console.warn('Could not load topic.json:', res && res.status);
            topicLexiconCache = null;
            return null;
        }
        topicLexiconCache = await res.json();
        if (!topicLexiconCache || typeof topicLexiconCache !== 'object' || Array.isArray(topicLexiconCache)) {
            topicLexiconCache = {};
        }
        return topicLexiconCache;
    } catch (err) {
        console.error('Error loading topic.json:', err);
        topicLexiconCache = null;
        return null;
    }
}

/**
 * Return word strings for a topic from topic.json (one word per cell; phrases are two words each).
 * @param {string} topic
 * @returns {Promise<string[]>}
 */
async function getTopicWordsForTopic(topic) {
    const data = await loadTopicLexicon();
    const t = String(topic).trim();
    if (!data || t === 'topicOrder') return [];
    const arr = data[t];
    return Array.isArray(arr) ? arr : [];
}

function renderTopicPageButtons() {
    const grid = document.getElementById('topicButtonsGrid');
    if (!grid) return;
    if (!topicLexiconCache) {
        loadTopicLexicon().then(function () {
            renderTopicPageButtons();
        }).catch(function () { });
        return;
    }
    const order = topicLexiconCache.topicOrder;
    if (!Array.isArray(order) || order.length === 0) return;
    grid.innerHTML = '';
    order.forEach(function (topic) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'topic-btn';
        btn.setAttribute('data-topic', topic);
        const span = document.createElement('span');
        span.className = 'topic-label';
        span.textContent = topic;
        btn.appendChild(span);
        grid.appendChild(btn);
    });
}
window.renderTopicPageButtons = renderTopicPageButtons;

/**
 * Fetch 0243.json and return words for the given canonical 2-digit pattern (e.g. "00", "02").
 * Note: the app normalizes user input digits to canonical patterns using digitToCanonical0243.
 *
 * @param {string} pattern - Canonical pattern key (two digits from 0,2,3,4), e.g. "00", "02"
 * @returns {Promise<string[]>} Array of words
 */
async function get0243WordsForPattern(pattern) {
    // Guard: only allow canonical keys.
    if (!/^[0234]{2}$/.test(pattern)) return [];

    if (!words0243Cache) {
        try {
            // Try relative to current page (works when served via http(s))
            let res = await fetch('0243.json').catch(function () { return null; });
            if (!res || !res.ok) {
                res = await fetch('./0243.json').catch(function () { return null; });
            }
            if (!res || !res.ok) {
                const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
                throw new Error(
                    isFileProtocol
                        ? '無法在 file:// 下載詞庫。請用本地伺服器開啟（例如在專案目錄執行：npx serve 或 python -m http.server 8080）'
                        : '無法載入 0243.json（' + (res ? res.status : '網絡錯誤') + '）'
                );
            }

            words0243Cache = await res.json();
            if (!words0243Cache || typeof words0243Cache !== 'object' || Array.isArray(words0243Cache)) {
                words0243Cache = {};
            }
        } catch (err) {
            console.error('Error loading 0243.json:', err);
            words0243Cache = {};
            throw err;
        }
    }
    return words0243Cache[pattern] || [];
}

// Firebase functions
async function saveJsonToFirebase(jsonData, inputKey) {
    try {
        if (!window.firebaseDb) {
            console.warn('⚠ Firebase not initialized, skipping save to Firebase');
            return false;
        }

        const db = window.firebaseDb;

        // Save to Firebase with input key as document ID
        await db.collection('lyricsCache').doc(inputKey).set({
            data: jsonData,
            updatedAt: new Date().toISOString(),
            input: inputKey
        }, { merge: true });

        console.log('✓ JSON saved to Firebase:', inputKey);
        console.log('  Collection: lyricsCache');
        console.log('  Document ID:', inputKey);
        return true;
    } catch (error) {
        console.error('✗ Error saving to Firebase:', error);
        console.error('  Error details:', error.message);

        if (error.message && error.message.includes('permissions')) {
            console.error('');
            console.error('⚠ FIREBASE PERMISSIONS ERROR');
            console.error('You need to update Firestore security rules to allow read/write access.');
            console.error('Go to Firebase Console → Firestore Database → Rules');
            console.error('Update rules to:');
            console.error('  rules_version = \'2\';');
            console.error('  service cloud.firestore {');
            console.error('    match /databases/{database}/documents {');
            console.error('      match /lyricsCache/{document=**} {');
            console.error('        allow read, write: if true;');
            console.error('      }');
            console.error('    }');
            console.error('  }');
            console.error('');
        }
        return false;
    }
}

async function loadJsonFromFirebase(inputKey) {
    try {
        if (!window.firebaseDb) {
            console.warn('Firebase not initialized yet');
            return null;
        }

        const db = window.firebaseDb;
        const docRef = db.collection('lyricsCache').doc(inputKey);
        const docSnap = await docRef.get();

        // Firestore compat SDK returns a DocumentSnapshot where `exists` is a boolean
        // property, not a function. Use `docSnap.exists` instead of `docSnap.exists()`.
        if (docSnap.exists) {
            const data = docSnap.data();
            console.log('✓ JSON loaded from Firebase:', inputKey);
            return data.data || data;
        } else {
            console.log('No Firebase data found for:', inputKey);
            return null;
        }
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        return null;
    }
}

async function loadAllFromFirebase() {
    try {
        if (!window.firebaseDb) {
            console.warn('Firebase not initialized yet');
            return null;
        }

        const db = window.firebaseDb;
        const querySnapshot = await db.collection('lyricsCache').get();
        const firebaseData = {};

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const inputKey = data.input || doc.id;
            firebaseData[inputKey] = data.data || data;
        });

        console.log('✓ All data loaded from Firebase');
        return firebaseData;
    } catch (error) {
        console.error('Error loading all from Firebase:', error);

        if (error.message && error.message.includes('permissions')) {
            console.error('');
            console.error('⚠ FIREBASE PERMISSIONS ERROR');
            console.error('You need to update Firestore security rules to allow read/write access.');
            console.error('Go to Firebase Console → Firestore Database → Rules');
            console.error('Update rules to:');
            console.error('  rules_version = \'2\';');
            console.error('  service cloud.firestore {');
            console.error('    match /databases/{database}/documents {');
            console.error('      match /lyricsCache/{document=**} {');
            console.error('        allow read, write: if true;');
            console.error('      }');
            console.error('    }');
            console.error('  }');
            console.error('');
        }
        return null;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function () {
    console.log('✓ app.js loaded');

    // Bind the lyric form immediately. If we await Firebase/cache first, a fast submit
    // (e.g. 0243 after hard refresh) does a native form navigation and reloads the page.
    const lyricForm = document.getElementById('lyricForm');
    if (lyricForm) {
        lyricForm.addEventListener('submit', handleFormSubmit);
    }

    loadLocalStorageCache();

    void loadTopicLexicon().then(function () {
        renderTopicPageButtons();
    }).catch(function () { });

    // Load Firebase + lyrics cache without blocking UI binding above
    void (async function initAppData() {
        try {
            // Wait for Firebase to initialize (check every 100ms, max 3 seconds)
            let firebaseReady = false;
            for (let i = 0; i < 30; i++) {
                if (window.firebaseDb) {
                    firebaseReady = true;
                    console.log('✓ Firebase is ready');
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!firebaseReady) {
                console.warn('⚠ Firebase not ready after 3 seconds, continuing without Firebase');
            } else {
                try {
                    console.log('Loading data from Firebase...');
                    const firebaseData = await loadAllFromFirebase();
                    if (firebaseData && Object.keys(firebaseData).length > 0) {
                        memoryCache = { ...memoryCache, ...firebaseData };
                        console.log('✓ Firebase data merged into cache:', Object.keys(firebaseData).length, 'items');
                    } else {
                        console.log('ℹ No data found in Firebase (this is normal for first use)');
                    }
                } catch (fbErr) {
                    console.warn('Firebase load failed (continuing without):', fbErr && fbErr.message ? fbErr.message : fbErr);
                }
            }

            await loadLyricsCache();
        } catch (initErr) {
            console.warn('Init load error (continuing):', initErr && initErr.message ? initErr.message : initErr);
        }
    })();

    // Allow scrolling the page when results container hits edges
    setupResultsScrollChaining();

    // Make the 0243 hero header collapsible based on scroll position
    setupHeroCollapseOnScroll();

    // Regenerate button (主題詞語：換兩個詞；其他：tone pattern modal)
    const regenerateBtn = document.getElementById('regenerateBtn');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', function () {
            if (window.currentResult && window.currentResult.fromTopicLexicon) {
                return;
            }
            if (window.currentResult && window.currentResult.topicModeWords) {
                handleTopicRegenerate();
            } else if (window.currentResult && window.currentResult.fullSongMode) {
                handleFullSongRegenerate();
            } else {
                openRegenerateModal();
            }
        });
    }

    // Regenerate modal handlers
    setupRegenerateModal();

    setupResultsBoxCopy();

    // View JSON button
    const viewJsonBtn = document.getElementById('viewJsonBtn');
    if (viewJsonBtn) {
        viewJsonBtn.addEventListener('click', toggleJsonOutput);
    }

    // Edit JSON button
    const editJsonBtn = document.getElementById('editJsonBtn');
    if (editJsonBtn) {
        editJsonBtn.addEventListener('click', enableJsonEdit);
    }

    // Save JSON button
    const saveJsonBtn = document.getElementById('saveJsonBtn');
    if (saveJsonBtn) {
        saveJsonBtn.addEventListener('click', saveJsonEdit);
    }

    // Cancel JSON edit button
    const cancelJsonBtn = document.getElementById('cancelJsonBtn');
    if (cancelJsonBtn) {
        cancelJsonBtn.addEventListener('click', cancelJsonEdit);
    }

    // Update cache button
    const updateCacheBtn = document.getElementById('updateCacheBtn');
    if (updateCacheBtn) {
        updateCacheBtn.addEventListener('click', updateCacheFile);
    }

    // Download cache button
    const downloadCacheBtn = document.getElementById('downloadCacheBtn');
    if (downloadCacheBtn) {
        downloadCacheBtn.addEventListener('click', downloadCache);
    }

    // My Lyrics button
    const myLyricsBtn = document.getElementById('myLyricsBtn');
    if (myLyricsBtn) {
        myLyricsBtn.addEventListener('click', openMyLyricsModal);
    }

    // My Lyrics modal handlers
    setupMyLyricsModal();

    // Login panel and Firebase Auth
    setupLoginPanel();
    setupInboxPanel();
    if (window.firebaseAuth) {
        window.firebaseAuth.onAuthStateChanged(function (user) {
            updateLoginUI(user);
        });
    }
    window.openLoginPanel = openLoginPanel;
    window.openMyLyricsModal = openMyLyricsModal;
    window.openInboxPanel = openInboxPanel;

    // Hero image: in 0243 / 主題詞語 results mode it becomes a small “navbar icon”
    // that sits directly next to the input box.
    // Clicking it re-expands the header if it has been collapsed while scrolling.
    const heroImage = document.getElementById('heroImage');
    const heroContainer = heroImage ? heroImage.closest('.hero-image-container') : null;
    const heroClickTarget = heroContainer || heroImage;
    if (heroClickTarget) {
        heroClickTarget.addEventListener('click', function () {
            // Only react for the compact-header experiences.
            const mode = document.body.dataset.lastResultMode;
            if (mode !== '0243' && mode !== 'topic') return;

            // Re-open / expand the hero header.
            document.body.classList.remove('hero-collapsed-0243');

            // Scroll near the top so the user can actually see the expanded header.
            const mainPane = document.getElementById('mainPane');
            if (mainPane) mainPane.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            else window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        });
    }
});

// Move hero image container so it sits directly next to the input box.
function moveHeroNextToInput() {
    const heroContainer = document.querySelector('.hero-image-container');
    const inputSection = document.querySelector('.input-section');
    if (!heroContainer || !inputSection) return;

    // Already moved?
    if (inputSection.contains(heroContainer)) return;

    // Insert hero at the start of the input section row.
    inputSection.insertBefore(heroContainer, inputSection.firstChild);
    heroContainer.classList.add('hero-inline-with-input');
}

/**
 * Scroll so `el` is visible inside `#mainPane` (the real scroll container in the split layout).
 * `scrollIntoView` alone often fails or mis-scrolls when the hero moves after layout.
 */
function scrollElementIntoMainPane(el, options) {
    const opts = options || {};
    const pad = typeof opts.padding === 'number' ? opts.padding : 8;
    const behavior = opts.behavior || 'smooth';
    if (!el) return;
    const mainPane = document.getElementById('mainPane');
    if (!mainPane) {
        el.scrollIntoView({ behavior: behavior, block: 'start' });
        return;
    }
    const elRect = el.getBoundingClientRect();
    const paneRect = mainPane.getBoundingClientRect();
    const nextTop = mainPane.scrollTop + (elRect.top - paneRect.top) - pad;
    mainPane.scrollTo({ top: Math.max(0, nextTop), left: 0, behavior: behavior });
}

/**
 * Move hero inline first, wait for layout, then scroll the main pane to the results block.
 * Order matters: scrolling before `moveHeroNextToInput` leaves results off-screen (felt like “submit twice”).
 */
function revealResultsSectionInMainPane() {
    const resultsSection = document.getElementById('resultsSection');
    if (!resultsSection) return;
    moveHeroNextToInput();
    resultsSection.scrollTop = 0;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            scrollElementIntoMainPane(resultsSection);
        });
    });
}

// Reset hero image container back into the header (original position).
function resetHeroPosition() {
    const heroContainer = document.querySelector('.hero-image-container');
    const header = document.querySelector('header');
    if (!heroContainer || !header) return;

    if (header.contains(heroContainer)) return;
    header.insertBefore(heroContainer, header.firstChild);
    heroContainer.classList.remove('hero-inline-with-input');
}
window.resetHeroPosition = resetHeroPosition;

// When compact results are visible, collapse the hero header as the user scrolls down.
function setupHeroCollapseOnScroll() {
    const mainPane = document.getElementById('mainPane');
    const scrollTarget = mainPane || window;

    if (!scrollTarget) return;

    const getScrollTop = () => {
        if (scrollTarget === window) {
            return window.scrollY || document.documentElement.scrollTop || 0;
        }
        return scrollTarget.scrollTop || 0;
    };

    const threshold = 120; // px before we consider the hero "collapsed"

    const onScroll = () => {
        const mode = document.body.dataset.lastResultMode;
        if (mode !== '0243' && mode !== 'topic') {
            document.body.classList.remove('hero-collapsed-0243');
            return;
        }

        const scrollTop = getScrollTop();
        if (scrollTop > threshold) {
            document.body.classList.add('hero-collapsed-0243');
        } else {
            document.body.classList.remove('hero-collapsed-0243');
        }
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
}

function setupResultsScrollChaining() {
    const resultsSection = document.getElementById('resultsSection');
    if (!resultsSection) return;

    // In this app, the main scroll container is usually the split-view main pane,
    // not the window. If we call window.scrollBy() while the main pane owns scroll,
    // it will appear as if scrolling is "broken" (especially when resultsSection
    // prevents default wheel events at its edges).
    const mainPane =
        document.getElementById('mainPane') ||
        resultsSection.closest('.split-view-main-pane');

    const shouldChain = (deltaY) => {
        const atTop = resultsSection.scrollTop <= 0;
        const atBottom =
            Math.ceil(resultsSection.scrollTop + resultsSection.clientHeight) >= resultsSection.scrollHeight;
        return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
    };

    const chainScrollBy = (deltaY) => {
        if (mainPane && typeof mainPane.scrollBy === 'function') {
            mainPane.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
            return;
        }
        window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    };

    resultsSection.addEventListener(
        'wheel',
        (e) => {
            if (!shouldChain(e.deltaY)) return;
            e.preventDefault();
            chainScrollBy(e.deltaY);
        },
        { passive: false }
    );

    // iOS/Safari: help page scroll when swiping at results edges
    resultsSection.addEventListener(
        'touchmove',
        (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            // We can't read swipe direction directly here reliably; keep default
            // behavior unless we're already at an edge.
            const atTop = resultsSection.scrollTop <= 0;
            const atBottom =
                Math.ceil(resultsSection.scrollTop + resultsSection.clientHeight) >= resultsSection.scrollHeight;
            if (!atTop && !atBottom) return;
            // Let the browser scroll the page instead of trapping inside results.
            // (Don't preventDefault.)
        },
        { passive: true }
    );
}

// Load lyrics cache from JSON file
async function loadLyricsCache() {
    try {
        const response = await fetch('lyrics-cache.json');
        if (!response.ok) {
            lyricsCacheData = null;
            return;
        }
        lyricsCacheData = await response.json();
        console.log('✓ Loaded lyrics-cache.json');
    } catch (error) {
        var msg = (error && (error.message || error.name)) ? (error.message || error.name) : String(error);
        console.warn('Could not load lyrics-cache.json:', msg);
        lyricsCacheData = null;
    }
}

// Load cache from localStorage
function loadLocalStorageCache() {
    try {
        const cached = localStorage.getItem('lyricsCache');
        if (cached) {
            const parsed = JSON.parse(cached);
            memoryCache = { ...memoryCache, ...parsed };
            console.log('✓ Loaded cache from localStorage');
        }
    } catch (error) {
        console.warn('Could not load localStorage cache:', error);
    }
}

// Save cache to localStorage
function saveToLocalStorage(cacheData) {
    try {
        localStorage.setItem('lyricsCache', JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Could not save to localStorage:', error);
    }
}

// Digit to tone mapping (canonical 0,2,3,4)
const digitToTones = {
    '0': [4],
    '2': [6, 9],
    '3': [1, 2, 7],
    '4': [3, 5, 8]
};

// 0243 page: map user digits 0–9 to canonical 0,2,3,4
// 1＝3＝9, 4＝5＝8, 2＝6, 0＝0. 7 maps to 3 (tone 7 is in group 3).
const digitToCanonical0243 = {
    '0': '0',
    '1': '3', '3': '3', '7': '3', '9': '3',
    '2': '2', '6': '2',
    '4': '4', '5': '4', '8': '4'
};

/** Normalize 0243 input (e.g. "19" → "33") for lookup in 0243.json */
function normalize0243Input(input) {
    if (!/^[0-9]{2}$/.test(input)) return null;
    const a = digitToCanonical0243[input[0]];
    const b = digitToCanonical0243[input[1]];
    if (a == null || b == null) return null;
    return a + b;
}

// Generate all possible tone patterns from input digits
function generateTonePatterns(input) {
    const digits = input.split('');
    const toneOptions = digits.map(digit => digitToTones[digit] || []);

    // Generate all combinations
    function generateCombinations(arrays) {
        if (arrays.length === 0) return [[]];
        const [first, ...rest] = arrays;
        const restCombinations = generateCombinations(rest);
        const result = [];
        for (const option of first) {
            for (const combo of restCombinations) {
                result.push([option, ...combo]);
            }
        }
        return result;
    }

    const combinations = generateCombinations(toneOptions);
    return combinations.map(combo => combo.join(' '));
}

// Check cache for existing results
async function getCachedResult(input) {
    // Check memory cache first
    if (memoryCache[input]) {
        return memoryCache[input];
    }

    // Check Firebase (latest version)
    try {
        const firebaseData = await loadJsonFromFirebase(input);
        if (firebaseData) {
            memoryCache[input] = firebaseData;
            return firebaseData;
        }
    } catch (e) {
        console.warn('Firebase cache read failed:', e && (e.message || e.name) ? e.message || e.name : e);
    }

    // Check localStorage
    try {
        const cached = localStorage.getItem(`lyrics_${input}`);
        if (cached) {
            const parsed = JSON.parse(cached);
            memoryCache[input] = parsed;
            return parsed;
        }
    } catch (error) {
        console.warn('Error reading localStorage:', error);
    }

    // Check lyrics-cache.json
    if (lyricsCacheData && lyricsCacheData[input]) {
        memoryCache[input] = lyricsCacheData[input];
        return lyricsCacheData[input];
    }

    return null;
}

// Save result to cache
async function saveToCache(input, result) {
    memoryCache[input] = result;
    saveToLocalStorage(memoryCache);

    // Also save to Firebase
    await saveJsonToFirebase(result, input);
}

// Call Deepseek API to generate Cantonese phrases
async function generatePhrasesWithDeepseek(tonePattern, topic = null, phraseCount = 2) {
    const toneNumbers = tonePattern.split(' ').map(t => parseInt(t));
    const patternLength = toneNumbers.length;

    let prompt = `Generate ${phraseCount} Cantonese phrases that match the tone pattern: ${tonePattern}. `;
    prompt += `Each phrase should have exactly ${patternLength} characters. `;
    prompt += `The tones must match exactly: ${toneNumbers.join(', ')}. `;

    if (topic) {
        prompt += `The theme/topic should be related to: ${topic}. `;
    }

    prompt += `For each phrase, provide: `;
    prompt += `1. The Chinese characters (繁體字) `;
    prompt += `2. Jyutping romanization for each character `;
    prompt += `3. The tone number for each character `;
    prompt += `Return the response as a JSON array with this structure: `;
    prompt += `[{"phrase": "詞語", "characters": [{"char": "詞", "jyutping": "ci4", "tone": 4}, {"char": "語", "jyutping": "jyu5", "tone": 5}]}, ...] `;
    prompt += `Only return valid JSON, no additional text.`;

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        }).catch(function (err) {
            throw new Error('Network error: ' + (err && (err.message || err.name) ? err.message || err.name : String(err)));
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();

        // Try to extract JSON from the response
        let jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            // Try to find JSON object
            jsonMatch = content.match(/\{[\s\S]*\}/);
        }

        if (jsonMatch) {
            const phrases = JSON.parse(jsonMatch[0]);
            return phrases;
        } else {
            console.warn('Could not parse JSON from API response:', content);
            return [];
        }
    } catch (error) {
        console.error('Deepseek API error:', error);
        throw error;
    }
}

/** Cache key for 主題詞語 (two related words per topic). */
function topicWordsCacheKey(topic) {
    return 'topicWords:' + String(topic).trim();
}

/**
 * Ask DeepSeek for Cantonese 主題詞語 related to the theme.
 * Returns up to `count` words/short phrases (default: 6), which will be shown as boxes.
 */
async function generateTopicRelatedWordsDeepseek(topic, count = 6) {
    const t = String(topic).trim();
    const n = Math.max(1, Math.min(10, Number(count) || 6));
    const prompt =
        'The user chose this theme for lyrics: "' + t + '". ' +
        'Suggest EXACTLY ' + n + ' different Cantonese theme words or short two-character phrases (繁體中文) that clearly relate to this theme. ' +
        'Each item must be a single word or a short 2-character phrase (主題詞語), no punctuation, no numbering. ' +
        'Return ONLY a JSON array of exactly ' + n + ' strings, for example: ["詞語一","詞語二",...]. ' +
        'No Jyutping, no tone numbers, no English, no explanations, no markdown — only the JSON array.';

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.75,
            max_tokens: 500
        })
    }).catch(function (err) {
        throw new Error('Network error: ' + (err && err.message ? err.message : String(err)));
    });

    if (!response.ok) {
        throw new Error('API error: ' + response.status + ' ' + response.statusText);
    }

    const data = await response.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
        ? data.choices[0].message.content.trim()
        : '';
    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
        throw new Error('Could not parse topic words from API');
    }
    let arr;
    try {
        arr = JSON.parse(jsonMatch[0]);
    } catch (e) {
        throw new Error('Invalid JSON from API');
    }
    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('Expected an array of topic words from API');
    }
    const cleaned = arr
        .map(function (item) { return String(item || '').trim(); })
        .filter(function (s) { return s.length > 0; });
    if (cleaned.length < n) {
        throw new Error('API did not return enough topic words');
    }
    return cleaned.slice(0, n);
}

/** Cache key for home-page full Cantonese song from a user phrase. */
function fullSongCacheKey(phrase) {
    return 'fullSong:' + String(phrase).trim();
}

/**
 * Ask DeepSeek for complete Cantonese song lyrics inspired by the user's phrase.
 * Returns plain text (繁體中文), section labels optional.
 */
async function generateFullSongCantoneseDeepseek(userPhrase) {
    const phrase = String(userPhrase || '').trim();
    if (!phrase) {
        throw new Error('請輸入一句靈感或主題。');
    }
    const prompt =
        '你係粵語填詞人。用戶嘅靈感／主題如下：\n\n' +
        phrase +
        '\n\n' +
        '請寫一首完整嘅粵語歌詞（繁體中文）。優先用自然、地道嘅粵語口語同書面語，適合流行曲。\n' +
        '必須包括：歌名一行、至少一段主歌、副歌（可重複一次令成首歌完整）、可選 Bridge。\n' +
        '用【歌名】【主歌】【副歌】【Bridge】等標籤分節。\n' +
        '只輸出歌詞同標籤，唔好加英文解說、唔好用 Markdown 代碼格。';

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            max_tokens: 4096
        })
    }).catch(function (err) {
        throw new Error('Network error: ' + (err && err.message ? err.message : String(err)));
    });

    if (!response.ok) {
        throw new Error('API error: ' + response.status + ' ' + response.statusText);
    }

    const data = await response.json();
    const content =
        data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
            ? String(data.choices[0].message.content).trim()
            : '';
    if (!content) {
        throw new Error('API 沒有返回歌詞內容');
    }
    return content;
}

function setHomePhraseUiLoading(isLoading) {
    const sendLyricsBtn = document.getElementById('sendLyricsBtn');
    const inputDigits = document.getElementById('inputDigits');
    const loadingEl = document.getElementById('homeLyricsLoading');
    if (sendLyricsBtn) {
        sendLyricsBtn.disabled = !!isLoading;
        sendLyricsBtn.classList.toggle('is-loading', !!isLoading);
        sendLyricsBtn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    }
    if (inputDigits) {
        inputDigits.disabled = !!isLoading;
    }
    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    }
}

window.setHomePhraseUiLoading = setHomePhraseUiLoading;

// Handle form submission
async function handleFormSubmit(event) {
    event.preventDefault();

    const inputDigits = document.getElementById('inputDigits');
    if (!inputDigits) return;
    const generateBtn = document.getElementById('generateBtn');
    const btnText = generateBtn ? generateBtn.querySelector('.btn-text') : null;
    const btnLoader = generateBtn ? generateBtn.querySelector('.btn-loader') : null;
    const errorMessage = document.getElementById('errorMessage');
    const resultsSection = document.getElementById('resultsSection');

    const input = inputDigits.value.trim();

    // Hide error message
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }

    // Check if it's 0243 page mode (lookup words from 0243.json)
    // Accept 2 digits 0–9: 1＝3＝9, 4＝5＝8, 2＝6, 0＝0
    const is0243Mode = inputDigits.classList.contains('mode-0243');
    if (is0243Mode && /^[0-9]{2}$/.test(input)) {
        const canonicalPattern = normalize0243Input(input);
        if (!canonicalPattern) {
            showError('請輸入兩個數字（0–9）。');
            return;
        }
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline';
        if (generateBtn) generateBtn.disabled = true;
        try {
            const words = await get0243WordsForPattern(canonicalPattern);
            const result = {
                input,
                canonicalPattern,
                input_length: 2,
                from0243: true,
                digit_mapping: digitToTones,
                digit_to_canonical: digitToCanonical0243,
                patterns: { '2-tone': [canonicalPattern] },
                results: {
                    '2-tone': {
                        [canonicalPattern]: words.map(w => ({ phrase: w }))
                    }
                }
            };
            displayResults(result);
            if (resultsSection) {
                resultsSection.style.display = 'block';
                document.body.classList.add('results-visible-0243');
                // Start expanded whenever we generate fresh 0243 results.
                document.body.classList.remove('hero-collapsed-0243');
                document.body.dataset.lastResultMode = '0243';
                revealResultsSectionInMainPane();
            }
        } catch (err) {
            console.error('0243 lookup error:', err);
            showError(err && err.message ? err.message : '無法載入 0243 詞庫，請稍後再試。');
        } finally {
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
            if (generateBtn) generateBtn.disabled = false;
        }
        return;
    }
    if (is0243Mode) {
        showError('請輸入兩個數字（0–9）。 1＝3＝9，4＝5＝8，2＝6，0＝0。');
        return;
    }

    // Check if it's topic mode (主題詞語): two related words only — no tone patterns
    const isTopicMode = inputDigits.classList.contains('topic-mode');
    let actualInput = input;

    if (isTopicMode) {
        const topic = input;
        if (!topic) {
            showError('Please select or enter a topic.');
            return;
        }
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline';
        if (generateBtn) generateBtn.disabled = true;
        try {
            const words = await getTopicWordsForTopic(topic);
            if (!words || words.length === 0) {
                showError('找不到該主題詞庫，請從列表選擇主題。');
                return;
            }
            const result = {
                input: topic,
                canonicalPattern: topic,
                input_length: 2,
                from0243: true,
                fromTopicLexicon: true,
                topic,
                patterns: { '2-tone': [topic] },
                results: {
                    '2-tone': {
                        [topic]: words.map(function (w) { return { phrase: w }; })
                    }
                }
            };
            displayResults(result);
            if (resultsSection) {
                resultsSection.style.display = 'block';
                document.body.classList.add('results-visible-0243');
                document.body.classList.remove('results-visible-topic', 'topic-page', 'hero-collapsed-0243');
                document.body.dataset.lastResultMode = '0243';
                const topicButtonsContainer = document.getElementById('topicButtonsContainer');
                if (topicButtonsContainer) topicButtonsContainer.style.display = 'none';
                revealResultsSectionInMainPane();
            }
        } catch (error) {
            console.error('Topic words error:', error);
            showError(error && error.message ? error.message : '無法載入主題詞庫，請稍後再試。');
        } finally {
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
            if (generateBtn) generateBtn.disabled = false;
        }
        return;
    }

    // Home page: free phrase → full Cantonese song (DeepSeek)
    const isHomePhraseMode = inputDigits.classList.contains('home-phrase-mode');
    if (isHomePhraseMode) {
        const phrase = input;
        if (!phrase) {
            showError('請輸入一句靈感或主題。');
            return;
        }
        const cacheKey = fullSongCacheKey(phrase);
        setHomePhraseUiLoading(true);
        try {
            let result = await getCachedResult(cacheKey);
            if (!result || !result.fullSongMode || typeof result.songLyrics !== 'string' || !result.songLyrics.trim()) {
                const songLyrics = await generateFullSongCantoneseDeepseek(phrase);
                result = {
                    fullSongMode: true,
                    userPhrase: phrase,
                    input: cacheKey,
                    songLyrics,
                    input_length: phrase.length
                };
                await saveToCache(cacheKey, result);
            }
            displayResults(result);
            if (resultsSection) {
                resultsSection.style.display = 'block';
                document.body.classList.add('results-visible-fullsong');
                document.body.classList.remove('results-visible-topic', 'hero-collapsed-0243', 'results-visible-0243');
                document.body.dataset.lastResultMode = 'fullsong';
                revealResultsSectionInMainPane();
            }
        } catch (error) {
            console.error('Full song error:', error);
            showError(error && error.message ? error.message : '無法生成歌詞，請稍後再試。');
        } finally {
            setHomePhraseUiLoading(false);
        }
        return;
    }

    // Non–topic mode: digit patterns for tone lyrics
    // Allow 2 digits 0–9 (normalized to 0,2,3,4) or 2–3 digits 0,2,3,4
    if (/^[0-9]{2}$/.test(actualInput)) {
        const canonical = normalize0243Input(actualInput);
        if (canonical) actualInput = canonical;
        else {
            showError('Please enter 2 digits from 0–9.');
            return;
        }
    } else if (!/^[0234]{2,3}$/.test(actualInput)) {
        showError('Please enter 2 digits (0–9) or 2–3 digits (0, 2, 3, 4).');
        return;
    }

    // Show loading state
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'inline';
    if (generateBtn) generateBtn.disabled = true;

    try {
        // Check cache first using the normalized digit input
        let result = await getCachedResult(actualInput);

        if (!result) {
            // Generate tone patterns for this digit input
            const patterns = generateTonePatterns(actualInput);

            // Create result structure
            result = {
                input: actualInput,
                input_length: actualInput.length,
                digit_mapping: digitToTones,
                patterns: {
                    [`${actualInput.length}-tone`]: patterns
                },
                results: {
                    [`${actualInput.length}-tone`]: {}
                }
            };

            // Generate phrases for each pattern (no topic in this mode)
            const patternKey = `${actualInput.length}-tone`;
            for (const pattern of patterns) {
                try {
                    const phrases = await generatePhrasesWithDeepseek(pattern, null, 5);
                    result.results[patternKey][pattern] = phrases;
                } catch (error) {
                    console.error(`Error generating phrases for pattern ${pattern}:`, error);
                    result.results[patternKey][pattern] = [];
                }
            }

            // Save to cache
            await saveToCache(actualInput, result);
        }

        // Display results
        displayResults(result);

        // Show results section and scroll to top of results
        if (resultsSection) {
            resultsSection.style.display = 'block';
            resultsSection.scrollTop = 0;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    scrollElementIntoMainPane(resultsSection);
                });
            });

            // Non-topic digit mode should not keep the compact-topic header
            document.body.classList.remove('results-visible-topic', 'hero-collapsed-0243');
            try {
                delete document.body.dataset.lastResultMode;
            } catch (e) { }
        }
    } catch (error) {
        console.error('Error generating lyrics:', error);
        showError('Failed to generate lyrics. Please check your API key and try again.');
    } finally {
        // Reset button state
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        if (generateBtn) generateBtn.disabled = false;
    }
}

// Display results
function displayResults(result) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';
    clearResultCopySelection();
    const regenerateBtn = document.getElementById('regenerateBtn');
    if (regenerateBtn) regenerateBtn.style.display = 'none';

    // Home: full Cantonese song (plain text)
    if (result.fullSongMode && typeof result.songLyrics === 'string' && result.songLyrics.trim()) {
        if (regenerateBtn) {
            regenerateBtn.style.display = 'inline-flex';
            regenerateBtn.textContent = '🔄 重新生成';
        }
        const wrap = document.createElement('div');
        wrap.className = 'pattern-group full-song-result';
        const patternHeader = document.createElement('div');
        patternHeader.className = 'pattern-header';
        const safePhrase = String(result.userPhrase || '').replace(/</g, '&lt;');
        patternHeader.innerHTML =
            '<h3>粵語歌詞</h3><p class="pattern-mapping-hint">靈感：' + safePhrase + '</p>';
        wrap.appendChild(patternHeader);
        const pre = document.createElement('pre');
        pre.className = 'full-song-lyrics';
        pre.textContent = result.songLyrics.trim();
        wrap.appendChild(pre);
        const copyRow = document.createElement('div');
        copyRow.className = 'full-song-copy-row';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = '📋 複製全文';
        copyBtn.addEventListener('click', function () {
            const t = result.songLyrics.trim();
            copyTextToClipboard(t).then(function () {
                showCopyToast('', false, '已複製全文');
            }).catch(function () {
                showCopyToast('無法複製到剪貼簿，請重試。', true);
            });
        });
        copyRow.appendChild(copyBtn);
        wrap.appendChild(copyRow);
        resultsContainer.appendChild(wrap);
        window.currentResult = result;
        updateJsonOutput(result);
        return;
    }

    // Topic words mode: show 主題詞語 boxes only, no tone patterns
    if (result.topicModeWords && Array.isArray(result.relatedWords) && result.relatedWords.length > 0) {
        if (regenerateBtn) {
            regenerateBtn.style.display = 'inline-flex';
            regenerateBtn.textContent = '🔄 換其他詞語';
        }
        const wrap = document.createElement('div');
        wrap.className = 'pattern-group topic-words-result';
        const patternHeader = document.createElement('div');
        patternHeader.className = 'pattern-header';
        patternHeader.innerHTML =
            '<h3>主題：' +
            String(result.topic || '').replace(/</g, '&lt;') +
            '</h3><p class="pattern-mapping-hint">與主題相關的主題詞語（點擊方格複製該詞）</p>';
        wrap.appendChild(patternHeader);
        const grid = document.createElement('div');
        grid.className = 'topic-buttons-grid topic-buttons-grid--results';
        result.relatedWords.slice(0, 6).forEach(function (word) {
            const btn = document.createElement('div');
            btn.className = 'topic-btn topic-btn--result-word';
            btn.setAttribute('role', 'button');
            btn.setAttribute('tabindex', '0');
            btn.setAttribute('aria-label', '複製詞語：' + word);
            const label = document.createElement('span');
            label.className = 'topic-label';
            label.textContent = word;
            btn.appendChild(label);
            grid.appendChild(btn);
        });
        wrap.appendChild(grid);
        resultsContainer.appendChild(wrap);
        window.currentResult = result;
        updateJsonOutput(result);
        return;
    }

    // Tone-pattern modes (0243 / digits -> tones)
    const patternKey = `${result.input_length}-tone`;
    const patterns =
        (result.patterns && result.patterns[patternKey]) ? result.patterns[patternKey] : [];
    const resultsMap =
        (result.results && result.results[patternKey]) ? result.results[patternKey] : {};

    const wordsOnly = result.from0243 === true;

    patterns.forEach(pattern => {
        const phrases = resultsMap[pattern] || [];

        const patternDiv = document.createElement('div');
        patternDiv.className = 'pattern-group';

        const patternHeader = document.createElement('div');
        patternHeader.className = 'pattern-header';
        let headerHtml = `<h3>${wordsOnly ? pattern : 'Tone Pattern: ' + pattern}</h3>`;
        if (wordsOnly && result.canonicalPattern && result.input && result.input !== result.canonicalPattern) {
            headerHtml += `<p class="pattern-mapping-hint">你輸入 ${result.input} → 對應 ${result.canonicalPattern}</p>`;
        }
        if (wordsOnly) {
            headerHtml += '<p class="pattern-mapping-hint">點擊方格複製該詞</p>';
        }
        patternHeader.innerHTML = headerHtml;
        patternDiv.appendChild(patternHeader);

        if (phrases.length === 0) {
            const noResults = document.createElement('p');
            noResults.className = 'no-results';
            noResults.textContent = wordsOnly ? '沒有此組合的詞彙。' : 'No phrases generated for this pattern.';
            patternDiv.appendChild(noResults);
        } else {
            const phrasesList = document.createElement('div');
            phrasesList.className = 'phrases-list';
            if (wordsOnly) {
                phrasesList.classList.add('phrases-list--0243');
            }

            phrases.forEach(phraseData => {
                const phraseDiv = document.createElement('div');
                phraseDiv.className = 'phrase-box';
                if (wordsOnly) {
                    const pw = phraseData.phrase || '';
                    phraseDiv.setAttribute('tabindex', '0');
                    phraseDiv.setAttribute('role', 'button');
                    phraseDiv.setAttribute('aria-label', '複製詞語：' + pw);
                }

                const phraseWord = document.createElement('div');
                phraseWord.className = 'phrase-word';
                phraseWord.textContent = phraseData.phrase || '';
                phraseDiv.appendChild(phraseWord);

                // 0243 mode: show only words (no pinyin / tone)
                if (!wordsOnly && phraseData.characters) {
                    const phraseInfo = document.createElement('div');
                    phraseInfo.className = 'phrase-info';

                    const jyutping = document.createElement('span');
                    jyutping.className = 'jyutping-badge';
                    jyutping.textContent = phraseData.characters.map(c => c.jyutping).join(' ');
                    phraseInfo.appendChild(jyutping);

                    phraseDiv.appendChild(phraseInfo);
                }

                phrasesList.appendChild(phraseDiv);
            });

            patternDiv.appendChild(phrasesList);
        }

        resultsContainer.appendChild(patternDiv);
    });

    // Store current result for regenerate
    window.currentResult = result;

    // Update JSON output
    updateJsonOutput(result);
}

// Update JSON output
function updateJsonOutput(result) {
    const jsonContent = document.getElementById('jsonContent');
    if (jsonContent) {
        jsonContent.textContent = JSON.stringify(result, null, 2);
    }
}

// Toggle JSON output visibility
function toggleJsonOutput() {
    const jsonOutput = document.getElementById('jsonOutput');
    if (jsonOutput) {
        const isCollapsed = jsonOutput.classList.contains('collapsed');
        jsonOutput.style.display = isCollapsed ? 'block' : 'none';
        jsonOutput.classList.toggle('collapsed');
    }
}

// Enable JSON editing
function enableJsonEdit() {
    const jsonContent = document.getElementById('jsonContent');
    const jsonEditContainer = document.getElementById('jsonEditContainer');
    const jsonEditActions = document.getElementById('jsonEditActions');
    const editJsonBtn = document.getElementById('editJsonBtn');

    if (!jsonContent || !jsonEditContainer || !jsonEditActions) return;

    // Store original content
    const originalJson = jsonContent.textContent;

    // Create textarea for editing
    const textarea = document.createElement('textarea');
    textarea.id = 'jsonContentEdit';
    textarea.value = originalJson;
    textarea.style.width = '100%';
    textarea.style.minHeight = '400px';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '0.9em';
    textarea.style.padding = '20px';
    textarea.style.border = '1px solid #e0e0e0';
    textarea.style.borderRadius = '10px';
    textarea.style.backgroundColor = '#f8f8f8';
    textarea.style.color = '#333';
    textarea.style.resize = 'vertical';

    // Hide pre and show textarea
    jsonContent.style.display = 'none';
    jsonEditContainer.appendChild(textarea);

    // Show edit actions and hide edit button
    jsonEditActions.style.display = 'flex';
    if (editJsonBtn) {
        editJsonBtn.style.display = 'none';
    }

    // Store original JSON for cancel
    window.originalJsonContent = originalJson;
}

// Save JSON edit
async function saveJsonEdit() {
    const textarea = document.getElementById('jsonContentEdit');
    const jsonContent = document.getElementById('jsonContent');
    const jsonEditContainer = document.getElementById('jsonEditContainer');
    const jsonEditActions = document.getElementById('jsonEditActions');
    const editJsonBtn = document.getElementById('editJsonBtn');

    if (!textarea || !jsonContent) return;

    try {
        // Parse and validate JSON
        const editedJson = JSON.parse(textarea.value);

        // Update the current result
        if (window.currentResult) {
            Object.assign(window.currentResult, editedJson);
        }

        // Get input key for Firebase
        const inputKey = (window.currentResult && window.currentResult.input) || 'default';

        // Update cache if needed (this will also save to Firebase)
        let firebaseSaved = false;
        if (window.currentResult && window.currentResult.input) {
            await saveToCache(window.currentResult.input, window.currentResult);
            firebaseSaved = true; // saveToCache includes Firebase save
        } else {
            // If no current result, save directly to Firebase
            firebaseSaved = await saveJsonToFirebase(editedJson, inputKey);
        }

        // Update displayed results
        if (window.currentResult) {
            displayResults(window.currentResult);
        }

        // Update JSON content
        jsonContent.textContent = JSON.stringify(editedJson, null, 2);

        // Remove textarea and show pre
        textarea.remove();
        jsonContent.style.display = 'block';

        // Hide edit actions and show edit button
        jsonEditActions.style.display = 'none';
        if (editJsonBtn) {
            editJsonBtn.style.display = 'inline-block';
        }

        // Clear stored original
        delete window.originalJsonContent;

        const message = firebaseSaved
            ? 'JSON updated successfully and saved to Firebase! ✓'
            : 'JSON updated successfully! (Firebase save failed - check console)';
        alert(message);
    } catch (error) {
        alert('Invalid JSON format. Please check your syntax.\n\nError: ' + error.message);
    }
}

// Cancel JSON edit
function cancelJsonEdit() {
    const textarea = document.getElementById('jsonContentEdit');
    const jsonContent = document.getElementById('jsonContent');
    const jsonEditContainer = document.getElementById('jsonEditContainer');
    const jsonEditActions = document.getElementById('jsonEditActions');
    const editJsonBtn = document.getElementById('editJsonBtn');

    if (!jsonContent || !jsonEditContainer) return;

    // Remove textarea
    if (textarea) {
        textarea.remove();
    }

    // Show pre
    jsonContent.style.display = 'block';

    // Hide edit actions and show edit button
    jsonEditActions.style.display = 'none';
    if (editJsonBtn) {
        editJsonBtn.style.display = 'inline-block';
    }

    // Clear stored original
    delete window.originalJsonContent;
}

// Show error message
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
}

let copyToastHideTimer = null;
let lastCopiedResultBox = null;

function copyTextToClipboard(text) {
    const s = String(text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(s);
    }
    return new Promise(function (resolve, reject) {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
            if (document.execCommand('copy')) resolve();
            else reject(new Error('execCommand copy failed'));
        } catch (err) {
            reject(err);
        } finally {
            document.body.removeChild(ta);
        }
    });
}

function truncateForToast(s, maxLen) {
    const t = String(s).trim();
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen) + '…';
}

/**
 * Toast after copying a word from 0243 / 主題詞語 result boxes, or full-song lyrics.
 * @param {string} copiedText - full string that was copied
 * @param {boolean} [isError] - show error styling
 * @param {string} [fixedMessage] - if set, show this text instead of the default 已複製：「…」 preview
 */
function showCopyToast(copiedText, isError, fixedMessage) {
    let el = document.getElementById('copyToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'copyToast';
        el.className = 'copy-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
    }
    if (fixedMessage && typeof fixedMessage === 'string') {
        el.textContent = fixedMessage;
    } else {
        const display = truncateForToast(copiedText, 48);
        el.textContent = isError
            ? display
            : '已複製：「' + display + '」';
    }
    el.classList.toggle('copy-toast--error', !!isError);
    el.classList.add('copy-toast--visible');
    clearTimeout(copyToastHideTimer);
    copyToastHideTimer = setTimeout(function () {
        el.classList.remove('copy-toast--visible');
    }, isError ? 3200 : 2600);
}

function clearResultCopySelection() {
    if (lastCopiedResultBox) {
        lastCopiedResultBox.classList.remove('result-word-copy-active');
        lastCopiedResultBox = null;
    }
}

function setupResultsBoxCopy() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;

    function extractCopyTextFromTarget(target) {
        const topicBox = target.closest('.topic-btn--result-word');
        const phraseBox = target.closest('.phrases-list--0243 .phrase-box');
        if (topicBox) {
            const label = topicBox.querySelector('.topic-label');
            return label ? label.textContent.trim() : '';
        }
        if (phraseBox) {
            const wordEl = phraseBox.querySelector('.phrase-word');
            return wordEl ? wordEl.textContent.trim() : '';
        }
        return '';
    }

    function copyFromTarget(target) {
        const text = extractCopyTextFromTarget(target);
        if (!text) return;

        clearResultCopySelection();
        copyTextToClipboard(text)
            .then(function () {
                const topicBox = target.closest('.topic-btn--result-word');
                const phraseBox = target.closest('.phrases-list--0243 .phrase-box');
                lastCopiedResultBox = topicBox || phraseBox;
                if (lastCopiedResultBox) {
                    lastCopiedResultBox.classList.add('result-word-copy-active');
                }
                showCopyToast(text);
            })
            .catch(function () {
                showCopyToast('無法複製到剪貼簿，請重試。', true);
            });
    }

    resultsContainer.addEventListener('click', function (e) {
        copyFromTarget(e.target);
    });

    resultsContainer.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const focusEl = e.target;
        if (
            !focusEl.closest('.topic-btn--result-word') &&
            !focusEl.closest('.phrases-list--0243 .phrase-box')
        ) {
            return;
        }
        e.preventDefault();
        copyFromTarget(focusEl);
    });
}

// Setup regenerate modal
function setupRegenerateModal() {
    const regenerateBtn = document.getElementById('regenerateBtn');
    const modal = document.getElementById('regenerateModal');
    const modalClose = modal?.querySelector('.modal-close');
    const cancelBtn = document.getElementById('cancelRegenerateBtn');
    const submitBtn = document.getElementById('submitRegenerateBtn');
    const selectAllBtn = document.getElementById('selectAllPatternsBtn');
    const deselectAllBtn = document.getElementById('deselectAllPatternsBtn');

    if (regenerateBtn && modal) {
        regenerateBtn.addEventListener('click', openRegenerateModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeRegenerateModal);
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', handleRegenerate);
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = true);
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
        });
    }

    // Close on overlay click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeRegenerateModal();
            }
        });
    }
}

// Open regenerate modal
function openRegenerateModal() {
    const modal = document.getElementById('regenerateModal');
    const container = document.getElementById('patternsCheckboxContainer');

    if (!modal || !window.currentResult) return;

    const patternKey = `${window.currentResult.input_length}-tone`;
    const patterns = window.currentResult.patterns[patternKey] || [];

    container.innerHTML = '';

    patterns.forEach(pattern => {
        const label = document.createElement('label');
        label.className = 'pattern-checkbox-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = pattern;
        checkbox.checked = true;

        const span = document.createElement('span');
        span.textContent = pattern;

        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
    });

    modal.style.display = 'flex';
}

// Close regenerate modal
function closeRegenerateModal() {
    const modal = document.getElementById('regenerateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Handle regenerate (tone patterns – non-topic modes)
async function handleRegenerate() {
    const modal = document.getElementById('regenerateModal');
    if (!modal || !window.currentResult) return;

    const phraseCountInput = document.getElementById('phraseCountInput');
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');

    if (checkboxes.length === 0) return;

    const phraseCount = parseInt(phraseCountInput.value, 10) || 2;
    const selectedPatterns = Array.from(checkboxes).map(function (cb) { return cb.value; });
    const patternKey = `${window.currentResult.input_length}-tone`;
    const topic = window.currentResult.topic || null;

    closeRegenerateModal();

    // Show loading
    const generateBtn = document.getElementById('generateBtn');
    if (!generateBtn) return;
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoader = generateBtn.querySelector('.btn-loader');
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'inline';
    generateBtn.disabled = true;

    try {
        // Regenerate phrases for selected patterns
        for (const pattern of selectedPatterns) {
            try {
                const phrases = await generatePhrasesWithDeepseek(pattern, topic, phraseCount);
                if (!window.currentResult.results[patternKey]) {
                    window.currentResult.results[patternKey] = {};
                }
                window.currentResult.results[patternKey][pattern] = phrases;
            } catch (error) {
                console.error(`Error regenerating pattern ${pattern}:`, error);
            }
        }

        // Update cache
        await saveToCache(window.currentResult.input, window.currentResult);

        // Redisplay results
        displayResults(window.currentResult);
    } catch (error) {
        console.error('Error regenerating lyrics:', error);
        showError('Failed to regenerate lyrics. Please try again.');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        generateBtn.disabled = false;
    }
}

// Regenerate full Cantonese song (bypass cache for same phrase)
async function handleFullSongRegenerate() {
    if (!window.currentResult || !window.currentResult.fullSongMode || !window.currentResult.userPhrase) return;
    const phrase = window.currentResult.userPhrase;
    const cacheKey = fullSongCacheKey(phrase);
    const regenerateBtn = document.getElementById('regenerateBtn');
    if (regenerateBtn) regenerateBtn.disabled = true;
    setHomePhraseUiLoading(true);
    try {
        delete memoryCache[cacheKey];
        try {
            localStorage.removeItem('lyrics_' + cacheKey);
        } catch (e) { /* ignore */ }
        const songLyrics = await generateFullSongCantoneseDeepseek(phrase);
        window.currentResult.songLyrics = songLyrics;
        window.currentResult.input = cacheKey;
        await saveToCache(cacheKey, window.currentResult);
        displayResults(window.currentResult);
    } catch (e) {
        console.error('Full song regenerate:', e);
        showError(e && e.message ? e.message : '無法重新生成，請稍後再試。');
    } finally {
        setHomePhraseUiLoading(false);
        if (regenerateBtn) regenerateBtn.disabled = false;
    }
}

// Regenerate 主題詞語 (six boxes) in topic mode
async function handleTopicRegenerate() {
    if (!window.currentResult || !window.currentResult.topicModeWords || !window.currentResult.topic) return;
    const topic = window.currentResult.topic;
    const cacheKey = topicWordsCacheKey(topic);
    const requiredCount = 6;
    const generateBtn = document.getElementById('generateBtn');
    const btnText = generateBtn ? generateBtn.querySelector('.btn-text') : null;
    const btnLoader = generateBtn ? generateBtn.querySelector('.btn-loader') : null;
    if (btnText) btnText.style.display = 'none';
    if (btnLoader) btnLoader.style.display = 'inline';
    if (generateBtn) generateBtn.disabled = true;
    try {
        const relatedWords = await generateTopicRelatedWordsDeepseek(topic, requiredCount);
        if (!relatedWords || relatedWords.length < requiredCount) {
            showError('無法取得主題詞語，請再試一次。');
            return;
        }
        window.currentResult.relatedWords = relatedWords.slice(0, requiredCount);
        await saveToCache(cacheKey, window.currentResult);
        displayResults(window.currentResult);
    } catch (e) {
        console.error('Topic regenerate:', e);
        showError(e && e.message ? e.message : '無法重新載入，請稍後再試。');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (btnLoader) btnLoader.style.display = 'none';
        if (generateBtn) generateBtn.disabled = false;
    }
}

// Update cache file (download functionality)
function updateCacheFile() {
    // This would typically require a backend endpoint
    // For now, we'll just download the cache
    downloadCache();
}

// Download cache
function downloadCache() {
    const cacheData = { ...memoryCache, ...lyricsCacheData };
    const blob = new Blob([JSON.stringify(cacheData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics-cache.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// My Lyrics Sliding Panel Functions – multiple files (per-user when logged in)
const MY_LYRICS_STORAGE_KEY_PREFIX = 'myLyricsFiles_';
const MY_LYRICS_LEGACY_KEY = 'myLyrics';

function getMyLyricsStorageKey() {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    return user ? MY_LYRICS_STORAGE_KEY_PREFIX + user.uid : MY_LYRICS_STORAGE_KEY_PREFIX + 'anonymous';
}

function getMyLyricsData() {
    try {
        var key = getMyLyricsStorageKey();
        const raw = localStorage.getItem(key);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && data.files && typeof data.files === 'object') return data;
        }
        // Migrate from legacy single lyric (only for same key)
        const legacy = localStorage.getItem(MY_LYRICS_LEGACY_KEY);
        const id = 'file_' + Date.now();
        const files = {};
        files[id] = {
            name: '我的歌詞',
            content: legacy || '',
            updatedAt: new Date().toISOString()
        };
        const out = { files, currentId: id };
        localStorage.setItem(key, JSON.stringify(out));
        if (key === MY_LYRICS_STORAGE_KEY_PREFIX + 'anonymous' && localStorage.getItem(MY_LYRICS_LEGACY_KEY)) {
            localStorage.removeItem(MY_LYRICS_LEGACY_KEY);
            if (localStorage.getItem('myLyricsUpdatedAt')) localStorage.removeItem('myLyricsUpdatedAt');
        }
        return out;
    } catch (e) {
        return { files: {}, currentId: null };
    }
}

function setMyLyricsData(data) {
    try {
        localStorage.setItem(getMyLyricsStorageKey(), JSON.stringify(data));
    } catch (e) {
        console.warn('Error saving myLyrics data', e);
    }
}

async function persistMyLyricsToFirestore(showSuccessAlert) {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) throw new Error('not logged in');
    if (!window.firebaseDb) throw new Error('Firebase not initialized');

    saveCurrentFileContentFromUI();
    var data = getMyLyricsData();
    if (!data.files || Object.keys(data.files).length === 0) {
        throw new Error('no lyrics files');
    }

    var timestamp = new Date().toISOString();
    await window.firebaseDb.collection('userLyrics').doc(user.uid).set({
        files: data.files,
        updatedAt: timestamp,
        student: {
            name: user.displayName || '',
            email: user.email || ''
        }
    }, { merge: true });

    setMyLyricsData(data);
    if (showSuccessAlert) {
        alert('✓ 歌詞已成功儲存到 Firebase！');
    }
    console.log('✓ Lyrics persisted to Firebase for user', user.uid);
}

// --- My lyrics: one audio recording per lyric file (Firebase Storage + Firestore metadata) ---
const MY_LYRICS_MAX_AUDIO_SEC = 180;
const MY_LYRICS_AUDIO_TARGET_BPS = 192000;

var myLyricsRecording = {
    mediaRecorder: null,
    stream: null,
    chunks: [],
    mimeType: '',
    tickTimer: null,
    maxTimer: null,
    startMs: 0,
    discard: false
};

function pickLyricsRecordingMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    var candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
}

function fileExtForLyricsMime(mime) {
    if (!mime) return 'webm';
    var m = mime.toLowerCase();
    if (m.indexOf('mp4') !== -1 || m.indexOf('m4a') !== -1) return 'm4a';
    if (m.indexOf('ogg') !== -1) return 'ogg';
    if (m.indexOf('webm') !== -1) return 'webm';
    return 'webm';
}

function formatLyricsRecordingClock(sec) {
    var s = Math.floor(Math.max(0, sec));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
}

function cleanupLyricsRecordingStream() {
    if (myLyricsRecording.stream) {
        try {
            myLyricsRecording.stream.getTracks().forEach(function (t) { t.stop(); });
        } catch (e) { }
        myLyricsRecording.stream = null;
    }
}

function clearLyricsRecordingTimers() {
    if (myLyricsRecording.tickTimer) {
        clearInterval(myLyricsRecording.tickTimer);
        myLyricsRecording.tickTimer = null;
    }
    if (myLyricsRecording.maxTimer) {
        clearTimeout(myLyricsRecording.maxTimer);
        myLyricsRecording.maxTimer = null;
    }
}

function hideLyricsRecordingStatus() {
    var statusEl = document.getElementById('myLyricsRecordingStatus');
    if (statusEl) {
        statusEl.style.display = 'none';
        statusEl.textContent = '';
        statusEl.classList.remove('is-idle-hint');
    }
}

function resetLyricsRecordButton() {
    var btn = document.getElementById('recordLyricsAudioBtn');
    if (btn) {
        btn.textContent = '錄音';
        btn.disabled = false;
    }
}

function updateLyricsRecordingTick() {
    var statusEl = document.getElementById('myLyricsRecordingStatus');
    if (!statusEl) return;
    var s = (Date.now() - myLyricsRecording.startMs) / 1000;
    statusEl.style.display = '';
    statusEl.classList.remove('is-idle-hint');
    statusEl.textContent = '錄音中… ' + formatLyricsRecordingClock(s) + ' / 3:00（最多 3 分鐘，約 192 kbps）';
}

function abortLyricsRecordingIfAny() {
    if (!myLyricsRecording.mediaRecorder) return;
    myLyricsRecording.discard = true;
    clearLyricsRecordingTimers();
    try {
        if (myLyricsRecording.mediaRecorder.state === 'recording') {
            myLyricsRecording.mediaRecorder.stop();
        } else {
            cleanupLyricsRecordingStream();
            myLyricsRecording.mediaRecorder = null;
            myLyricsRecording.chunks = [];
            myLyricsRecording.discard = false;
        }
    } catch (e) {
        cleanupLyricsRecordingStream();
        myLyricsRecording.mediaRecorder = null;
        myLyricsRecording.chunks = [];
        myLyricsRecording.discard = false;
    }
    resetLyricsRecordButton();
    hideLyricsRecordingStatus();
}

function onLyricsMediaRecorderStopped() {
    clearLyricsRecordingTimers();

    if (myLyricsRecording.discard) {
        cleanupLyricsRecordingStream();
        myLyricsRecording.mediaRecorder = null;
        myLyricsRecording.chunks = [];
        myLyricsRecording.discard = false;
        return;
    }

    var mr = myLyricsRecording.mediaRecorder;
    var mime = myLyricsRecording.mimeType || (mr && mr.mimeType) || 'audio/webm';
    var blob = new Blob(myLyricsRecording.chunks, { type: mime });
    var durationSec = (Date.now() - myLyricsRecording.startMs) / 1000;
    if (durationSec > MY_LYRICS_MAX_AUDIO_SEC + 0.5) {
        durationSec = MY_LYRICS_MAX_AUDIO_SEC;
    }

    cleanupLyricsRecordingStream();
    myLyricsRecording.mediaRecorder = null;
    myLyricsRecording.chunks = [];

    if (blob.size < 256) {
        alert('錄音過短或失敗，請重試。');
        resetLyricsRecordButton();
        hideLyricsRecordingStatus();
        return;
    }

    uploadLyricsAudioBlob(blob, durationSec, mime);
}

async function startLyricsRecording() {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) {
        alert('請先登入才能錄音。');
        return;
    }
    if (!window.firebaseStorage) {
        alert('無法使用雲端儲存，請重新整理頁面後再試。');
        return;
    }

    var data = getMyLyricsData();
    if (!data.currentId || !data.files[data.currentId]) {
        alert('請先選擇或新增一份歌詞檔案。');
        return;
    }

    var stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error(err);
        alert('無法存取麥克風，請檢查瀏覽器權限。');
        return;
    }

    myLyricsRecording.stream = stream;
    myLyricsRecording.chunks = [];
    myLyricsRecording.discard = false;
    myLyricsRecording.mimeType = pickLyricsRecordingMime();

    var options = {};
    if (myLyricsRecording.mimeType) options.mimeType = myLyricsRecording.mimeType;
    if (typeof MediaRecorder !== 'undefined' && 'audioBitsPerSecond' in MediaRecorder.prototype) {
        options.audioBitsPerSecond = MY_LYRICS_AUDIO_TARGET_BPS;
    }

    var mr;
    try {
        mr = new MediaRecorder(stream, options);
    } catch (e1) {
        try {
            mr = myLyricsRecording.mimeType
                ? new MediaRecorder(stream, { mimeType: myLyricsRecording.mimeType })
                : new MediaRecorder(stream);
        } catch (e2) {
            cleanupLyricsRecordingStream();
            alert('此瀏覽器不支援錄音，請改用 Chrome 或 Edge。');
            return;
        }
    }

    myLyricsRecording.mediaRecorder = mr;
    mr.ondataavailable = function (e) {
        if (e.data && e.data.size) myLyricsRecording.chunks.push(e.data);
    };
    mr.onerror = function (ev) {
        console.error('MediaRecorder error', ev);
    };
    mr.onstop = function () {
        onLyricsMediaRecorderStopped();
    };

    myLyricsRecording.startMs = Date.now();
    try {
        mr.start(250);
    } catch (e) {
        cleanupLyricsRecordingStream();
        myLyricsRecording.mediaRecorder = null;
        alert('無法開始錄音。');
        return;
    }

    var btn = document.getElementById('recordLyricsAudioBtn');
    if (btn) btn.textContent = '停止';

    var statusEl = document.getElementById('myLyricsRecordingStatus');
    if (statusEl) {
        statusEl.style.display = '';
        statusEl.classList.remove('is-idle-hint');
        statusEl.textContent = '錄音中… 0:00 / 3:00（最多 3 分鐘，約 192 kbps）';
    }

    myLyricsRecording.tickTimer = setInterval(updateLyricsRecordingTick, 250);
    myLyricsRecording.maxTimer = setTimeout(function () {
        if (mr.state === 'recording') {
            mr.stop();
        }
    }, MY_LYRICS_MAX_AUDIO_SEC * 1000);
}

function stopLyricsRecording() {
    var mr = myLyricsRecording.mediaRecorder;
    if (mr && mr.state === 'recording') {
        try {
            mr.stop();
        } catch (e) {
            console.error(e);
        }
    }
}

async function deleteLyricsAudioAtPath(storagePath) {
    if (!storagePath || !window.firebaseStorage) return;
    try {
        await window.firebaseStorage.ref(storagePath).delete();
    } catch (e) {
        console.warn('Could not delete audio in storage:', e);
    }
}

async function uploadLyricsAudioBlob(blob, durationSec, mimeType) {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user || !window.firebaseStorage) {
        resetLyricsRecordButton();
        hideLyricsRecordingStatus();
        return;
    }

    var data = getMyLyricsData();
    var fileId = data.currentId;
    if (!fileId || !data.files[fileId]) {
        resetLyricsRecordButton();
        hideLyricsRecordingStatus();
        return;
    }

    var btn = document.getElementById('recordLyricsAudioBtn');
    var statusEl = document.getElementById('myLyricsRecordingStatus');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '上傳中…';
    }
    if (statusEl) {
        statusEl.style.display = '';
        statusEl.classList.remove('is-idle-hint');
        statusEl.textContent = '正在準備上傳…（一般約幾秒至一兩分鐘，視網絡而定）';
    }

    var ext = fileExtForLyricsMime(mimeType);
    var newPath = 'userLyricsRecordings/' + user.uid + '/' + fileId + '.' + ext;
    var oldPath = data.files[fileId].audioStoragePath;

    try {
        if (oldPath && oldPath !== newPath) {
            await deleteLyricsAudioAtPath(oldPath);
        }

        var ref = window.firebaseStorage.ref(newPath);
        var uploadTask = ref.put(blob, { contentType: mimeType || 'audio/webm' });
        uploadTask.on('state_changed', function (snapshot) {
            var total = snapshot.totalBytes;
            var pct = total ? Math.round(100 * snapshot.bytesTransferred / total) : 0;
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.classList.remove('is-idle-hint');
                statusEl.textContent = '正在上傳錄音至 Firebase… ' + pct + '%';
            }
            if (btn && total) {
                btn.textContent = '上傳中 ' + pct + '%';
            }
        });
        await uploadTask;
        if (statusEl) {
            statusEl.textContent = '正在取得連結並同步歌詞資料…';
        }
        var downloadUrl = await ref.getDownloadURL();

        saveCurrentFileContentFromUI();
        data = getMyLyricsData();
        if (!data.files[fileId]) throw new Error('missing file');

        data.files[fileId].audioUrl = downloadUrl;
        data.files[fileId].audioStoragePath = newPath;
        data.files[fileId].audioDurationSec = Math.round(durationSec * 10) / 10;
        data.files[fileId].audioMimeType = mimeType;
        data.files[fileId].audioBitrateKbps = 192;
        data.files[fileId].audioUpdatedAt = new Date().toISOString();
        data.files[fileId].updatedAt = data.files[fileId].audioUpdatedAt;
        setMyLyricsData(data);

        await persistMyLyricsToFirestore(false);

        if (statusEl) {
            statusEl.style.display = '';
            statusEl.classList.add('is-idle-hint');
            statusEl.textContent = '錄音已同步至 Firebase（每份歌詞只可儲存一段錄音）。';
        }
        updateMyLyricsAudioUI();
    } catch (error) {
        console.error('uploadLyricsAudioBlob', error);
        alert('上傳錄音失敗：' + (error && error.message ? error.message : String(error)));
        if (statusEl) statusEl.style.display = 'none';
    } finally {
        resetLyricsRecordButton();
    }
}

async function removeMyLyricsAudio() {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) {
        alert('請先登入。');
        return;
    }
    if (!confirm('確定要移除此歌詞的錄音？')) return;

    var data = getMyLyricsData();
    var fileId = data.currentId;
    if (!fileId || !data.files[fileId]) return;

    var path = data.files[fileId].audioStoragePath;
    var removeBtn = document.getElementById('removeLyricsAudioBtn');
    if (removeBtn) removeBtn.disabled = true;

    try {
        await deleteLyricsAudioAtPath(path);
        saveCurrentFileContentFromUI();
        data = getMyLyricsData();
        if (data.files[fileId]) {
            delete data.files[fileId].audioUrl;
            delete data.files[fileId].audioStoragePath;
            delete data.files[fileId].audioDurationSec;
            delete data.files[fileId].audioMimeType;
            delete data.files[fileId].audioBitrateKbps;
            delete data.files[fileId].audioUpdatedAt;
            data.files[fileId].updatedAt = new Date().toISOString();
        }
        setMyLyricsData(data);
        await persistMyLyricsToFirestore(false);
        updateMyLyricsAudioUI();
        hideLyricsRecordingStatus();
    } catch (error) {
        console.error(error);
        alert('移除錄音失敗：' + (error && error.message ? error.message : String(error)));
    } finally {
        if (removeBtn) removeBtn.disabled = false;
    }
}

function updateMyLyricsAudioUI() {
    var wrap = document.getElementById('myLyricsAudioPlayerWrap');
    var audio = document.getElementById('myLyricsAudioPlayer');
    var data = getMyLyricsData();
    var id = data.currentId;
    var file = id && data.files && data.files[id] ? data.files[id] : null;

    if (!file || !file.audioUrl) {
        if (wrap) wrap.style.display = 'none';
        if (audio) {
            audio.removeAttribute('src');
            try { audio.load(); } catch (e) { }
        }
        return;
    }
    if (wrap) wrap.style.display = '';
    if (audio) {
        audio.src = file.audioUrl;
        try { audio.load(); } catch (e) { }
    }
}

async function toggleLyricsRecording() {
    if (myLyricsRecording.mediaRecorder && myLyricsRecording.mediaRecorder.state === 'recording') {
        stopLyricsRecording();
        return;
    }
    await startLyricsRecording();
}

function renderMyLyricsFileList() {
    const data = getMyLyricsData();
    const listEl = document.getElementById('lyricsFileList');
    const nameInput = document.getElementById('lyricsFileNameInput');
    const lyricsTextarea = document.getElementById('lyricsTextarea');
    const dropdownLabel = document.getElementById('lyricsFileDropdownLabel');
    if (!listEl) return;

    listEl.innerHTML = '';
    const ids = Object.keys(data.files || {});
    ids.forEach(function (id) {
        const file = data.files[id];
        const li = document.createElement('li');
        li.textContent = file.name || '未命名';
        li.dataset.fileId = id;
        if (id === data.currentId) li.classList.add('active');
        li.addEventListener('click', function () {
            selectMyLyricsFile(id);
            closeLyricsFileDropdown();
        });
        listEl.appendChild(li);
    });

    if (dropdownLabel) {
        dropdownLabel.textContent = (data.currentId && data.files[data.currentId])
            ? (data.files[data.currentId].name || '未命名')
            : '歌詞檔案';
    }

    if (data.currentId && data.files[data.currentId]) {
        const cur = data.files[data.currentId];
        if (nameInput) nameInput.value = cur.name || '';
        if (nameInput) nameInput.disabled = false;
        if (lyricsTextarea) lyricsTextarea.value = cur.content || '';
        if (lyricsTextarea) lyricsTextarea.disabled = false;
    } else {
        if (nameInput) { nameInput.value = ''; nameInput.disabled = true; }
        if (lyricsTextarea) { lyricsTextarea.value = ''; lyricsTextarea.disabled = true; }
    }
    updateMyLyricsAudioUI();
    refreshMyLyricsRemarksUI();
}

function toggleLyricsFileDropdown() {
    var el = document.getElementById('lyricsFileDropdown');
    var header = document.getElementById('lyricsFileDropdownHeader');
    if (el) el.classList.toggle('open');
    if (header) header.setAttribute('aria-expanded', el && el.classList.contains('open') ? 'true' : 'false');
}

function closeLyricsFileDropdown() {
    var el = document.getElementById('lyricsFileDropdown');
    var header = document.getElementById('lyricsFileDropdownHeader');
    if (el) el.classList.remove('open');
    if (header) header.setAttribute('aria-expanded', 'false');
}

function selectMyLyricsFile(id) {
    abortLyricsRecordingIfAny();
    hideLyricsRecordingStatus();
    const data = getMyLyricsData();
    if (!data.files[id]) return;
    data.currentId = id;
    setMyLyricsData(data);
    renderMyLyricsFileList();
}

function addMyLyricsFile() {
    abortLyricsRecordingIfAny();
    hideLyricsRecordingStatus();
    const data = getMyLyricsData();
    const id = 'file_' + Date.now();
    const count = Object.keys(data.files).length + 1;
    data.files[id] = { name: '新歌詞 ' + count, content: '', updatedAt: new Date().toISOString() };
    data.currentId = id;
    setMyLyricsData(data);
    renderMyLyricsFileList();
    const nameInput = document.getElementById('lyricsFileNameInput');
    if (nameInput) nameInput.focus();
}

function saveCurrentFileContentFromUI() {
    const data = getMyLyricsData();
    const id = data.currentId;
    const nameInput = document.getElementById('lyricsFileNameInput');
    const lyricsTextarea = document.getElementById('lyricsTextarea');
    if (!id || !data.files[id]) return;
    data.files[id].name = (nameInput && nameInput.value.trim()) || data.files[id].name || '未命名';
    data.files[id].content = lyricsTextarea ? lyricsTextarea.value : '';
    data.files[id].updatedAt = new Date().toISOString();
    setMyLyricsData(data);
}

function setupMyLyricsModal() {
    const closeModalBtn = document.getElementById('closeMyLyricsModal');
    const saveToFirebaseBtn = document.getElementById('saveToFirebaseBtn');
    const recordLyricsAudioBtn = document.getElementById('recordLyricsAudioBtn');
    const removeLyricsAudioBtn = document.getElementById('removeLyricsAudioBtn');
    const deleteCurrentLyricsFileBtn = document.getElementById('deleteCurrentLyricsFileBtn');
    const lyricsTextarea = document.getElementById('lyricsTextarea');
    const addBtn = document.getElementById('addLyricsFileBtn');
    const nameInput = document.getElementById('lyricsFileNameInput');
    const dropdownHeader = document.getElementById('lyricsFileDropdownHeader');

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeMyLyricsModal);
    if (deleteCurrentLyricsFileBtn) deleteCurrentLyricsFileBtn.addEventListener('click', function () {
        deleteCurrentMyLyricsFile();
    });
    if (saveToFirebaseBtn) saveToFirebaseBtn.addEventListener('click', saveMyLyricsToFirebase);
    if (recordLyricsAudioBtn) recordLyricsAudioBtn.addEventListener('click', function () {
        toggleLyricsRecording();
    });
    if (removeLyricsAudioBtn) removeLyricsAudioBtn.addEventListener('click', function () {
        removeMyLyricsAudio();
    });

    if (dropdownHeader) dropdownHeader.addEventListener('click', toggleLyricsFileDropdown);

    if (addBtn) addBtn.addEventListener('click', function () {
        addMyLyricsFile();
        closeLyricsFileDropdown();
    });

    if (nameInput) {
        nameInput.addEventListener('change', function () {
            saveCurrentFileContentFromUI();
            renderMyLyricsFileList();
        });
        nameInput.addEventListener('blur', function () {
            saveCurrentFileContentFromUI();
            renderMyLyricsFileList();
        });
    }

    if (lyricsTextarea) {
        let saveTimeout;
        lyricsTextarea.addEventListener('input', function () {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(function () {
                saveCurrentFileContentFromUI();
            }, 500);
        });
    }

    // Split view: desktop = resize width via divider; mobile = resize height via divider
    var divider = document.getElementById('splitViewDivider');
    var panelContent = document.getElementById('lyricsPanelContent');
    var splitView = document.getElementById('splitView');
    if (divider && splitView) {
        var minPanelWidth = 280;
        var maxPanelWidth = Math.max(minPanelWidth, Math.floor(window.innerWidth * 0.9));
        var minHeightVh = 20;
        var maxHeightVh = 85;

        function getPanelWidthPx() {
            var v = splitView.style.getPropertyValue('--lyrics-pane-width');
            if (v && v.endsWith('px')) return parseInt(v, 10);
            return 420;
        }

        function setPanelWidthPx(px) {
            var w = Math.min(maxPanelWidth, Math.max(minPanelWidth, px));
            splitView.style.setProperty('--lyrics-pane-width', w + 'px');
            try { localStorage.setItem('myLyricsPanelWidth', String(w)); } catch (e) { }
        }

        function getPanelHeightVh() {
            var v = splitView.style.getPropertyValue('--lyrics-pane-height');
            if (v && v.endsWith('vh')) return parseFloat(v);
            return 50;
        }

        function setPanelHeightVh(vh) {
            var h = Math.min(maxHeightVh, Math.max(minHeightVh, vh));
            splitView.style.setProperty('--lyrics-pane-height', h + 'vh');
            try { localStorage.setItem('myLyricsPanelHeightVh', String(h)); } catch (e) { }
        }

        function startResize(e) {
            e.preventDefault();
            var isMobile = window.innerWidth <= 768;
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;

            if (isMobile) {
                var startHeightVh = getPanelHeightVh();
                var startY = clientY;

                function onMove(ev) {
                    var y = ev.touches ? ev.touches[0].clientY : ev.clientY;
                    var heightPx = window.innerHeight - y;
                    var vh = (heightPx / window.innerHeight) * 100;
                    setPanelHeightVh(vh);
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.removeEventListener('touchmove', onMove, { passive: false });
                    document.removeEventListener('touchend', onUp);
                }
                onMove(e);
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onUp);
            } else {
                var startX = clientX;
                var startWidth = getPanelWidthPx();
                var maxW = Math.max(minPanelWidth, Math.floor(window.innerWidth * 0.9));

                function onMove(ev) {
                    var x = ev.touches ? ev.touches[0].clientX : ev.clientX;
                    var dx = x - startX;
                    var w = Math.min(maxW, Math.max(minPanelWidth, startWidth - dx));
                    splitView.style.setProperty('--lyrics-pane-width', w + 'px');
                    try { localStorage.setItem('myLyricsPanelWidth', String(w)); } catch (err) { }
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            }
        }

        divider.addEventListener('mousedown', startResize);
        divider.addEventListener('touchstart', startResize, { passive: false });
    }

    // Mobile: resizable height
    var resizeHeightHandle = document.getElementById('lyricsPanelResizeHeight');
    if (resizeHeightHandle && panelContent) {
        var minVh = 30;
        var maxVh = 95;
        var startY, startHeightVh;

        function getPanelHeightVh() {
            var v = panelContent.style.getPropertyValue('--my-lyrics-panel-height');
            if (v && v.endsWith('vh')) return parseFloat(v);
            return 50;
        }

        function setPanelHeightVh(vh) {
            var h = Math.min(maxVh, Math.max(minVh, vh));
            panelContent.style.setProperty('--my-lyrics-panel-height', h + 'vh');
            try { localStorage.setItem('myLyricsPanelHeightVh', String(h)); } catch (e) { }
        }

        function onResizeHeightMove(e) {
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;
            var hPx = window.innerHeight - clientY;
            var vh = (hPx / window.innerHeight) * 100;
            setPanelHeightVh(vh);
        }

        function onResizeHeightEnd() {
            document.removeEventListener('mousemove', onResizeHeightMove);
            document.removeEventListener('mouseup', onResizeHeightEnd);
            document.removeEventListener('touchmove', onResizeHeightMove, { passive: false });
            document.removeEventListener('touchend', onResizeHeightEnd);
        }

        function startResizeHeight(e) {
            e.preventDefault();
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            startHeightVh = getPanelHeightVh();
            onResizeHeightMove(e);
            document.addEventListener('mousemove', onResizeHeightMove);
            document.addEventListener('mouseup', onResizeHeightEnd);
            document.addEventListener('touchmove', onResizeHeightMove, { passive: false });
            document.addEventListener('touchend', onResizeHeightEnd);
        }

        resizeHeightHandle.addEventListener('mousedown', startResizeHeight);
        resizeHeightHandle.addEventListener('touchstart', startResizeHeight, { passive: false });
    }
}

function restoreMyLyricsPanelSize() {
    var panelContent = document.getElementById('lyricsPanelContent');
    var splitView = document.getElementById('splitView');
    if (!splitView) return;
    try {
        if (window.innerWidth <= 768) {
            var vh = localStorage.getItem('myLyricsPanelHeightVh');
            if (vh) {
                var h = parseFloat(vh);
                if (h >= 20 && h <= 85) {
                    splitView.style.setProperty('--lyrics-pane-height', h + 'vh');
                }
            }
        } else {
            var w = localStorage.getItem('myLyricsPanelWidth');
            if (w) {
                var px = parseInt(w, 10);
                if (px >= 280 && px <= 0.9 * window.innerWidth) {
                    splitView.style.setProperty('--lyrics-pane-width', px + 'px');
                }
            }
        }
    } catch (e) { }
}

async function openMyLyricsModal() {
    closeInboxPanel();
    const splitView = document.getElementById('splitView');
    const lyricsTextarea = document.getElementById('lyricsTextarea');

    if (!splitView || !lyricsTextarea) return;

    // Only logged-in users can access 我的歌詞
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) {
        if (typeof window.openLoginPanel === 'function') {
            window.openLoginPanel();
        }
        alert('請先登入才能使用「我的歌詞」。');
        return;
    }

    loadMyLyricsFromLocalStorage();
    await loadMyLyricsFromFirebase();

    refreshMyLyricsRemarksUI();

    var data = getMyLyricsData();
    if (Object.keys(data.files || {}).length === 0) {
        addMyLyricsFile();
    } else if (!data.currentId) {
        var firstId = Object.keys(data.files)[0];
        data.currentId = firstId;
        setMyLyricsData(data);
    }
    renderMyLyricsFileList();
    closeLyricsFileDropdown();

    restoreMyLyricsPanelSize();
    splitView.classList.add('lyrics-open');
    document.body.style.overflow = 'hidden';

    setTimeout(function () {
        lyricsTextarea.focus();
    }, 200);
}

function closeMyLyricsModal() {
    abortLyricsRecordingIfAny();
    hideLyricsRecordingStatus();
    const splitView = document.getElementById('splitView');
    if (splitView) {
        splitView.classList.remove('lyrics-open');
        document.body.style.overflow = '';
    }
}

/** All admin remarks for inbox: newest first; scope line matches admin UI. */
function formatInboxRemarkLines(remarks, files) {
    var fileMap = files && typeof files === 'object' ? files : {};
    if (!Array.isArray(remarks) || remarks.length === 0) return [];
    var sorted = remarks.slice().sort(function (a, b) {
        var ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    });
    return sorted.map(function (r) {
        var text = r && typeof r.text === 'string' ? r.text : String(r || '');
        var createdAt = r && r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
        var by = r && (r.byEmail || r.byName) ? (r.byEmail || r.byName) : '';
        var footer = by || createdAt ? ('— ' + [by, createdAt].filter(Boolean).join(' ')) : '';
        var scopeLine = '【全部歌詞】';
        if (r && r.fileId) {
            var fn = fileMap[r.fileId];
            scopeLine = '【歌詞：' + (fn && fn.name ? String(fn.name) : r.fileId) + '】';
        }
        return scopeLine + '\n' + text + (footer ? ('\n' + footer) : '');
    });
}

function setupInboxPanel() {
    var overlay = document.getElementById('inboxPanelOverlay');
    var closeBtn = document.getElementById('closeInboxPanel');
    if (overlay) overlay.addEventListener('click', closeInboxPanel);
    if (closeBtn) closeBtn.addEventListener('click', closeInboxPanel);
}

function closeInboxPanel() {
    var panel = document.getElementById('inboxPanel');
    if (panel) {
        panel.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function openInboxPanel() {
    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) {
        if (typeof window.openLoginPanel === 'function') {
            window.openLoginPanel();
        }
        alert('請先登入才能查看收件匣。');
        return;
    }
    closeLoginPanel();
    closeMyLyricsModal();

    var panel = document.getElementById('inboxPanel');
    var contentEl = document.getElementById('inboxRemarksContent');
    if (!panel || !contentEl) return;

    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
    contentEl.textContent = '載入中…';

    try {
        var db = window.firebaseDb;
        if (!db) {
            contentEl.textContent = '無法載入：雲端尚未就緒。';
            return;
        }
        var docSnap = await db.collection('userLyrics').doc(user.uid).get();
        var data = docSnap.exists ? docSnap.data() : {};
        var remarks = normalizeUserLyricsRemarks(data.remarks);
        var files = (data.files && typeof data.files === 'object') ? data.files : {};
        var lines = formatInboxRemarkLines(remarks, files);
        contentEl.textContent = lines.length ? lines.join('\n\n') : '（尚無管理員備註）';
    } catch (err) {
        console.error('openInboxPanel', err);
        contentEl.textContent = '載入失敗：' + (err && err.message ? err.message : String(err));
    }
}

function normalizeLyricFileName(name) {
    return (name && typeof name === 'string') ? name.trim() : '';
}

/** Firestore `remarks` must be an array; treat anything else as no remarks. */
function normalizeUserLyricsRemarks(raw) {
    return Array.isArray(raw) ? raw : [];
}

function filterRemarksForCurrentFile(remarks, currentFileId, localFiles, serverFiles) {
    if (!Array.isArray(remarks)) return [];
    var localFile = currentFileId && localFiles && localFiles[currentFileId] ? localFiles[currentFileId] : null;
    var localName = localFile ? normalizeLyricFileName(localFile.name) : '';
    return remarks.filter(function (r) {
        if (!r || typeof r !== 'object') return false;
        if (!r.fileId) return true;
        if (currentFileId && r.fileId === currentFileId) return true;
        if (localName && serverFiles && typeof serverFiles === 'object') {
            var sf = serverFiles[r.fileId];
            var serverName = sf ? normalizeLyricFileName(sf.name) : '';
            if (serverName && serverName === localName) return true;
        }
        if (localName && r.fileName && normalizeLyricFileName(r.fileName) === localName) return true;
        return false;
    });
}

function refreshMyLyricsRemarksUI() {
    var data = getMyLyricsData();
    var id = data.currentId;
    var filtered = filterRemarksForCurrentFile(
        normalizeUserLyricsRemarks(window.currentMyLyricsRemarks),
        id,
        data.files || {},
        window.myLyricsServerFilesSnapshot || null
    );
    renderMyLyricsRemarks(filtered);
}

function formatMyLyricsRemarkLines(remarks) {
    if (!Array.isArray(remarks) || remarks.length === 0) return [];
    return remarks.map(function (r) {
        const text = r && typeof r.text === 'string' ? r.text : String(r || '');
        const createdAt = r && r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
        const by = r && (r.byEmail || r.byName) ? (r.byEmail || r.byName) : '';
        const footer = by || createdAt ? ('— ' + [by, createdAt].filter(Boolean).join(' ')) : '';
        return text + (footer ? ('\n' + footer) : '');
    });
}

function renderMyLyricsRemarks(remarks) {
    const section = document.getElementById('myLyricsRemarkSection');
    const textEl = document.getElementById('myLyricsRemarkText');
    if (!section || !textEl) return;

    const lines = formatMyLyricsRemarkLines(remarks);
    if (lines.length === 0) {
        section.style.display = 'none';
        textEl.textContent = '';
        return;
    }

    textEl.textContent = lines.join('\n\n');
    section.style.display = 'block';
}

async function deleteCurrentMyLyricsFile() {
    abortLyricsRecordingIfAny();
    hideLyricsRecordingStatus();

    var data = getMyLyricsData();
    var id = data.currentId;
    if (!id || !data.files || !data.files[id]) {
        alert('沒有可刪除的歌詞檔案。');
        return;
    }
    if (!confirm('確定要刪除此歌詞檔案？內容與錄音將一併從本機移除；若已登入，亦會同步刪除雲端檔案。（此操作無法復原）')) return;

    var path = data.files[id].audioStoragePath;
    delete data.files[id];

    var remaining = Object.keys(data.files);
    if (remaining.length === 0) {
        var newId = 'file_' + Date.now();
        data.files[newId] = { name: '新歌詞 1', content: '', updatedAt: new Date().toISOString() };
        data.currentId = newId;
    } else {
        data.currentId = remaining[0];
    }
    setMyLyricsData(data);

    if (path) {
        await deleteLyricsAudioAtPath(path);
    }

    renderMyLyricsFileList();
    refreshMyLyricsRemarksUI();

    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (user && window.firebaseDb) {
        try {
            await persistMyLyricsToFirestore(false);
        } catch (error) {
            console.error('deleteCurrentMyLyricsFile sync', error);
            alert('已從本機刪除，但同步到雲端失敗：' + (error && error.message ? error.message : String(error)));
        }
    }
}

function loadMyLyricsFromLocalStorage() {
    getMyLyricsData(); // ensures migration from legacy single lyric if needed
    console.log('✓ Loaded lyrics from localStorage');
}

async function loadMyLyricsFromFirebase() {
    try {
        var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
        if (!user || !window.firebaseDb) {
            if (!user) console.log('Not logged in, skipping Firebase lyrics load');
            else console.log('Firebase not initialized, skipping Firebase load');
            return;
        }
        var db = window.firebaseDb;
        var docRef = db.collection('userLyrics').doc(user.uid);
        var docSnap = await docRef.get();
        if (!docSnap.exists()) {
            console.log('No lyrics found in Firebase for this user');
            window.currentMyLyricsRemarks = [];
            window.myLyricsServerFilesSnapshot = null;
            refreshMyLyricsRemarksUI();
            return;
        }
        var data = docSnap.data();
        window.myLyricsServerFilesSnapshot = (data.files && typeof data.files === 'object') ? data.files : {};
        // Used by the student panel to show the latest admin remark (if any).
        window.currentMyLyricsRemarks = normalizeUserLyricsRemarks(data && data.remarks);
        var firebaseFiles = data.files;
        var firebaseUpdatedAt = data.updatedAt || '';
        if (!firebaseFiles || typeof firebaseFiles !== 'object') {
            var legacy = data.lyrics;
            if (legacy) {
                var local = getMyLyricsData();
                var id = 'file_' + Date.now();
                local.files = local.files || {};
                local.files[id] = { name: '我的歌詞', content: legacy, updatedAt: firebaseUpdatedAt };
                if (!local.currentId) local.currentId = id;
                setMyLyricsData(local);
                console.log('✓ Migrated single lyric from Firebase to files');
            }
            refreshMyLyricsRemarksUI();
            return;
        }
        var local = getMyLyricsData();
        var localUpdated = local.files && Object.keys(local.files).length ? Object.values(local.files).reduce(function (max, f) { return (f.updatedAt > max) ? f.updatedAt : max; }, '') : '';
        if (firebaseUpdatedAt > localUpdated) {
            local.files = firebaseFiles;
            var ids = Object.keys(firebaseFiles);
            if (!ids.length) local.currentId = null;
            else if (!local.currentId || !firebaseFiles[local.currentId]) local.currentId = ids[0];
            setMyLyricsData(local);
            console.log('✓ Loaded lyrics files from Firebase');
        }
        refreshMyLyricsRemarksUI();
    } catch (error) {
        console.warn('Error loading lyrics from Firebase:', error);
    }
}

function saveMyLyricsToLocalStorage() {
    saveCurrentFileContentFromUI();
    console.log('✓ Saved lyrics to localStorage');
}

async function saveMyLyricsToFirebase() {
    var saveBtn = document.getElementById('saveToFirebaseBtn');
    if (!saveBtn) return;

    var user = window.firebaseAuth ? window.firebaseAuth.currentUser : null;
    if (!user) {
        alert('請先登入才能儲存歌詞到 Firebase。');
        return;
    }

    saveCurrentFileContentFromUI();
    var data = getMyLyricsData();
    if (!data.files || Object.keys(data.files).length === 0) {
        alert('請先新增或輸入歌詞！');
        return;
    }

    var originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存中...';

    try {
        await persistMyLyricsToFirestore(true);
        await loadMyLyricsFromFirebase();
    } catch (error) {
        console.error('✗ Error saving lyrics to Firebase:', error);
        if (error.message && error.message.includes('permissions')) {
            alert('⚠ 儲存失敗：Firebase 權限錯誤。請檢查 Firebase 設定。\n\n歌詞已儲存到本地瀏覽器。');
        } else {
            alert('⚠ 儲存到 Firebase 失敗：' + (error && error.message ? error.message : String(error)) + '\n\n歌詞已儲存到本地瀏覽器。');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

// --- Firebase Auth & Login Panel ---

function setupLoginPanel() {
    const panel = document.getElementById('loginPanel');
    const overlay = document.getElementById('loginPanelOverlay');
    const closeBtn = document.getElementById('closeLoginPanel');
    const signOutBtn = document.getElementById('signOutBtn');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginError = document.getElementById('loginError');
    const signupError = document.getElementById('signupError');
    const tabs = document.querySelectorAll('.auth-tab');

    if (overlay) overlay.addEventListener('click', closeLoginPanel);
    if (closeBtn) closeBtn.addEventListener('click', closeLoginPanel);

    if (signOutBtn) {
        signOutBtn.addEventListener('click', function () {
            if (!window.firebaseAuth) return;
            window.firebaseAuth.signOut().then(function () {
                closeLoginPanel();
            }).catch(function (err) {
                console.error('Sign out error:', err);
            });
        });
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            const t = this.getAttribute('data-tab');
            tabs.forEach(function (x) { x.classList.remove('active'); });
            this.classList.add('active');
            if (t === 'login') {
                if (loginForm) loginForm.style.display = 'block';
                if (signupForm) signupForm.style.display = 'none';
                if (loginError) loginError.textContent = '';
            } else {
                if (loginForm) loginForm.style.display = 'none';
                if (signupForm) signupForm.style.display = 'block';
                if (signupError) signupError.textContent = '';
            }
        });
    });

    // Forgot password
    var forgotPasswordLink = document.getElementById('forgotPasswordLink');
    var forgotPasswordBlock = document.getElementById('forgotPasswordBlock');
    var forgotPasswordEmail = document.getElementById('forgotPasswordEmail');
    var forgotPasswordError = document.getElementById('forgotPasswordError');
    var forgotPasswordSuccess = document.getElementById('forgotPasswordSuccess');
    var sendResetEmailBtn = document.getElementById('sendResetEmailBtn');
    var cancelForgotPasswordBtn = document.getElementById('cancelForgotPasswordBtn');

    if (forgotPasswordLink && forgotPasswordBlock) {
        forgotPasswordLink.addEventListener('click', function (e) {
            e.preventDefault();
            forgotPasswordBlock.style.display = 'block';
            if (forgotPasswordEmail) forgotPasswordEmail.value = document.getElementById('loginEmail').value.trim();
            if (forgotPasswordError) forgotPasswordError.textContent = '';
            if (forgotPasswordSuccess) { forgotPasswordSuccess.style.display = 'none'; forgotPasswordSuccess.textContent = ''; }
        });
    }
    if (cancelForgotPasswordBtn && forgotPasswordBlock) {
        cancelForgotPasswordBtn.addEventListener('click', function () {
            forgotPasswordBlock.style.display = 'none';
            if (forgotPasswordError) forgotPasswordError.textContent = '';
            if (forgotPasswordSuccess) { forgotPasswordSuccess.style.display = 'none'; forgotPasswordSuccess.textContent = ''; }
        });
    }
    if (sendResetEmailBtn && window.firebaseAuth) {
        sendResetEmailBtn.addEventListener('click', function () {
            var email = forgotPasswordEmail ? forgotPasswordEmail.value.trim() : '';
            if (forgotPasswordError) forgotPasswordError.textContent = '';
            if (forgotPasswordSuccess) { forgotPasswordSuccess.style.display = 'none'; forgotPasswordSuccess.textContent = ''; }
            if (!email) {
                if (forgotPasswordError) forgotPasswordError.textContent = '請輸入電郵地址';
                return;
            }
            sendResetEmailBtn.disabled = true;
            window.firebaseAuth.sendPasswordResetEmail(email)
                .then(function () {
                    if (forgotPasswordSuccess) {
                        forgotPasswordSuccess.textContent = '已寄出！請檢查你的電郵收件匣（及垃圾郵件）。';
                        forgotPasswordSuccess.style.display = 'block';
                    }
                    sendResetEmailBtn.disabled = false;
                })
                .catch(function (err) {
                    var msg = '無法寄出重設信';
                    if (err.code === 'auth/user-not-found') msg = '找不到此電郵帳號';
                    else if (err.code === 'auth/invalid-email') msg = '請輸入有效的電郵地址';
                    else if (err.message) msg = err.message;
                    if (forgotPasswordError) forgotPasswordError.textContent = msg;
                    sendResetEmailBtn.disabled = false;
                });
        });
    }

    // Google sign-in
    var googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn && window.firebaseAuth) {
        googleSignInBtn.addEventListener('click', function () {
            if (loginError) loginError.textContent = '';
            var provider = new firebase.auth.GoogleAuthProvider();
            window.firebaseAuth.signInWithPopup(provider)
                .then(function () {
                    closeLoginPanel();
                })
                .catch(function (err) {
                    var msg = 'Google 登入失敗';
                    if (err.code === 'auth/popup-closed-by-user') msg = '已取消登入';
                    else if (err.code === 'auth/popup-blocked') msg = '請允許彈出視窗以使用 Google 登入';
                    else if (err.code === 'auth/cancelled-popup-request') return;
                    else if (err.message) msg = err.message;
                    if (loginError) loginError.textContent = msg;
                });
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!window.firebaseAuth) return;
            var email = document.getElementById('loginEmail').value.trim();
            var password = document.getElementById('loginPassword').value;
            if (loginError) loginError.textContent = '';
            window.firebaseAuth.signInWithEmailAndPassword(email, password)
                .then(function () {
                    closeLoginPanel();
                })
                .catch(function (err) {
                    var msg = '登入失敗';
                    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                        msg = '電郵或密碼錯誤，請再試';
                    } else if (err.code === 'auth/invalid-email') {
                        msg = '請輸入有效的電郵地址';
                    } else if (err.message) {
                        msg = err.message;
                    }
                    if (loginError) loginError.textContent = msg;
                });
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!window.firebaseAuth) return;
            var email = document.getElementById('signupEmail').value.trim();
            var password = document.getElementById('signupPassword').value;
            var displayName = document.getElementById('signupDisplayName').value.trim();
            if (signupError) signupError.textContent = '';
            window.firebaseAuth.createUserWithEmailAndPassword(email, password)
                .then(function (userCredential) {
                    if (displayName && userCredential.user) {
                        return userCredential.user.updateProfile({ displayName: displayName }).then(function () {
                            closeLoginPanel();
                        });
                    }
                    closeLoginPanel();
                })
                .catch(function (err) {
                    var msg = '註冊失敗';
                    if (err.code === 'auth/email-already-in-use') {
                        msg = '此電郵已被使用，請改用「登入」';
                    } else if (err.code === 'auth/weak-password') {
                        msg = '密碼至少需要 6 個字';
                    } else if (err.code === 'auth/invalid-email') {
                        msg = '請輸入有效的電郵地址';
                    } else if (err.message) {
                        msg = err.message;
                    }
                    if (signupError) signupError.textContent = msg;
                });
        });
    }
}

function openLoginPanel() {
    closeInboxPanel();
    var panel = document.getElementById('loginPanel');
    if (!panel) return;
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
    // Reset to login tab and clear errors
    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var loginError = document.getElementById('loginError');
    var signupError = document.getElementById('signupError');
    var tabs = document.querySelectorAll('.auth-tab');
    if (tabs.length) {
        tabs.forEach(function (x) { x.classList.remove('active'); });
        if (tabs[0]) tabs[0].classList.add('active');
    }
    if (loginForm) loginForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
    if (loginError) loginError.textContent = '';
    if (signupError) signupError.textContent = '';
    var forgotPasswordBlock = document.getElementById('forgotPasswordBlock');
    if (forgotPasswordBlock) forgotPasswordBlock.style.display = 'none';
}

function closeLoginPanel() {
    var panel = document.getElementById('loginPanel');
    if (panel) {
        panel.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function updateLoginUI(user) {
    var loginLink = document.getElementById('loginMenuLink');
    var loginAuthState = document.getElementById('loginAuthState');
    var loginFormContainer = document.getElementById('loginFormContainer');
    var loginUserEmail = document.getElementById('loginUserEmail');
    var signOutBtn = document.getElementById('signOutBtn');
    var myLyricsMenuItem = document.getElementById('myLyricsMenuItem');
    var inboxMenuItem = document.getElementById('inboxMenuItem');
    var adminMenuItem = document.getElementById('adminMenuItem');

    if (!loginLink) return;

    if (user) {
        loginLink.textContent = user.email || user.displayName || '已登入';
        loginLink.href = '#login';
        if (loginAuthState) loginAuthState.style.display = 'block';
        if (loginUserEmail) loginUserEmail.textContent = '已登入：' + (user.email || '');
        if (signOutBtn) signOutBtn.style.display = 'block';
        if (loginFormContainer) loginFormContainer.style.display = 'none';
        if (myLyricsMenuItem) myLyricsMenuItem.style.display = 'list-item';
        if (inboxMenuItem) inboxMenuItem.style.display = 'list-item';

        if (adminMenuItem) {
            adminMenuItem.style.display = 'none';
            var FOREVER_ADMIN_EMAIL = 'kelvinlee@futureleadersunion.com';
            var emailLower = (user.email || '').trim().toLowerCase();
            if (emailLower && emailLower === FOREVER_ADMIN_EMAIL) {
                adminMenuItem.style.display = 'list-item';
            } else if (emailLower && window.firebaseDb) {
                // If Firestore denies access, treat as non-admin.
                window.firebaseDb.collection('admins').doc(emailLower).get()
                    .then(function (docSnap) {
                        if (!adminMenuItem) return;
                        adminMenuItem.style.display = (docSnap && docSnap.exists) ? 'list-item' : 'none';
                    })
                    .catch(function () {
                        if (!adminMenuItem) return;
                        adminMenuItem.style.display = 'none';
                    });
            }
        }
    } else {
        loginLink.textContent = '登入';
        loginLink.href = '#login';
        if (loginAuthState) loginAuthState.style.display = 'none';
        if (loginUserEmail) loginUserEmail.textContent = '';
        if (signOutBtn) signOutBtn.style.display = 'none';
        if (loginFormContainer) loginFormContainer.style.display = 'block';
        if (myLyricsMenuItem) myLyricsMenuItem.style.display = 'none';
        if (inboxMenuItem) inboxMenuItem.style.display = 'none';
        if (adminMenuItem) adminMenuItem.style.display = 'none';
        closeInboxPanel();
        window.currentMyLyricsRemarks = null;
        window.myLyricsServerFilesSnapshot = null;
    }
}

