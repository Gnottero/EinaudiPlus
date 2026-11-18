// Permessi: la matrice ruolo → permessi (identity/domain/permissions.js).
//
// v2.0 — i ruoli sono quattro: superadmin, admin (una sezione), fdo, delegato.
// La tabella qui sotto era quella ricavata dalle vecchie policy (v1.x), gia'
// tradotta: `sistemista` -> `admin`, `staff` sparito (in migrazione diventa
// `fdo`, che guadagna le funzioni di portineria: DICHIARATO in DEPLOY.md).
// Per fdo e delegato la tabella e' identica a prima; per l'admin e' quella
// del vecchio sistemista, piu' (in data.js) i limiti di sezione.
//
// Nessuna rete: solo funzioni pure.

import { authorize as laundry } from "../../src/modules/laundry/index.js";
import { authorize as ops } from "../../src/modules/ops/index.js";
import { authorize as bikes } from "../../src/modules/bikes/index.js";
import { authorize as spaces } from "../../src/modules/common-spaces/index.js";
import { authorize as conference } from "../../src/modules/conference-room/index.js";
import { authorize as feedback } from "../../src/modules/feedback/index.js";
import { authorize as grigliata } from "../../src/modules/grigliata/index.js";
import { authorize as linen } from "../../src/modules/linen-change/index.js";
import { authorize as notifications } from "../../src/modules/notifications/index.js";
import { authorize as theme } from "../../src/modules/theme/index.js";
import { authorize as identity, can, PERMESSI, RUOLI_PERMESSI, makeAuthorize, isGlobalScope, sectionAllowed } from "../../src/modules/identity/index.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FALLA " + name + " " + detail); }
};

const MODULI = [laundry, ops, bikes, spaces, conference, feedback, grigliata, linen, notifications, theme];
const decide = (claims, action) => { for (const m of MODULI) { const r = m(claims, action); if (r !== null) return r; } return undefined; };

// azione -> ruoli che la ottenevano TABELLA (fdo staff sistemista delegato) — qui gia' tradotta: staff sparito, sistemista -> admin
const TABELLA = {
  week: "fdo admin",
  bookDirezione: "fdo admin",
  setMachineStatus: "fdo admin",
  recurringAddLaundry: "admin",
  overview: "fdo admin",
  recurringList: "admin",
  applyRecurring: "admin",
  biciList: "fdo admin",
  biciPurge: "admin",
  spaces: "fdo admin",
  spaceSetChiuso: "fdo admin",
  recurringAddSpace: "admin",
  conferenzaList: "fdo admin",
  conferenzaSkip: "fdo admin",
  conferenzaResetOccorrenza: "fdo admin",
  feedback: "fdo admin",
  grigliataCrea: "admin delegato",
  grigliataOverview: "admin delegato",
  grigliataConfermaPagamento: "admin delegato",
  grigliataAnnullaConfermaPagamento: "admin delegato",
  grigliataChiudi: "admin delegato",
  grigliataModifica: "admin delegato",
  grigliataAggiungiAdesione: "admin delegato",
  grigliataRimuoviAdesione: "admin delegato",
  grigliataRiapri: "admin delegato",
  grigliataElimina: "admin delegato",
  grigliataPagamenti: "admin delegato",
  grigliataQuota: "admin delegato",
  grigliataRipristinaTicket: "admin delegato",
  cambioBiancheriaGet: "fdo admin",
  pushSubs: "admin",
  telegramSubs: "admin",
  broadcastPush: "admin",
  temaGet: "admin",
};

console.log("── stessa tabella di prima, per i 4 ruoli storici ──");
let ok = 0, tot = 0;
for (const [azione, ruoli] of Object.entries(TABELLA)) {
  const attesi = new Set(ruoli.split(" ").filter(Boolean));
  for (const r of ["fdo", "admin", "delegato"]) {
    tot++;
    const got = decide({ r }, azione);
    if (got === attesi.has(r)) ok++; else console.log("  DIFF", azione, r, "atteso", attesi.has(r), "ottenuto", got);
  }
}
check(`${tot} decisioni come da tabella (${Object.keys(TABELLA).length} azioni × 3 ruoli)`, ok === tot, `${ok}/${tot}`);

