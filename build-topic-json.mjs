/**
 * One-off: parse topic.txt → topic.json
 * Rules: lines of underscores separate sections; first non-empty line of a section is the term (trimmed);
 *        body is split on whitespace; every phrase is two words: each pair becomes two separate strings
 *        in the array (e.g. 真摯 深刻 → "真摯", "深刻").
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, 'topic.txt');
const out = path.join(__dirname, 'topic.json');

const raw = fs.readFileSync(src, 'utf8');
const lines = raw.split(/\r?\n/);

function isSeparator(line) {
    const t = line.trim();
    return t.length > 0 && /^_+$/.test(t);
}

/** Each phrase is exactly two whitespace tokens; output is flat [w1, w2, w3, w4, …]. */
function expandTwoWordPhrases(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i += 2) {
        if (i + 1 < tokens.length) {
            out.push(tokens[i], tokens[i + 1]);
        } else {
            out.push(tokens[i]);
        }
    }
    return out;
}

let currentTitle = null;
const contentLines = [];
const order = [];
const topics = {};

function flush() {
    if (!currentTitle) return;
    const text = contentLines.join(' ');
    const tokens = text.split(/\s+/).filter(Boolean);
    topics[currentTitle] = expandTwoWordPhrases(tokens);
    order.push(currentTitle);
    currentTitle = null;
    contentLines.length = 0;
}

for (const line of lines) {
    if (isSeparator(line)) {
        flush();
        continue;
    }
    const t = line.trim();
    if (!t.length) continue;
    if (currentTitle === null) {
        currentTitle = t;
    } else {
        contentLines.push(t);
    }
}
flush();

const payload = { topicOrder: order };
for (const k of order) {
    payload[k] = topics[k];
}

fs.writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');
console.log('Wrote', out, 'topics:', order.length);
