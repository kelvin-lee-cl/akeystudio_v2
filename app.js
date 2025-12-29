// Deepseek API Configuration
const DEEPSEEK_API_KEY = 'sk-385c41d3fd0041b780652153be6dc675';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Tone mapping configuration
const TONE_MAPPING = {
    '0': [4],
    '2': [6, 9],
    '3': [1, 2, 7],
    '4': [3, 5, 8]
};

// DOM elements (will be initialized when DOM is ready)
let form, inputDigits, generateBtn, errorMessage, resultsSection, resultsContainer, jsonOutput, jsonContent, copyJsonBtn, viewJsonBtn, regenerateBtn, downloadCacheBtn, selectAllBtn, deleteSelectedBtn, selectedCountSpan;
let regenerateModal, patternsCheckboxContainer, phraseCountInput, submitRegenerateBtn, cancelRegenerateBtn, selectAllPatternsBtn, deselectAllPatternsBtn, modalClose;

// Lyrics cache (loaded from JSON file)
let lyricsCache = {};

// Load lyrics cache from JSON file
async function loadLyricsCache(forceReload = false) {
    // If cache is already loaded and has entries, don't reload (unless forced)
    if (!forceReload && Object.keys(lyricsCache).length > 0) {
        console.log('📥 Cache already loaded:', Object.keys(lyricsCache).length, 'entries');
        console.log('📥 Cache keys:', Object.keys(lyricsCache).slice(0, 10).join(', '));
        return true;
    }

    try {
        console.log('📥 Loading lyrics-cache.json...');
        // Add timestamp to prevent browser caching
        const cacheBuster = `?t=${Date.now()}`;
        const url = `lyrics-cache.json${cacheBuster}`;
        console.log('📥 Fetching:', url);
        const response = await fetch(url, {
            cache: 'no-store', // Don't use browser cache
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        console.log('📥 Response status:', response.status, response.statusText);

        if (response.ok) {
            const text = await response.text();
            console.log('📥 Raw response length:', text.length, 'characters');

            try {
                const data = JSON.parse(text);
                lyricsCache = data; // Overwrite with loaded data
                const keys = Object.keys(lyricsCache);
                console.log('✓ Lyrics cache loaded:', keys.length, 'entries');
                console.log('✓ Sample keys:', keys.slice(0, 10));

                // Verify structure
                if (keys.length > 0) {
                    const firstKey = keys[0];
                    const firstEntry = lyricsCache[firstKey];
                    console.log('✓ Cache structure verified - sample entry:', {
                        key: firstKey,
                        hasInput: !!firstEntry.input,
                        hasResults: !!firstEntry.results
                    });
                }
                return true;
            } catch (parseError) {
                console.error('❌ JSON parsing error:', parseError);
                console.error('❌ Response preview:', text.substring(0, 200));
                lyricsCache = {};
                return false;
            }
        } else {
            console.error('❌ Failed to load lyrics-cache.json:', response.status, response.statusText);
            lyricsCache = {};
            return false;
        }
    } catch (error) {
        console.error('❌ Error loading lyrics cache:', error);
        lyricsCache = {};
        return false;
    }
}

// Save lyrics to cache (in memory and optionally to localStorage)
function saveToCache(input, responseData) {
    lyricsCache[input] = responseData;

    // Also save to localStorage as backup
    try {
        localStorage.setItem('lyricsCache', JSON.stringify(lyricsCache));
        console.log('✓ Saved to cache:', input);
    } catch (e) {
        console.warn('⚠️ Could not save to localStorage:', e);
    }
}

// Get lyrics from cache
function getFromCache(input) {
    // Debug: Log cache state
    console.log('🔍 Checking cache for input:', input);
    console.log('🔍 Cache keys available:', Object.keys(lyricsCache).length);

    // Check if input exists as a key
    if (input in lyricsCache) {
        const cachedEntry = lyricsCache[input];
        console.log('✓✅ FOUND IN CACHE!');
        console.log('   Input:', cachedEntry.input);
        console.log('   Has results:', !!cachedEntry.results);
        console.log('   Has patterns:', !!cachedEntry.patterns);

        // Verify the entry structure matches what we expect
        if (cachedEntry && cachedEntry.input === input) {
            return cachedEntry;
        } else {
            console.warn('⚠️ Cache entry structure mismatch:', cachedEntry);
        }
    }

    console.log('   ❌ Key "' + input + '" not found in cache');
    console.log('   Available keys:', Object.keys(lyricsCache).slice(0, 20).join(', '));

    // Check localStorage as backup
    try {
        const localCache = localStorage.getItem('lyricsCache');
        if (localCache) {
            const parsed = JSON.parse(localCache);
            if (parsed[input]) {
                console.log('✓ Found in localStorage cache:', input);
                lyricsCache[input] = parsed[input]; // Update in-memory cache
                return parsed[input];
            }
        }
    } catch (e) {
        console.warn('⚠️ Error reading localStorage:', e);
    }

    return null;
}

// Initialize when DOM is ready
(function () {
    'use strict';

    function init() {
        console.log('Cantonese Lyric Generator initialized');
        console.log('Document ready state:', document.readyState);

        // Get DOM elements
        form = document.getElementById('lyricForm');
        inputDigits = document.getElementById('inputDigits');
        generateBtn = document.getElementById('generateBtn');
        errorMessage = document.getElementById('errorMessage');
        resultsSection = document.getElementById('resultsSection');
        resultsContainer = document.getElementById('resultsContainer');
        jsonOutput = document.getElementById('jsonOutput');
        jsonContent = document.getElementById('jsonContent');
        copyJsonBtn = document.getElementById('copyJsonBtn');
        viewJsonBtn = document.getElementById('viewJsonBtn');
        regenerateBtn = document.getElementById('regenerateBtn');
        downloadCacheBtn = document.getElementById('downloadCacheBtn');
        selectAllBtn = document.getElementById('selectAllBtn');
        deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        selectedCountSpan = document.getElementById('selectedCount');

        // Modal elements
        regenerateModal = document.getElementById('regenerateModal');
        patternsCheckboxContainer = document.getElementById('patternsCheckboxContainer');
        phraseCountInput = document.getElementById('phraseCountInput');
        submitRegenerateBtn = document.getElementById('submitRegenerateBtn');
        cancelRegenerateBtn = document.getElementById('cancelRegenerateBtn');
        selectAllPatternsBtn = document.getElementById('selectAllPatternsBtn');
        deselectAllPatternsBtn = document.getElementById('deselectAllPatternsBtn');
        modalClose = regenerateModal?.querySelector('.modal-close');

        // Debug: Log all elements
        console.log('DOM Elements check:');
        console.log('  form:', form ? '✓' : '✗');
        console.log('  inputDigits:', inputDigits ? '✓' : '✗');
        console.log('  generateBtn:', generateBtn ? '✓' : '✗');
        console.log('  errorMessage:', errorMessage ? '✓' : '✗');

        // Verify all DOM elements exist
        if (!form || !inputDigits || !generateBtn) {
            console.error('Required DOM elements not found');
            console.error('Available elements:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));

            // Try again after a short delay if elements not found
            if (document.readyState === 'loading' || !form) {
                console.log('Retrying initialization in 100ms...');
                setTimeout(init, 100);
                return;
            }

            if (errorMessage) {
                errorMessage.textContent = 'Application initialization failed. Please refresh the page.';
                errorMessage.style.display = 'block';
            }
            return;
        }

        console.log('✓ All DOM elements found, setting up event listeners...');

        // Load lyrics cache immediately on initialization
        loadLyricsCache().then((success) => {
            if (success) {
                console.log('✓ Cache loading completed during initialization');
                console.log('✓ Cache ready with', Object.keys(lyricsCache).length, 'entries');
            } else {
                console.warn('⚠️ Cache loading failed during initialization');
            }
        }).catch((error) => {
            console.error('❌ Cache loading error during initialization:', error);
        });

        // Set up event listeners
        setupEventListeners();

        console.log('✓ Application ready!');
    }

    // Wait for DOM to be ready - use multiple strategies
    if (document.readyState === 'loading') {
        // Still loading - wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', init);
    } else if (document.readyState === 'interactive') {
        // DOM is interactive but might not be fully parsed
        document.addEventListener('DOMContentLoaded', init);
        // Also try after a short delay as backup
        setTimeout(init, 100);
    } else {
        // DOM is complete - but wait a tick to ensure all scripts are parsed
        setTimeout(init, 0);
    }
})();

function setupEventListeners() {
    // Input validation on type
    if (inputDigits) {
        inputDigits.addEventListener('input', (e) => {
            const value = e.target.value;
            // Only allow digits 0, 2, 3, 4
            e.target.value = value.replace(/[^0234]/g, '');
        });
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const input = inputDigits.value.trim();
            const validation = validateInput(input);

            if (!validation.valid) {
                showError(validation.error);
                return;
            }

            // Show loading state
            generateBtn.disabled = true;
            const btnText = generateBtn.querySelector('.btn-text');
            const btnLoader = generateBtn.querySelector('.btn-loader');

            if (btnText) btnText.style.display = 'none';
            if (btnLoader) {
                btnLoader.style.display = 'inline';
                btnLoader.textContent = '⏳ Processing...';
            }

            try {
                console.log('═══════════════════════════════════════');
                console.log('🔍 Processing input:', input);
                console.log('═══════════════════════════════════════');

                // STEP 1: Ensure cache is loaded from lyrics-cache.json
                console.log('📥 Step 1: Ensuring cache is loaded...');
                console.log('   📥 Current cache state:', Object.keys(lyricsCache).length, 'entries');

                // Force reload to ensure we have the latest cache
                const cacheLoaded = await loadLyricsCache(true); // Force reload
                if (!cacheLoaded) {
                    console.warn('⚠️ Cache loading failed, but continuing...');
                }
                console.log('   ✓ Cache status:', cacheLoaded ? 'LOADED' : 'FAILED');
                console.log('   ✓ Cache entries:', Object.keys(lyricsCache).length);
                console.log('   ✓ Cache keys:', Object.keys(lyricsCache));

                // Show first few keys for debugging
                const cacheKeys = Object.keys(lyricsCache);
                if (cacheKeys.length > 0) {
                    console.log('   ✓ Sample cache keys:', cacheKeys.slice(0, 5).join(', '));
                }

                // STEP 2: Check if result exists in cache BEFORE making API calls
                console.log('🔍 Step 2: Checking cache for input "' + input + '"...');
                console.log('   🔍 Input type:', typeof input);
                console.log('   🔍 Input value:', JSON.stringify(input));
                console.log('   🔍 All cache keys:', Object.keys(lyricsCache));
                console.log('   🔍 Checking if "' + input + '" in cache:', input in lyricsCache);

                const cachedData = getFromCache(input);

                if (cachedData) {
                    console.log('   ✓✅ FOUND IN CACHE!');
                    console.log('   ✓ Cache data structure:', {
                        input: cachedData.input,
                        patterns: Object.keys(cachedData.patterns || {}),
                        results: Object.keys(cachedData.results || {})
                    });
                    console.log('   ⚠️ SKIPPING Deepseek API calls - using cached data');
                    console.log('═══════════════════════════════════════');

                    // Update button to show cache hit
                    if (btnLoader) {
                        btnLoader.textContent = '✓ Loaded from cache';
                        setTimeout(() => {
                            if (btnLoader) btnLoader.style.display = 'none';
                            if (btnText) btnText.style.display = 'inline';
                        }, 1000);
                    }

                    // Display cached results immediately
                    displayResults(cachedData, true); // true = from cache
                    generateBtn.disabled = false;
                    return; // IMPORTANT: Exit early - no API calls made
                }

                // STEP 3: Not found in cache - proceed to Deepseek API
                console.log('   ❌ NOT FOUND IN CACHE');
                console.log('   → Proceeding to Deepseek API calls...');
                console.log('═══════════════════════════════════════');

                // Not in cache - generate tone patterns
                const { patterns } = generateTonePatterns(input);
                const digitMapping = buildDigitMapping(input);

                console.log(`Generated ${patterns.length} tone patterns`);

                // Limit patterns to prevent too many API calls (max 10 patterns)
                const maxPatterns = 10;
                const patternsToProcess = patterns.slice(0, maxPatterns);

                if (patterns.length > maxPatterns) {
                    showError(`Too many patterns (${patterns.length}). Processing first ${maxPatterns} patterns only.`);
                }

                console.log(`Processing ${patternsToProcess.length} of ${patterns.length} patterns`);

                // Update progress
                if (btnLoader) {
                    btnLoader.textContent = `⏳ Processing ${patternsToProcess.length} patterns...`;
                }

                // Generate lyrics via API
                const results = await generateLyrics(patternsToProcess, input.length, 3, (progress) => {
                    // Update progress callback
                    if (btnLoader) {
                        btnLoader.textContent = `⏳ Processing... ${progress.current}/${progress.total}`;
                    }
                });

                console.log('Results received:', Object.keys(results).length, 'patterns');

                // Build response
                const responseData = buildResponse(input, digitMapping, patterns, results);

                // Save to cache for future use
                saveToCache(input, responseData);

                // Display results
                displayResults(responseData, false); // false = not from cache

            } catch (error) {
                console.error('Error:', error);
                let errorMsg = 'An error occurred while generating lyrics. ';
                if (error.message.includes('CORS') || error.message.includes('fetch')) {
                    errorMsg += 'This might be a CORS issue. Try using a local server or check your network connection.';
                } else if (error.message.includes('API error')) {
                    errorMsg += `API Error: ${error.message}`;
                } else {
                    errorMsg += `Error: ${error.message}`;
                }
                showError(errorMsg);
            } finally {
                // Reset button state
                generateBtn.disabled = false;
                const btnText = generateBtn.querySelector('.btn-text');
                const btnLoader = generateBtn.querySelector('.btn-loader');

                if (btnText) btnText.style.display = 'inline';
                if (btnLoader) btnLoader.style.display = 'none';
            }
        });
    }

    // Copy JSON to clipboard
    if (copyJsonBtn) {
        copyJsonBtn.addEventListener('click', () => {
            const jsonText = jsonContent.textContent;
            navigator.clipboard.writeText(jsonText).then(() => {
                copyJsonBtn.textContent = '✓ Copied!';
                setTimeout(() => {
                    copyJsonBtn.textContent = 'Copy JSON';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                alert('Failed to copy to clipboard');
            });
        });
    }

    // Toggle JSON view
    if (viewJsonBtn) {
        viewJsonBtn.addEventListener('click', () => {
            if (jsonOutput) {
                const isCollapsed = jsonOutput.classList.contains('collapsed');
                if (isCollapsed) {
                    jsonOutput.classList.remove('collapsed');
                    viewJsonBtn.textContent = 'Hide JSON';
                } else {
                    jsonOutput.classList.add('collapsed');
                    viewJsonBtn.textContent = 'View JSON';
                }
            }
        });
    }

    // Regenerate lyrics (show modal)
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', () => {
            const currentInput = inputDigits.value.trim();
            if (!currentInput) {
                showError('Please enter an input first');
                return;
            }

            if (!window.currentResponseData) {
                showError('No results to regenerate. Please generate lyrics first.');
                return;
            }

            // Show modal and populate patterns
            showRegenerateModal();
        });
    }

    // Modal handlers
    if (regenerateModal) {
        // Close modal handlers
        if (modalClose) {
            modalClose.addEventListener('click', closeRegenerateModal);
        }
        if (cancelRegenerateBtn) {
            cancelRegenerateBtn.addEventListener('click', closeRegenerateModal);
        }

        // Close on backdrop click
        regenerateModal.addEventListener('click', (e) => {
            if (e.target === regenerateModal) {
                closeRegenerateModal();
            }
        });

        // Select all patterns
        if (selectAllPatternsBtn) {
            selectAllPatternsBtn.addEventListener('click', () => {
                const checkboxes = patternsCheckboxContainer?.querySelectorAll('input[type="checkbox"]');
                checkboxes?.forEach(cb => cb.checked = true);
            });
        }

        // Deselect all patterns
        if (deselectAllPatternsBtn) {
            deselectAllPatternsBtn.addEventListener('click', () => {
                const checkboxes = patternsCheckboxContainer?.querySelectorAll('input[type="checkbox"]');
                checkboxes?.forEach(cb => cb.checked = false);
            });
        }

        // Submit regenerate
        if (submitRegenerateBtn) {
            submitRegenerateBtn.addEventListener('click', async () => {
                await handleRegenerate();
            });
        }
    }

    // Function to show regenerate modal
    function showRegenerateModal() {
        if (!regenerateModal || !window.currentResponseData) return;

        const patternType = Object.keys(window.currentResponseData.patterns)[0];
        const patterns = window.currentResponseData.patterns[patternType];

        // Populate patterns checkboxes
        if (patternsCheckboxContainer) {
            patternsCheckboxContainer.innerHTML = '';
            patterns.forEach(pattern => {
                const label = document.createElement('label');
                label.className = 'pattern-checkbox-label';
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '8px';
                label.style.cursor = 'pointer';
                label.style.padding = '8px 12px';
                label.style.borderRadius = '8px';
                label.style.transition = 'background 0.2s ease';
                label.innerHTML = `
                    <input type="checkbox" value="${pattern}" checked style="width: 18px; height: 18px; cursor: pointer;">
                    <span>${pattern}</span>
                `;
                label.addEventListener('mouseenter', () => {
                    label.style.background = '#f0f0f0';
                });
                label.addEventListener('mouseleave', () => {
                    label.style.background = 'transparent';
                });
                patternsCheckboxContainer.appendChild(label);
            });
        }

        // Reset phrase count to default
        if (phraseCountInput) {
            phraseCountInput.value = '3';
        }

        // Show modal
        regenerateModal.style.display = 'flex';
    }

    // Function to close regenerate modal
    function closeRegenerateModal() {
        if (regenerateModal) {
            regenerateModal.style.display = 'none';
        }
    }

    // Function to handle regenerate submission
    async function handleRegenerate() {
        const currentInput = inputDigits.value.trim();
        if (!currentInput) {
            showError('Please enter an input first');
            return;
        }

        // Get selected patterns
        const checkboxes = patternsCheckboxContainer?.querySelectorAll('input[type="checkbox"]:checked');
        if (!checkboxes || checkboxes.length === 0) {
            showError('Please select at least one pattern to regenerate');
            return;
        }

        const selectedPatterns = Array.from(checkboxes).map(cb => cb.value);

        // Get phrase count
        const phraseCount = parseInt(phraseCountInput?.value || '3', 10);
        if (isNaN(phraseCount) || phraseCount < 1 || phraseCount > 10) {
            showError('Please enter a valid phrase count (1-10)');
            return;
        }

        // Close modal
        closeRegenerateModal();

        // Disable regenerate button and show loading
        regenerateBtn.disabled = true;
        regenerateBtn.textContent = '⏳ Regenerating...';
        hideError();

        try {
            // Ensure cache is loaded before processing
            await loadLyricsCache();

            // Get existing phrases to avoid duplicates
            const existingPhrases = new Set();
            if (window.currentResponseData) {
                const patternType = Object.keys(window.currentResponseData.patterns)[0];
                const existingResults = window.currentResponseData.results[patternType];

                Object.keys(existingResults).forEach(pattern => {
                    if (!pattern.endsWith('_error') && existingResults[pattern]) {
                        existingResults[pattern].forEach(phrase => {
                            existingPhrases.add(phrase.phrase);
                        });
                    }
                });
            }

            console.log(`Found ${existingPhrases.size} existing phrases to avoid duplicating`);
            console.log(`Regenerating ${selectedPatterns.length} patterns:`, selectedPatterns);
            console.log(`Phrases per pattern: ${phraseCount}`);

            // Generate lyrics via API with selected patterns and phrase count
            const newResults = await generateLyrics(selectedPatterns, currentInput.length, phraseCount, (progress) => {
                regenerateBtn.textContent = `⏳ Regenerating... ${progress.current}/${progress.total}`;
            });

            console.log('Regenerated results received:', Object.keys(newResults).length, 'patterns');

            // Merge new results with existing ones, filtering duplicates
            let mergedResults = {};
            if (window.currentResponseData) {
                const patternType = Object.keys(window.currentResponseData.patterns)[0];
                const existingResults = window.currentResponseData.results[patternType];
                const { patterns: allPatterns } = generateTonePatterns(currentInput);

                // Start with existing results
                mergedResults = JSON.parse(JSON.stringify(existingResults));

                // Add new phrases that don't already exist
                Object.keys(newResults).forEach(pattern => {
                    if (!pattern.endsWith('_error') && newResults[pattern]) {
                        if (!mergedResults[pattern]) {
                            mergedResults[pattern] = [];
                        }

                        newResults[pattern].forEach(newPhrase => {
                            if (!existingPhrases.has(newPhrase.phrase)) {
                                mergedResults[pattern].push(newPhrase);
                                console.log(`Adding new phrase: "${newPhrase.phrase}"`);
                            } else {
                                console.log(`Skipping duplicate: "${newPhrase.phrase}"`);
                            }
                        });
                    }
                });
            } else {
                // No existing data, use new results as-is
                mergedResults = newResults;
            }

            const digitMapping = buildDigitMapping(currentInput);
            const { patterns: allPatterns } = generateTonePatterns(currentInput);

            // Build response with merged results
            const responseData = buildResponse(currentInput, digitMapping, allPatterns, mergedResults);

            // Update cache with merged results
            saveToCache(currentInput, responseData);

            // Display merged results
            displayResults(responseData, false); // false = not from cache

            const newPhrasesCount = Object.keys(mergedResults).reduce((count, pattern) => {
                if (!pattern.endsWith('_error')) {
                    return count + (mergedResults[pattern] ? mergedResults[pattern].length : 0);
                }
                return count;
            }, 0) - existingPhrases.size;

            regenerateBtn.textContent = `✓ Added ${newPhrasesCount} new phrases!`;
            setTimeout(() => {
                regenerateBtn.textContent = '🔄 Regenerate';
            }, 3000);

        } catch (error) {
            console.error('Regeneration error:', error);
            let errorMsg = 'An error occurred while regenerating lyrics. ';
            if (error.message.includes('CORS') || error.message.includes('fetch')) {
                errorMsg += 'This might be a CORS issue. Try using a local server or check your network connection.';
            } else if (error.message.includes('API error')) {
                errorMsg += `API Error: ${error.message}`;
            } else {
                errorMsg += `Error: ${error.message}`;
            }
            showError(errorMsg);
            regenerateBtn.textContent = '🔄 Regenerate';
        } finally {
            regenerateBtn.disabled = false;
        }
    }

    // Download updated cache file
    if (downloadCacheBtn) {
        downloadCacheBtn.addEventListener('click', () => {
            const cacheJson = JSON.stringify(lyricsCache, null, 4);
            const blob = new Blob([cacheJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'lyrics-cache.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            downloadCacheBtn.textContent = '✓ Downloaded!';
            setTimeout(() => {
                downloadCacheBtn.textContent = '💾 Download Cache';
            }, 2000);
        });
    }

    // Select All functionality
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.phrase-checkbox');
            const allSelected = Array.from(checkboxes).every(cb => cb.checked);

            checkboxes.forEach(cb => {
                cb.checked = !allSelected;
                const phrase = cb.dataset.phrase;
                if (!allSelected) {
                    window.selectedPhrases.add(phrase);
                } else {
                    window.selectedPhrases.delete(phrase);
                }
            });

            updateSelectedCount();
            selectAllBtn.textContent = allSelected ? '✓ Select All' : '☐ Deselect All';
        });
    }

    // Delete Selected functionality
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            if (window.selectedPhrases.size === 0) {
                alert('No phrases selected');
                return;
            }

            if (!confirm(`Delete ${window.selectedPhrases.size} selected phrase(s)?`)) {
                return;
            }

            if (!window.currentResponseData) {
                console.error('No current response data available');
                return;
            }

            const responseData = window.currentResponseData;
            const patternType = Object.keys(responseData.patterns)[0];
            const results = responseData.results[patternType];

            // Remove all selected phrases from all patterns
            let deleted = false;
            const phrasesToDelete = Array.from(window.selectedPhrases); // Create copy to iterate

            phrasesToDelete.forEach(phraseText => {
                // Find which patterns contain this phrase
                Object.keys(results).forEach(pattern => {
                    if (results[pattern] && Array.isArray(results[pattern])) {
                        const originalLength = results[pattern].length;
                        results[pattern] = results[pattern].filter(phrase => phrase.phrase !== phraseText);
                        if (results[pattern].length < originalLength) {
                            deleted = true;
                        }
                        // Remove empty pattern arrays
                        if (results[pattern].length === 0) {
                            delete results[pattern];
                        }
                    }
                });
            });

            // Clean up empty pattern objects
            const patternKeys = Object.keys(results);
            if (patternKeys.length === 0) {
                // If no patterns left, clean up the entire results structure
                delete responseData.results[patternType];
            }

            if (deleted) {
                // Update cache (both in-memory and localStorage)
                saveToCache(responseData.input, responseData);

                // Store count before clearing
                const deletedCount = window.selectedPhrases.size;

                // Clear selection
                window.selectedPhrases.clear();
                updateSelectedCount();

                // Re-display results
                displayResults(responseData, true);

                console.log(`✓ Deleted ${deletedCount} phrases completely from cache`);
            }
        });
    }
}

