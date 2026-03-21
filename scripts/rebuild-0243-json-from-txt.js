#!/usr/bin/env node
/**
 * Rebuild 0243.json from 0243.txt (source of truth).
 * Skips "Same as ##" lines but still reads the vocabulary line for each set.
 * Skips blank lines and zero-width-space-only lines before the vocabulary line.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const txtPath = path.join(root, "0243.txt");
const jsonPath = path.join(root, "0243.json");

const t = fs.readFileSync(txtPath, "utf8").replace(/^\uFEFF/, "");
const lines = t.split(/\r?\n/);

function isEmptyLine(L) {
  if (!L) return true;
  return L.replace(/\u200b/g, "").trim().length === 0;
}

function tokenize(content) {
  if (!content || !content.trim()) return [];
  let s = content.trim().replace(/\u200b/g, "");
  s = s.replace(/，/g, "、");
  if (!s.includes("、") && /\s/.test(s)) {
    return s.split(/\s+/).filter(Boolean);
  }
  return s.split(/\s*、\s*/).filter(Boolean);
}

let i = 0;
const data = {};
while (i < lines.length) {
  const L = lines[i].trim();
  if (!L) {
    i++;
    continue;
  }
  if (!/^\d{2}\s*$/.test(L)) {
    i++;
    continue;
  }
  const id = L.trim();
  i++;
  if (i < lines.length && /^Same as/i.test(lines[i].trim())) {
    i++;
  }
  while (i < lines.length && isEmptyLine(lines[i])) i++;
  const content = lines[i] || "";
  data[id] = tokenize(content);
  i++;
}

const keyOrder = [
  "20",
  "22",
  "23",
  "24",
  "30",
  "32",
  "33",
  "34",
  "40",
  "42",
  "43",
  "44",
  "00",
  "02",
  "03",
  "04",
];

const ordered = {};
for (const k of keyOrder) {
  if (!data[k]) {
    console.error("Missing section", k);
    process.exit(1);
  }
  ordered[k] = data[k];
}

fs.writeFileSync(jsonPath, JSON.stringify(ordered, null, 2) + "\n", "utf8");
console.log("Wrote", jsonPath);
for (const k of keyOrder) {
  console.log(k, ordered[k].length);
}
