// Controllo delle chiavi di traduzione: ogni chiave di lingue/it.ts deve
// essere usata da qualche parte nel codice (altrimenti e' una stringa morta
// da tradurre e mantenere in cinque lingue per niente). Che le altre lingue
// abbiano le stesse chiavi dell'italiano lo garantisce gia' `tsc`.
//
// Le chiavi scelte dinamicamente (T[lang][chiave] con `chiave` letterale in
// una tabella) contano come usate: basta che il nome compaia come stringa o
// identificatore in un file fuori da lingue/.

import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${detail}`); }
};

const SKIP = new Set(["node_modules", ".git", "dist", "lingue", "refactor-enterprise", "tests"]);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  SKIP.has(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const code = walk(".").filter((f) => /\.(tsx?|js)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");

const it = fs.readFileSync("lingue/it.ts", "utf8");
const keys = [...it.matchAll(/^\s+([A-Za-z0-9_]+)\s*:/gm)].map((m) => m[1]);
const unused = [...new Set(keys)].filter((k) => !new RegExp(`\\b${k}\\b`).test(code));

console.log("── chiavi di traduzione ──");
check("ci sono chiavi", keys.length > 100, String(keys.length));
check("nessuna chiave inutilizzata", unused.length === 0, unused.join(", "));

console.log(`\nPASSATI: ${passed}   FALLITI: ${failed}`);
process.exit(failed ? 1 : 0);