// Update selected count display
function updateSelectedCount() {
    if (selectedCountSpan) {
        const count = window.selectedPhrases ? window.selectedPhrases.size : 0;
        selectedCountSpan.textContent = count;

        if (deleteSelectedBtn) {
            deleteSelectedBtn.disabled = count === 0;
        }
    }
}

// Validate input
function validateInput(input) {
    if (!input || input.length < 2 || input.length > 3) {
        return { valid: false, error: 'Input must be 2-3 digits long' };
    }

    if (!/^[0234]+$/.test(input)) {
        return { valid: false, error: 'Invalid input. Please provide 2-3 digits from: 0,2,3,4' };
    }

    return { valid: true };
}

// Generate tone patterns
function generateTonePatterns(input) {
    const digits = input.split('');
    const digitMapping = {};

    // Create mapping for each digit position
    digits.forEach((digit, index) => {
        digitMapping[`${index}`] = TONE_MAPPING[digit];
    });

    // Generate all possible combinations
    const toneArrays = digits.map(digit => TONE_MAPPING[digit]);
    const patterns = cartesianProduct(toneArrays);

    return {
        digitMapping,
        patterns: patterns.map(pattern => pattern.join(' '))
    };
}

// Build digit mapping for response (showing actual digits)
function buildDigitMapping(input) {
    const digits = input.split('');
    const mapping = {};

    digits.forEach((digit, index) => {
        mapping[`${index}`] = TONE_MAPPING[digit];
    });

    return mapping;
}

