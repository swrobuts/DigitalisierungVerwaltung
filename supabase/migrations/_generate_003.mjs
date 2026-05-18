#!/usr/bin/env node
// Generiert 003_seed_translations.sql aus ue1/webformular/src/translations.ts via Regex-Parsing.
// Aufruf: node supabase/migrations/_generate_003.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsFile = resolve(here, "../../ue1/webformular/src/translations.ts");
const outFile = resolve(here, "003_seed_translations.sql");

const src = readFileSync(tsFile, "utf-8");

// Finde alle Sprachblöcke: de: { ... }, it: { ... }, tr: { ... }, es: { ... }
const langs = ["de", "it", "tr", "es"];
const data = {};
for (const lang of langs) {
  const re = new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`Sprachblock ${lang} nicht gefunden`);
  const body = m[1];
  // Parse key-value pairs: "key": "value",
  const pairRe = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const pairs = {};
  let pm;
  while ((pm = pairRe.exec(body)) !== null) {
    pairs[pm[1]] = pm[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  data[lang] = pairs;
}

// Vereinheitliche Keys (sollten überall identisch sein)
const deKeys = Object.keys(data.de);
for (const lang of langs) {
  if (Object.keys(data[lang]).length !== deKeys.length) {
    console.warn(`Sprache ${lang}: ${Object.keys(data[lang]).length} Keys (vs DE: ${deKeys.length})`);
  }
}

const sqlEscape = (s) => "'" + s.replace(/'/g, "''") + "'";
const date = new Date().toISOString().slice(0, 10);

const rows = [];
for (const lang of langs) {
  for (const key of deKeys) {
    const value = data[lang][key];
    if (value === undefined) {
      console.warn(`MISSING ${lang}.${key} — überspringe`);
      continue;
    }
    rows.push(`  (${sqlEscape(key)}, '${lang}', ${sqlEscape(value)})`);
  }
}

const sql = [
  `-- 003_seed_translations.sql — Seed aus ue1/webformular/src/translations.ts (Stand: ${date})`,
  `-- Auto-generiert mit supabase/migrations/_generate_003.mjs`,
  ``,
  `insert into apl2.form_translations (key, language, value) values`,
  rows.join(",\n"),
  `on conflict (key, language) do update set`,
  `  value = excluded.value,`,
  `  updated_at = now();`,
  ``,
].join("\n");

writeFileSync(outFile, sql);
console.log(`Wrote ${outFile} with ${rows.length} rows (${deKeys.length} keys × ${langs.length} langs)`);