console.log("\n── senza sessione ──");
check("nessuna azione e' concessa senza claims", Object.keys(TABELLA).every((a) => decide(null, a) === false));
check("azione sconosciuta: nessun modulo la reclama", decide({ r: "sistemista" }, "nonEsiste") === undefined);

console.log("\n── superadmin ──");
check("superadmin ha ogni azione dei moduli", Object.keys(TABELLA).every((a) => decide({ r: "superadmin" }, a) === true));
check("superadmin gestisce gli account", identity({ r: "superadmin" }, "accountCreate") === true);
check("admin gestisce gli account (di sezione: lo verifica data.js)", identity({ r: "admin" }, "accountCreate") === true);
check("fdo no", identity({ r: "fdo" }, "accountCreate") === false);
check("delegato no", identity({ r: "delegato" }, "accountSetSection") === false);
check("la propria password: qualunque sessione", identity({ r: "fdo" }, "accountChangeOwnPassword") === true);
check("il ruolo `staff` non esiste piu': nessun permesso", Object.keys(TABELLA).every((a) => decide({ r: "staff" }, a) === false) && !can({ r: "staff" }, PERMESSI.LAUNDRY_OPERATE));
check("il ruolo `sistemista` non esiste piu': nessun permesso", Object.keys(TABELLA).every((a) => decide({ r: "sistemista" }, a) === false));

console.log("\n── default negato ──");
check("ruolo sconosciuto: nessun permesso", Object.values(PERMESSI).every((p) => can({ r: "ospite" }, p) === false));
check("claims senza ruolo: nessun permesso", can({}, PERMESSI.LAUNDRY_OPERATE) === false && can(null, PERMESSI.LAUNDRY_OPERATE) === false);
check("delegato ha un solo permesso", [...RUOLI_PERMESSI.delegato].join() === PERMESSI.GRIGLIATA_MANAGE);
check("solo il superadmin ha sections.manage", ["fdo", "admin", "delegato"].every((r) => !can({ r }, PERMESSI.SECTIONS_MANAGE)) && can({ r: "superadmin" }, PERMESSI.SECTIONS_MANAGE));
check("l'admin configura la propria sezione", can({ r: "admin" }, PERMESSI.SECTIONS_CONFIGURE) && !can({ r: "fdo" }, PERMESSI.SECTIONS_CONFIGURE));
const az = makeAuthorize({ prova: PERMESSI.THEME_MANAGE });
check("makeAuthorize: null / false / true", az({ r: "fdo" }, "altra") === null && az(null, "prova") === false && az({ r: "fdo" }, "prova") === false && az({ r: "admin" }, "prova") === true);

console.log("\n── ruoli e sezione ──");
check("RUOLI_PERMESSI ha esattamente i 4 ruoli", Object.keys(RUOLI_PERMESSI).sort().join() === "admin,delegato,fdo,superadmin");
check("solo il superadmin e' globale", isGlobalScope("superadmin") && !isGlobalScope("admin") && !isGlobalScope("fdo") && !isGlobalScope("delegato"));
check("un account sta nella propria sezione", sectionAllowed("admin", 3, 3));
check("... e non in un'altra", !sectionAllowed("fdo", 3, 2));
check("senza sezione (riga rovinata): niente", !sectionAllowed("admin", null, 1) && !sectionAllowed("admin", undefined, 1));
check("il superadmin: qualunque sezione", sectionAllowed("superadmin", null, 99));
check("admin = fdo + gestione (sottoinsieme proprio)", [...RUOLI_PERMESSI.fdo].every((p) => RUOLI_PERMESSI.admin.has(p)) && RUOLI_PERMESSI.admin.size > RUOLI_PERMESSI.fdo.size);
check("l'admin non ha sections.manage ne' ha permessi inventati", !RUOLI_PERMESSI.admin.has(PERMESSI.SECTIONS_MANAGE) && [...RUOLI_PERMESSI.admin].every((p) => Object.values(PERMESSI).includes(p)));

console.log(`\nPASSATI: ${pass}   FALLITI: ${fail}`);
process.exit(fail ? 1 : 0);