// Calculate cartesian product of arrays
function cartesianProduct(arrays) {
    return arrays.reduce((acc, curr) => {
        const result = [];
        acc.forEach(accItem => {
            curr.forEach(currItem => {
                result.push([...accItem, currItem]);
            });
        });
        return result;
    }, [[]]);
}

// Generate lyrics using Deepseek API
async function generateLyrics(tonePatterns, inputLength, phraseCount = 3, progressCallback) {
    const patternType = `${inputLength}-tone`;
    const results = {};

    // Create prompt for Deepseek
    const systemPrompt = `You are a Cantonese linguistic analysis engine specializing in accurate Jyutping tone matching. Your sole purpose is to generate Cantonese phrases with PRECISELY correct Jyutping tones that match the specified tone pattern.

CRITICAL REQUIREMENTS:
1. Tone Accuracy: Each character's Jyutping tone MUST match the specified tone pattern EXACTLY. Double-check every tone digit.
2. Verify Against CUHK Lexis: Before generating, you MUST verify the Jyutping using the CUHK Lexis database (https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/). This is the authoritative source for Cantonese Jyutping. Use ONLY tones verified from this database.
3. PRIORITIZE COMMON, WELL-KNOWN PHRASES: Generate phrases that are commonly used in everyday Cantonese. Prefer well-known vocabulary and idioms over obscure or rare phrases.
4. Common Mistakes to Avoid:
   - "現在" is "jin6 zoi6" (tones 6 6), NOT "jin4 zoi4" (tones 4 4) - verify at https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/
   - "現在" should only appear in patterns requiring tones 6 6, never in patterns requiring 4 4
   - Always verify character tones match the pattern before including them
   - If uncertain about any character's tone, consult CUHK Lexis database first
5. If you cannot find a character with the exact required tone, do NOT use it. Find alternatives that match exactly.
6. Double-check each character: Extract the tone digit from Jyutping (the number at the end) and verify it matches the required tone for that position.

VALIDATION PROCESS FOR EACH PHRASE:
Step 1: For each character, extract the tone digit from Jyutping
Step 2: Compare extracted tone with required tone for that position
Step 3: If ANY character's tone doesn't match, reject the phrase
Step 4: Only include phrases where ALL tones match perfectly

For each tone pattern provided:
- Find Chinese characters where Jyutping tones match EXACTLY (verify each tone digit)
- Form grammatically correct, meaningful Cantonese compounds
- PRIORITIZE COMMON, EVERYDAY PHRASES that native speakers would recognize
- Provide ACCURATE Jyutping with tone markers (verify against CUHK Lexis if uncertain)
- Generate the specified number of phrases per pattern (prefer common phrases)
- Only include phrases where ALL tones match perfectly
- Before returning, verify each character's tone digit matches the pattern

Return ONLY valid JSON in this exact format:
{
  "results": {
    "pattern": [
      {
        "phrase": "example phrase",
        "characters": [
          {"char": "字", "jyutping": "zi6"},
          {"char": "符", "jyutping": "fu4"}
        ]
      },
      {
        "phrase": "another phrase",
        "characters": [
          {"char": "詞", "jyutping": "ci4"},
          {"char": "句", "jyutping": "geoi3"}
        ]
      }
    ]
  }
}

Replace "pattern" with the actual tone pattern string (e.g., "1 2 3" or "4 4").

IMPORTANT: Before including any phrase in the response, verify:
1. Each character's Jyutping ends with the correct tone digit
2. The tone pattern matches exactly
3. Use CUHK Lexis database (https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/) as reference for accurate Jyutping`;

    // Process each pattern with progress tracking
    const totalPatterns = tonePatterns.length;
    let processedPatterns = 0;

    for (const pattern of tonePatterns) {
        processedPatterns++;
        console.log(`[${processedPatterns}/${totalPatterns}] Generating lyrics for pattern: ${pattern}`);

        // Call progress callback if provided
        if (progressCallback) {
            progressCallback({ current: processedPatterns, total: totalPatterns });
        }

        const tones = pattern.split(' ');

        // Add pattern-specific examples for common patterns
        let patternExamples = '';
        if (pattern === '4 4') {
            patternExamples = `
EXCELLENT EXAMPLES FOR PATTERN "4 4" (tone 4 tone 4):
- 如何 (jyu4 ho4) - "how"
- 成為 (sing4 wai4) - "become"  
- 原來 (jyun4 loi4) - "originally"
- 從來 (cung4 loi4) - "always/never"
- 任何 (jam4 ho4) - "any"
- 同時 (tung4 si4) - "at the same time"
- 傳統 (cyun4 tung2) - wait, this is wrong (tone 2, not 4)
- 清楚 (cing1 co2) - wait, this is wrong

PREFER generating common phrases like the examples above.`;
        } else if (pattern === '6 6') {
            patternExamples = `
EXCELLENT EXAMPLES FOR PATTERN "6 6" (tone 6 tone 6):
- 現在 (jin6 zoi6) - "now"
- 重要 (zung6 jiu3) - wait, check tone
- Use common everyday phrases with tone 6 6`;
        }

        const userPrompt = `Generate Cantonese lyric phrases for tone pattern: "${pattern}". 

CRITICAL: The tones are: ${tones.map((t, i) => `Position ${i + 1}: tone ${t}`).join(', ')}.

${patternExamples}

MANDATORY VERIFICATION STEPS (repeat for each phrase):
1. VERIFY WITH CUHK LEXIS FIRST: Before including any character, verify its Jyutping at https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/search.php?q=[CHARACTER]. This is the authoritative source.

2. For each character, verify the Jyutping tone digit matches EXACTLY:
   - Position 1: Jyutping MUST end with digit "${tones[0]}" (e.g., if tone ${tones[0]}, use "jin${tones[0]}", "zi${tones[0]}", etc.)
   - ${tones.length > 1 ? tones.slice(1).map((t, i) => `Position ${i + 2}: Jyutping MUST end with digit "${t}"`).join('\n   - ') : ''}

3. BEFORE including any phrase, verify each character:
   - Character 1: Check if Jyutping ends with "${tones[0]}" - VERIFY at CUHK Lexis
   - ${tones.length > 1 ? tones.slice(1).map((t, i) => `Character ${i + 2}: Check if Jyutping ends with "${t}" - VERIFY at CUHK Lexis`).join('\n   - ') : ''}
   
4. PRIORITIZE COMMON, WELL-KNOWN PHRASES that native Cantonese speakers use daily. Prefer phrases like those in the examples above.

5. If ANY character's tone doesn't match, DO NOT include that phrase. Find another phrase where ALL tones match.

6. VERIFICATION CHECKLIST FOR EACH PHRASE:
   ☐ Each character's Jyutping verified against CUHK Lexis database
   ☐ Each character's tone digit matches the required tone for its position
   ☐ Phrase is grammatically correct and meaningful
   ☐ Phrase is commonly used in Cantonese

7. Common mistakes to avoid:
   - "現在" = "jin6 zoi6" (tones 6 6) - ONLY use for pattern "6 6" - verify at CUHK Lexis
   - "現在" ≠ "jin4 zoi4" - NEVER use "jin4 zoi4" for any pattern
   - "係" = "hai6" (tone 6) - ONLY use when pattern requires tone 6
   - Always verify the FINAL DIGIT of Jyutping matches the position requirement
   - When in doubt, consult CUHK Lexis database first

8. Generate ${phraseCount} common phrases where ALL tones match perfectly (prefer well-known vocabulary).

9. Return ONLY valid JSON: {"results": {"${pattern}": [array of phrases]}}
10. Each phrase must have exactly ${tones.length} characters.
11. Each character's Jyutping tone digit must match the pattern position exactly.

EXAMPLE FOR PATTERN "${pattern}":
- Valid: Character 1 Jyutping ends with "${tones[0]}", Character ${tones.length > 1 ? `2 ends with "${tones[1]}"` : 'matches'} - BOTH verified at CUHK Lexis
- Invalid: Any character where Jyutping tone digit doesn't match position requirement

Remember: 
1. Double-check EVERY character's tone digit BEFORE including the phrase
2. Verify uncertain characters at https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/
3. Prefer COMMON, EVERYDAY phrases that native speakers recognize
4. If you're not 100% certain about a tone, DON'T include that phrase`;

        try {
            // Add timeout to API call (30 seconds per pattern)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 2000,
                    top_p: 0.95,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.3
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error?.message || `API error: ${response.status} ${response.statusText}`;
                console.error(`API Error:`, errorMsg);
                throw new Error(errorMsg);
            }

            const data = await response.json();

            // Check for API errors in response
            if (data.error) {
                throw new Error(data.error.message || 'API returned an error');
            }

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid API response format');
            }

            const content = data.choices[0].message.content.trim();
            console.log(`API response for ${pattern}:`, content.substring(0, 200));

            // Extract JSON from response (handle markdown code blocks)
            let jsonStr = content;
            if (content.includes('```json')) {
                jsonStr = content.split('```json')[1].split('```')[0].trim();
            } else if (content.includes('```')) {
                jsonStr = content.split('```')[1].split('```')[0].trim();
            }

            // Try to parse JSON
            let parsed;
            try {
                parsed = JSON.parse(jsonStr);
            } catch (e) {
                // If parsing fails, try to extract JSON object from text
                const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Could not parse JSON from API response');
                }
            }

            // Extract results - handle different response formats
            let extractedPhrases = [];
            if (parsed.results && parsed.results[pattern]) {
                extractedPhrases = parsed.results[pattern];
            } else if (parsed.results && Array.isArray(parsed.results)) {
                extractedPhrases = parsed.results;
            } else if (parsed[pattern]) {
                extractedPhrases = parsed[pattern];
            } else if (Array.isArray(parsed)) {
                extractedPhrases = parsed;
            }

            // Validate tones match the pattern exactly using enhanced verification
            const expectedTones = pattern.split(' ');
            const validatedPhrases = [];
            const invalidPhrases = [];

            // Use local verification
            extractedPhrases.forEach(phrase => {
                const verification = verifyToneAccuracy(phrase, pattern);

                if (verification.valid) {
                    validatedPhrases.push(phrase);
                } else {
                    // Add detailed error information
                    invalidPhrases.push({
                        ...phrase,
                        _invalidReason: verification.errors.join('; '),
                        _actualTones: phrase.characters.map(char => extractTone(char.jyutping || '')),
                        _expectedTones: expectedTones,
                        _verificationErrors: verification.errors
                    });

                    // Log detailed errors
                    console.warn(`⚠️ Phrase "${phrase.phrase}" failed verification:`);
                    verification.errors.forEach(error => console.warn(`   - ${error}`));
                }
            });

            if (invalidPhrases.length > 0) {
                const filteredCount = invalidPhrases.length;
                console.warn(`⚠️ Filtered out ${filteredCount} phrase(s) with incorrect tones for pattern "${pattern}"`);

                // If no valid phrases but we have invalid ones, include them with warnings (so user can see what was attempted)
                if (validatedPhrases.length === 0 && invalidPhrases.length > 0) {
                    console.warn(`⚠️ No valid phrases for pattern "${pattern}". Including invalid ones with warnings for review.`);
                    // Mark them as invalid but include them
                    results[pattern] = invalidPhrases.map(p => ({ ...p, _isInvalid: true }));
                } else {
                    results[pattern] = validatedPhrases;
                }
            } else {
                results[pattern] = validatedPhrases;
            }
        } catch (error) {
            console.error(`Error generating lyrics for pattern ${pattern}:`, error);

            // Handle timeout
            if (error.name === 'AbortError') {
                console.error('API request timed out after 30 seconds');
                results[pattern] = [];
                results[`${pattern}_error`] = 'Request timed out';
            } else {
                // Show error but continue with other patterns
                results[pattern] = [];
                // Store error for display
                results[`${pattern}_error`] = error.message;
            }
        }
    }

    return results;
}

