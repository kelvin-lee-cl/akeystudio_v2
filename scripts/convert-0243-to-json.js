/**
 * Convert 0243.txt -> 0243.json for easier client-side lookup.
 *
 * Output format:
 * {
 *   "00": ["word1", "word2", ...],
 *   "02": [...],
 *   ...
 * }
 *
 * Notes:
 * - Only include canonical pattern keys where both digits are in [0,2,3,4].
 * - Parsing logic mirrors the existing client parser in app.js.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const INPUT_TXT = path.join(PROJECT_ROOT, '0243.txt');
const OUTPUT_JSON = path.join(PROJECT_ROOT, '0243.json');

const CANONICAL_DIGITS = new Set(['0', '2', '3', '4']);
const isCanonicalKey = (key) => typeof key === 'string' && /^[0-9]{2}$/.test(key) && CANONICAL_DIGITS.has(key[0]) && CANONICAL_DIGITS.has(key[1]);

function stripBOM(str) {
    if (str && str.charCodeAt(0) === 0xFEFF) return str.slice(1);
    return str;
}

function parseWordsLine(wordsLine) {
    return wordsLine
        ? String(wordsLine)
            .split(/[、，]/)
            .map((w) => w.trim())
            .filter(Boolean)
        : [];
}

function convert() {
    let text = fs.readFileSync(INPUT_TXT, 'utf8');
    text = stripBOM(text);

    const lines = text.split(/\r?\n/);
    const out = {};

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.replace(/\r$/, '').trim();

        // Pattern only: "00" (words are on the next non-divider line)
        const matchOnly = line.match(/^(\d{2})\s*$/);
        // Pattern + words on same line: "00  詞、語、..."
        const matchWithWords = line.match(/^(\d{2})\s+([\s\S]+)$/);

        const pat = matchOnly ? matchOnly[1] : (matchWithWords ? matchWithWords[1] : null);
        if (!pat) continue;
        if (!isCanonicalKey(pat)) continue;

        let wordsLine = '';
        if (matchWithWords && matchWithWords[2].trim()) {
            wordsLine = matchWithWords[2].trim();
        } else {
            // Words are on next meaningful line(s)
            for (let j = i + 1; j < lines.length; j++) {
                const next = lines[j].replace(/\r$/, '').trim();

                // skip separators/empty and skip other pattern headers
                if (!next) continue;
                if (/^_+$/.test(next)) continue;
                if (/^\d{2}\s*$/.test(next)) continue;

                wordsLine = next;
                break;
            }
        }

        out[pat] = parseWordsLine(wordsLine);
    }

    // Sort keys for stable diffs (optional but nice).
    const sorted = {};
    Object.keys(out)
        .sort()
        .forEach((k) => {
            sorted[k] = out[k];
        });

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(sorted, null, 2), 'utf8');

    console.log('Created:', path.basename(OUTPUT_JSON));
    console.log('Canonical keys:', Object.keys(sorted).length);
    const sampleKey = Object.keys(sorted)[0];
    if (sampleKey) console.log('Sample:', sampleKey, 'count=', sorted[sampleKey].length);
}

convert();