// Build response JSON
function buildResponse(input, digitMapping, patterns, results) {
    const inputLength = input.length;
    const patternType = `${inputLength}-tone`;

    return {
        input: input,
        input_length: inputLength,
        digit_mapping: digitMapping,
        patterns: {
            [patternType]: patterns
        },
        results: {
            [patternType]: results
        }
    };
}

// Extract tone number from jyutping (e.g., "sam1" -> "1", "zi6" -> "6")
function extractTone(jyutping) {
    const match = jyutping.match(/(\d+)$/);
    return match ? match[1] : '';
}

// Verify Jyutping against CUHK Lexis database (attempts to verify, may be limited by CORS)
async function verifyJyutpingWithCUHKLexis(character) {
    // Note: CUHK Lexis doesn't have a public API, so we can't directly verify
    // This function serves as a placeholder for future integration
    // For now, we rely on the AI to verify using the database

    try {
        // Attempt to fetch the CUHK Lexis page (may fail due to CORS)
        const url = `https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/search.php?q=${encodeURIComponent(character)}`;
        const response = await fetch(url, { mode: 'no-cors' });
        // Note: no-cors mode limits what we can read, so this is mainly for reference
        return { verified: false, note: 'CUHK Lexis verification requires manual check' };
    } catch (error) {
        return { verified: false, note: 'CUHK Lexis verification unavailable (CORS limitation)' };
    }
}

// Enhanced tone verification with detailed checking
function verifyToneAccuracy(phrase, expectedPattern) {
    const expectedTones = expectedPattern.split(' ');
    const verification = {
        valid: true,
        errors: [],
        warnings: [],
        verified: true
    };

    if (!phrase || !phrase.characters || !Array.isArray(phrase.characters)) {
        verification.valid = false;
        verification.errors.push('Invalid phrase structure');
        return verification;
    }

    const actualTones = phrase.characters.map((char, idx) => {
        const tone = extractTone(char.jyutping || '');
        if (!tone || tone === '') {
            verification.valid = false;
            verification.errors.push(`Character ${idx + 1} (${char.char}) has missing or invalid Jyutping: "${char.jyutping}"`);
        }
        return tone;
    });

    // Check length
    if (actualTones.length !== expectedTones.length) {
        verification.valid = false;
        verification.errors.push(`Phrase has ${actualTones.length} characters but pattern requires ${expectedTones.length}`);
        return verification;
    }

    // Check each tone
    actualTones.forEach((tone, idx) => {
        const expectedTone = expectedTones[idx];
        const char = phrase.characters[idx];

        if (tone !== expectedTone) {
            verification.valid = false;
            verification.errors.push(
                `Character ${idx + 1} "${char.char}": Jyutping "${char.jyutping}" has tone ${tone}, but pattern requires tone ${expectedTone}. ` +
                `Please verify at https://humanum.arts.cuhk.edu.hk/Lexis/lexi-can/search.php?q=${encodeURIComponent(char.char)}`
            );
        }
    });

    // Add verification note
    if (verification.errors.length > 0) {
        verification.verified = false;
    }

    return verification;
}

// Validate if a phrase's tones match any of the expected patterns
function validatePhraseTones(phrase, expectedPatterns) {
    const phraseTones = phrase.characters.map(char => extractTone(char.jyutping)).join(' ');
    return expectedPatterns.includes(phraseTones);
}

// Display results
function displayResults(responseData, fromCache = false) {
    if (!resultsContainer || !resultsSection || !jsonOutput || !jsonContent) {
        console.error('Display elements not initialized');
        return;
    }

    // Store current response data for deletion operations
    window.currentResponseData = responseData;

    // Show/hide regenerate button based on cache status
    if (regenerateBtn) {
        // Always show regenerate button when results are displayed
        // This allows users to regenerate if they find mistakes
        regenerateBtn.style.display = 'inline-block';
    }

    // Show download cache button when results are displayed
    if (downloadCacheBtn) {
        downloadCacheBtn.style.display = 'inline-block';
    }

    // Show bulk selection buttons
    if (selectAllBtn) {
        selectAllBtn.style.display = 'inline-block';
    }
    if (deleteSelectedBtn) {
        deleteSelectedBtn.style.display = 'inline-block';
    }

    // Reset selected count
    window.selectedPhrases = new Set();
    updateSelectedCount();

    resultsContainer.innerHTML = '';

    const patternType = Object.keys(responseData.patterns)[0];
    const patterns = responseData.patterns[patternType];
    const results = responseData.results[patternType];

    // Display input info
    const infoDiv = document.createElement('div');
    infoDiv.className = 'input-info';
    infoDiv.innerHTML = `
        <h3>Input: <code>${responseData.input}</code></h3>
        <p><strong>Length:</strong> ${responseData.input_length} digits</p>
    `;
    resultsContainer.appendChild(infoDiv);

    // Display patterns
    const patternsDiv = document.createElement('div');
    patternsDiv.className = 'patterns-section';
    patternsDiv.innerHTML = `
        <h3>Tone Patterns (${patterns.length} total)</h3>
        <div class="patterns-list">${patterns.map(p => `<span class="pattern-tag">${p}</span>`).join('')}</div>
    `;
    resultsContainer.appendChild(patternsDiv);

    // Collect all unique phrases (deduplicate by phrase text)
    // Also track which patterns each phrase appears in
    const uniquePhrases = new Map();
    const phraseToPatterns = new Map(); // Track which patterns contain each phrase

    Object.keys(results).forEach(pattern => {
        // Skip error entries
        if (pattern.endsWith('_error')) {
            return;
        }

        const phrases = results[pattern];
        if (!phrases || !Array.isArray(phrases) || phrases.length === 0) {
            return;
        }

        phrases.forEach(phrase => {
            const phraseText = phrase.phrase;
            // Track which patterns contain this phrase
            if (!phraseToPatterns.has(phraseText)) {
                phraseToPatterns.set(phraseText, []);
            }
            phraseToPatterns.get(phraseText).push(pattern);

            // Only add if not already in map (deduplication)
            if (!uniquePhrases.has(phraseText)) {
                uniquePhrases.set(phraseText, phrase);
            }
        });
    });

    // Display unique results as inline boxes
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'lyrics-section';

    // Validate phrases and count invalid ones
    let invalidCount = 0;
    uniquePhrases.forEach((phrase, phraseText) => {
        // Check if phrase is marked as invalid or doesn't match tones
        if (phrase._isInvalid || !validatePhraseTones(phrase, patterns)) {
            invalidCount++;
        }
    });

    const validationStatus = invalidCount > 0
        ? `<span class="validation-badge invalid">⚠️ ${invalidCount} invalid</span>`
        : `<span class="validation-badge valid">✓ All valid</span>`;

    resultsDiv.innerHTML = `<h3>Generated Lyrics <span class="count-badge">${uniquePhrases.size} unique</span> ${validationStatus}</h3>`;

    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'results-grid';

    // Convert Map to array for pagination
    const allPhrases = Array.from(uniquePhrases.entries()).map(([phraseText, phrase]) => ({
        phraseText,
        phrase
    }));

    // Sort phrases: valid ones first, then invalid ones
    allPhrases.sort((a, b) => {
        const aValid = !a.phrase._isInvalid && validatePhraseTones(a.phrase, patterns);
        const bValid = !b.phrase._isInvalid && validatePhraseTones(b.phrase, patterns);
        if (aValid === bValid) return 0;
        return aValid ? -1 : 1;
    });

    // Pagination: show first 20 results
    const RESULTS_PER_PAGE = 20;
    let displayedCount = Math.min(RESULTS_PER_PAGE, allPhrases.length);
    window.currentPhrasesArray = allPhrases;
    window.displayedPhrasesCount = displayedCount;

    // Function to create a phrase box
    function createPhraseBox(phraseText, phrase) {
        const phraseBox = document.createElement('div');
        phraseBox.className = 'phrase-box';
        phraseBox.dataset.phrase = phraseText; // Store phrase text for deletion

        // Build tone pattern string from characters
        const tonePattern = phrase.characters.map(char => extractTone(char.jyutping)).join(' ');
        const jyutpingPattern = phrase.characters.map(char => char.jyutping).join(' ');

        // Validate tones - check both _isInvalid flag and tone matching
        const isInvalidFlag = phrase._isInvalid === true;
        const isValidTones = validatePhraseTones(phrase, patterns);
        const isValid = !isInvalidFlag && isValidTones;

        if (!isValid) {
            phraseBox.classList.add('invalid-tone');
        }

        // Build warning message for invalid phrases
        let warningMessage = '';
        if (isInvalidFlag) {
            const reason = phrase._invalidReason || 'Invalid';
            const expected = phrase._expectedTones ? `Expected: [${phrase._expectedTones.join(' ')}]` : '';
            const actual = phrase._actualTones ? `Actual: [${phrase._actualTones.join(' ')}]` : '';
            warningMessage = `<span class="invalid-indicator">⚠️ ${reason} ${expected} ${actual}</span>`;
        } else if (!isValidTones) {
            warningMessage = '<span class="invalid-indicator">⚠️ Invalid tones</span>';
        }

        phraseBox.innerHTML = `
            <input type="checkbox" class="phrase-checkbox" data-phrase="${phraseText}" ${isValid ? '' : 'checked'}>
            <button class="delete-phrase-btn" title="Delete this phrase" aria-label="Delete ${phraseText}">×</button>
            <div class="phrase-word">${phrase.phrase}</div>
            <div class="phrase-info">
                <span class="tone-badge ${isValid ? '' : 'invalid-tone-badge'}">Tone: ${tonePattern}</span>
                <span class="jyutping-badge">${jyutpingPattern}</span>
                ${warningMessage}
            </div>
        `;

        // Add checkbox event listener
        const checkbox = phraseBox.querySelector('.phrase-checkbox');
        checkbox.addEventListener('change', (e) => {
            const phrase = e.target.dataset.phrase;
            if (e.target.checked) {
                window.selectedPhrases.add(phrase);
            } else {
                window.selectedPhrases.delete(phrase);
            }
            updateSelectedCount();
        });

        // Auto-select invalid phrases
        if (!isValid) {
            checkbox.checked = true;
            window.selectedPhrases.add(phraseText);
            updateSelectedCount();
        }

        // Add delete button event listener
        const deleteBtn = phraseBox.querySelector('.delete-phrase-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePhrase(phraseText, phraseToPatterns.get(phraseText));
        });

        return phraseBox;
    }

    // Display first batch of phrases
    for (let i = 0; i < displayedCount; i++) {
        const { phraseText, phrase } = allPhrases[i];
        const phraseBox = createPhraseBox(phraseText, phrase);
        resultsGrid.appendChild(phraseBox);
    }

    resultsDiv.appendChild(resultsGrid);

    // Add "Load More" button if there are more results
    if (allPhrases.length > displayedCount) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'load-more-btn';
        loadMoreBtn.textContent = `Load More (${allPhrases.length - displayedCount} remaining)`;
        loadMoreBtn.addEventListener('click', () => {
            const remaining = allPhrases.length - window.displayedPhrasesCount;
            const toShow = Math.min(RESULTS_PER_PAGE, remaining);

            for (let i = window.displayedPhrasesCount; i < window.displayedPhrasesCount + toShow; i++) {
                const { phraseText, phrase } = allPhrases[i];
                const phraseBox = createPhraseBox(phraseText, phrase);
                resultsGrid.appendChild(phraseBox);
            }

            window.displayedPhrasesCount += toShow;

            // Update button text or remove if all shown
            if (window.displayedPhrasesCount >= allPhrases.length) {
                loadMoreBtn.remove();
            } else {
                loadMoreBtn.textContent = `Load More (${allPhrases.length - window.displayedPhrasesCount} remaining)`;
            }
        });

        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'load-more-container';
        loadMoreContainer.style.textAlign = 'center';
        loadMoreContainer.style.marginTop = '20px';
        loadMoreContainer.appendChild(loadMoreBtn);
        resultsDiv.appendChild(loadMoreContainer);
    }

    resultsContainer.appendChild(resultsDiv);

    // Display JSON (collapsed by default)
    jsonContent.textContent = JSON.stringify(responseData, null, 2);

    resultsSection.style.display = 'block';
    jsonOutput.style.display = 'block';

    // Ensure JSON is collapsed by default
    if (jsonOutput && !jsonOutput.classList.contains('collapsed')) {
        jsonOutput.classList.add('collapsed');
    }

    // Reset view JSON button text
    if (viewJsonBtn) {
        viewJsonBtn.textContent = 'View JSON';
    }

    // Reset regenerate button text
    if (regenerateBtn) {
        regenerateBtn.textContent = '🔄 Regenerate';
        regenerateBtn.disabled = false;
    }
}

// Delete a phrase from the cache
function deletePhrase(phraseText, patterns) {
    if (!confirm(`Delete "${phraseText}" from all patterns?`)) {
        return;
    }

    if (!window.currentResponseData) {
        console.error('No current response data available');
        return;
    }

    const responseData = window.currentResponseData;
    const patternType = Object.keys(responseData.patterns)[0];
    const results = responseData.results[patternType];

    // Remove phrase from selectedPhrases if it was selected
    if (window.selectedPhrases && window.selectedPhrases.has(phraseText)) {
        window.selectedPhrases.delete(phraseText);
        updateSelectedCount();
    }

    // Remove phrase from all patterns where it appears
    let deleted = false;
    patterns.forEach(pattern => {
        if (results[pattern] && Array.isArray(results[pattern])) {
            const originalLength = results[pattern].length;
            results[pattern] = results[pattern].filter(phrase => phrase.phrase !== phraseText);
            if (results[pattern].length < originalLength) {
                deleted = true;
            }
            // Remove empty pattern arrays
            if (results[pattern].length === 0) {
                delete results[pattern];
            }
        }
    });

    // Clean up empty pattern objects
    const patternKeys = Object.keys(results);
    if (patternKeys.length === 0) {
        // If no patterns left, clean up the entire results structure
        delete responseData.results[patternType];
    }

    if (deleted) {
        // Update cache (both in-memory and localStorage)
        saveToCache(responseData.input, responseData);

        // Re-display results
        displayResults(responseData, true);

        console.log(`✓ Deleted "${phraseText}" completely from cache`);
    } else {
        console.warn(`Phrase "${phraseText}" not found in cache`);
    }
}

// Show error
function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }
    if (jsonOutput) {
        jsonOutput.style.display = 'none';
    }
    // Hide regenerate button when error occurs
    if (regenerateBtn) {
        regenerateBtn.style.display = 'none';
    }
    // Hide download cache button when error occurs
    if (downloadCacheBtn) {
        downloadCacheBtn.style.display = 'none';
    }
    // Hide bulk selection buttons when error occurs
    if (selectAllBtn) {
        selectAllBtn.style.display = 'none';
    }
    if (deleteSelectedBtn) {
        deleteSelectedBtn.style.display = 'none';
    }
    // Also log to console
    console.error(message);
}

// Hide error
function hideError() {
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

