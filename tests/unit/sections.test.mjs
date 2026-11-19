// Modulo Sections: risoluzione delle camere, funzionalita' per sezione,
// validazione dei dati amministrativi. Nessuna rete: repository finto.

import { resolveRoom, sectionIdsOfLaundry } from "../../src/modules/sections/domain/config.js";
import { isFeatureEnabled, FEATURES } from "../../src/modules/sections/domain/features.js";
import { assertRoomAllowed } from "../../src/modules/sections/application/assertRoom.js";
import {
  adminCreateSection, adminUpdateSection, adminSetRanges, adminCreateLaundry, adminUpdateLaundry,
  parseRanges, parseFeatures,
} from "../../src/modules/sections/application/adminSections.js";
import { authorize } from "../../src/modules/sections/domain/policy.js";
import { scopeDecision, filterByScope, REGOLE } from "../../src/modules/sections/domain/scope.js";
import { resourceSection, sampleRoomForLaundry, sectionIdOfRange } from "../../src/modules/sections/domain/config.js";
import { isShareable } from "../../src/modules/sections/domain/features.js";
import { checkResourceActors } from "../../src/modules/sections/application/resourceActors.js";
import { resolveResourceSection } from "../../src/modules/sections/application/resolveResource.js";
import { adminSetSharing, adminSetRangeStyle, parseSharing, parseColor } from "../../src/modules/sections/application/adminSections.js";
import { parseRoomNumber, sectionCodeOf, roomDigits } from "../../src/shared/validation/room.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FALLA " + name + " " + detail); }
};
const section = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);
const throws = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const CONFIG = {
  ok: true,
  laundries: [{ id: 1, slug: "valentino", name: "Valentino", pairs: 3 }, { id: 2, slug: "manica", name: "Manica", pairs: 1 }, { id: 3, slug: "po-mole", name: "Po-Mole", pairs: 2 }],
  sections: [
    { id: 1, code: "V", number: 1, name: "Valentino", active: true, features: {},
      ranges: [{ id: 11, label: "Manica", from: 1, to: 50, laundry_id: 2, color: "#f97316" }, { id: 12, label: "Valentino", from: 101, to: 136, laundry_id: 1, color: null }] },
    { id: 2, code: "P", number: 2, name: "Po", active: true, features: { conference: false, grigliata: false },
      ranges: [{ id: 21, label: "Po", from: 1, to: 40, laundry_id: 3 }] },
    { id: 3, code: "M", number: 3, name: "Mole", active: true, features: {}, shared_with: { conference: 1, theme: 1 },
      ranges: [{ id: 31, label: "Mole", from: 1, to: 30, laundry_id: 3 }] },
    { id: 4, code: "X", number: 4, name: "Chiusa", active: false, features: {},
      ranges: [{ label: "X", from: 1, to: 10, laundry_id: null }] },
  ],
};
const getConfig = async () => CONFIG;

section("parseRoomNumber() — sintassi con lettera di sezione");
check("V112", parseRoomNumber("V112") === "V112");
check("minuscola -> maiuscola", parseRoomNumber("v112") === "V112");
check("suffisso", parseRoomNumber(" p21-b ") === "P21-b");
check("senza lettera respinta (hard cut)", parseRoomNumber("112") === null);
check("tre lettere respinte", parseRoomNumber("ABC12") === null);
check("DIREZIONE non e' una camera", parseRoomNumber("DIREZIONE") === null);
check("vuota/null", parseRoomNumber("") === null && parseRoomNumber(null) === null);
check("sectionCodeOf / roomDigits", sectionCodeOf("m7a") === "M" && roomDigits("V021") === 21);

section("resolveRoom()");
check("V21 -> sezione V, intervallo Manica, lavanderia 2", (() => { const r = resolveRoom(CONFIG, "V21"); return r?.section.code === "V" && r.range.label === "Manica" && r.laundryId === 2; })());
check("V112 -> lavanderia 1", resolveRoom(CONFIG, "V112")?.laundryId === 1);
check("V100 fuori intervallo", resolveRoom(CONFIG, "V100") === null);
check("sezione inesistente", resolveRoom(CONFIG, "Z5") === null);
check("sezione disattivata", resolveRoom(CONFIG, "X5") === null);
check("P5 e M5: stessa lavanderia (condivisa)", resolveRoom(CONFIG, "P5").laundryId === resolveRoom(CONFIG, "M5").laundryId);
check("sezioni che usano la lavanderia 3", JSON.stringify(sectionIdsOfLaundry(CONFIG, 3)) === "[2,3]");
check("camera con suffisso", resolveRoom(CONFIG, "P21-b")?.section.code === "P");

section("assertRoomAllowed()");
const deps = { getConfig };
check("camera valida passa", (await assertRoomAllowed({ room: "V112", feature: "laundry" }, deps))?.section.code === "V");
check("funzione spenta -> 403", (await throws(() => assertRoomAllowed({ room: "P5", feature: "conference" }, deps)))?.status === 403);
check("la stessa funzione resta accesa per V", (await assertRoomAllowed({ room: "V5", feature: "conference" }, deps)) !== null);
check("grigliata spenta per P", (await throws(() => assertRoomAllowed({ room: "P5", feature: "grigliata" }, deps)))?.status === 403);
check("camera inesistente -> 400", (await throws(() => assertRoomAllowed({ room: "V100", feature: "laundry" }, deps)))?.status === 400);
check("camera senza lettera -> 400", (await throws(() => assertRoomAllowed({ room: "112" }, deps)))?.status === 400);
check("vuota con required -> 400", (await throws(() => assertRoomAllowed({ room: "" }, deps)))?.status === 400);
check("vuota senza required passa", (await assertRoomAllowed({ room: "", required: false }, deps)) === null);
check("DIREZIONE passa senza sezione", (await assertRoomAllowed({ room: "DIREZIONE", feature: "laundry" }, deps)) === null);
check("funzionalita' sconosciuta e' un bug, non un 403", (await throws(() => assertRoomAllowed({ room: "V5", feature: "inesistente" }, deps)))?.status === undefined);
check("ogni FEATURE e' accesa di default", FEATURES.every((f) => isFeatureEnabled({ features: {} }, f)));
check("false esplicito spegne", !isFeatureEnabled({ features: { bikes: false } }, "bikes"));
check("null non spegne", isFeatureEnabled({ features: { bikes: null } }, "bikes"));

section("parseFeatures() / parseRanges()");
check("chiave sconosciuta respinta", (() => { try { parseFeatures({ pippo: true }); return false; } catch { return true; } })());
check("valore non booleano respinto", (() => { try { parseFeatures({ laundry: "no" }); return false; } catch { return true; } })());
check("oggetto vuoto ok", Object.keys(parseFeatures({})).length === 0 && Object.keys(parseFeatures(null)).length === 0);
check("intervalli validi normalizzati", (() => { const r = parseRanges([{ label: " A ", from: "1", to: 10, laundryId: "3" }]); return r[0].label === "A" && r[0].from === 1 && r[0].laundry_id === 3; })());
check("sovrapposti respinti", (() => { try { parseRanges([{ label: "a", from: 1, to: 10 }, { label: "b", from: 10, to: 20 }]); return false; } catch (e) { return /sovrapposti/.test(e.message); } })());
check("adiacenti ammessi", parseRanges([{ label: "a", from: 1, to: 10 }, { label: "b", from: 11, to: 20 }]).length === 2);
check("fine < inizio respinta", (() => { try { parseRanges([{ label: "a", from: 10, to: 1 }]); return false; } catch { return true; } })());
check("numero fuori 1-9999 respinto", (() => { try { parseRanges([{ label: "a", from: 0, to: 5 }]); return false; } catch { return true; } })());
check("non array respinto", (() => { try { parseRanges("x"); return false; } catch { return true; } })());

section("use-case amministrativi");
const calls = [];
let invalidated = 0;
const repo = new Proxy({}, { get: (_, name) => async (args) => { calls.push({ name, args }); return { ok: true }; } });
const adm = { sectionsRepository: repo, invalidate: () => { invalidated++; } };
await adminCreateSection({ code: "p", number: "2", name: " Po ", features: { conference: false }, ranges: [{ label: "Po", from: 1, to: 40, laundryId: 3 }] }, adm);
check("crea sezione: lettera maiuscola, numero intero, nome ripulito", calls[0].name === "createSection" && calls[0].args.code === "P" && calls[0].args.number === 2 && calls[0].args.name === "Po");
check("la cache si svuota dopo la scrittura", invalidated === 1);
check("lettera non valida respinta", (await throws(() => adminCreateSection({ code: "P1", number: 2, name: "x" }, adm))) !== null);
check("tre lettere respinte", (await throws(() => adminCreateSection({ code: "PPP", number: 2, name: "x" }, adm))) !== null);
check("numero sezione fuori range", (await throws(() => adminCreateSection({ code: "P", number: 0, name: "x" }, adm))) !== null);
check("nome vuoto respinto", (await throws(() => adminCreateSection({ code: "P", number: 2, name: "  " }, adm))) !== null);
await adminUpdateSection({ id: "2", features: { bikes: false } }, adm);
check("update: i campi non dati restano null (non toccati)", calls.at(-1).args.name === null && calls.at(-1).args.active === null && calls.at(-1).args.features.bikes === false);
check("update: id non valido", (await throws(() => adminUpdateSection({ id: "x" }, adm))) !== null);
await adminSetRanges({ id: 1, ranges: [{ label: "A", from: 1, to: 5 }] }, adm);
check("setRanges passa gli intervalli validati", calls.at(-1).name === "setRanges" && calls.at(-1).args.ranges[0].to === 5);
await adminCreateLaundry({ slug: "Po-Mole", name: "Lavanderia", pairs: 2 }, adm);
check("crea lavanderia: slug minuscolo", calls.at(-1).args.slug === "po-mole" && calls.at(-1).args.pairs === 2);
check("coppie 0 respinte", (await throws(() => adminCreateLaundry({ slug: "ab", name: "x", pairs: 0 }, adm))) !== null);
check("coppie 9 respinte", (await throws(() => adminCreateLaundry({ slug: "ab", name: "x", pairs: 9 }, adm))) !== null);
await adminCreateLaundry({ slug: "ab", name: "x", pairs: 8 }, adm);
check("8 coppie accettate", calls.at(-1).args.pairs === 8);
check("slug con spazi respinto", (await throws(() => adminCreateLaundry({ slug: "a b", name: "x", pairs: 1 }, adm))) !== null);
await adminUpdateLaundry({ id: 3, pairs: 3 }, adm);
check("update lavanderia: nome non dato = null", calls.at(-1).args.name === null && calls.at(-1).args.pairs === 3);

section("authorize()");
check("solo il superadmin crea sezioni", authorize({ r: "superadmin" }, "sectionCreate") === true && authorize({ r: "admin" }, "sectionCreate") === false);
check("solo il superadmin cambia gli intervalli e crea lavanderie", authorize({ r: "admin" }, "sectionSetRanges") === false && authorize({ r: "admin" }, "laundryCreate") === false);
check("l'admin modifica funzioni, condivisioni e colori", ["sectionUpdate", "sectionSetSharing", "sectionSetRangeStyle", "laundryUpdate"].every((a) => authorize({ r: "admin" }, a) === true));
check("fdo e delegato no", ["sectionUpdate", "sectionSetSharing", "sectionSetRangeStyle", "laundryUpdate"].every((a) => authorize({ r: "fdo" }, a) === false && authorize({ r: "delegato" }, a) === false));
check("sectionList: qualunque account autenticato", authorize({ r: "fdo" }, "sectionList") === true && authorize({ r: "delegato" }, "sectionList") === true && authorize(null, "sectionList") === false);
check("azione non sua: null", authorize({ r: "admin" }, "week") === null);
check("senza sessione: false", authorize(null, "sectionUpdate") === false);

section("resourceSection() / sampleRoomForLaundry()");
check("senza condivisione: la propria", resourceSection(CONFIG, 1, "conference") === 1 && resourceSection(CONFIG, 2, "cinema") === 2);
check("con condivisione: quella dell'altra", resourceSection(CONFIG, 3, "conference") === 1);
check("... solo per la risorsa condivisa", resourceSection(CONFIG, 3, "grigliata") === 3);
check("linen e theme: globali, della sezione con l'id piu' basso", resourceSection(CONFIG, 3, "linen") === 1 && resourceSection(CONFIG, 3, "theme") === 1);
check("sezione sconosciuta: l'id stesso (come la SQL)", resourceSection(CONFIG, 99, "conference") === 99);
check("sampleRoomForLaundry: una camera della lavanderia", sampleRoomForLaundry(CONFIG, 1) === "V101" && sampleRoomForLaundry(CONFIG, 2) === "V1");
check("... preferendo la sezione data", sampleRoomForLaundry(CONFIG, 3, 3) === "M1" && sampleRoomForLaundry(CONFIG, 3, 2) === "P1");
check("lavanderia non usata: null", sampleRoomForLaundry(CONFIG, 99) === null);
check("sectionIdOfRange", sectionIdOfRange(CONFIG, 21) === 2 && sectionIdOfRange(CONFIG, 999) === null);
check("risorse condivisibili", ["cinema", "music", "conference", "grigliata"].every(isShareable) && !isShareable("linen") && !isShareable("theme") && !isShareable("laundry") && !isShareable("bikes"));

section("scopeDecision() — il modello v2.0 (una sezione per account)");
const sup = { role: "superadmin", sectionId: null };
const adminV = { role: "admin", sectionId: 1 };
const fdoP = { role: "fdo", sectionId: 2 };
const adminM = { role: "admin", sectionId: 3 };
const d = (who, action, body = {}) => scopeDecision(who, action, body, CONFIG);

check("superadmin: azione sconosciuta passa, il default-deny e' per gli altri", d(sup, "boh").allowed && !d(adminV, "boh").allowed);
check("account senza sezione: negato", !d({ role: "admin", sectionId: null }, "week", { laundry_id: 1 }).allowed);
check("section_id di un'altra sezione dichiarato da un admin: negato", !d(adminV, "overview", { section_id: 2 }).allowed);
check("... la propria e' ammessa", d(adminV, "overview", { section_id: 1 }).allowed);
check("superadmin con section_id valido agisce su quella", d(sup, "overview", { section_id: 2 }).actingSectionId === 2);
check("superadmin con section_id inesistente: 400", (() => { const r = d(sup, "overview", { section_id: 77 }); return !r.allowed && r.status === 400; })());
check("wide: l'admin agisce sulla propria sezione, con scopeIds", (() => { const r = d(adminV, "purge"); return r.allowed && r.actingSectionId === 1 && JSON.stringify(r.scopeIds) === "[1]"; })());
check("wide: superadmin senza sezione = tutte (null)", (() => { const r = d(sup, "purge"); return r.allowed && r.actingSectionId === null && r.scopeIds === null; })());
check("ogni azione 'wide' passa a un admin", Object.entries(REGOLE).filter(([, v]) => v === "wide").every(([a]) => d(adminV, a).allowed));

// lavanderia
check("laundry: lavanderia della propria sezione", d(adminV, "week", { laundry_id: 1 }).allowed);
check("laundry: di un'altra sezione", !d(adminV, "week", { laundry_id: 3 }).allowed);
check("laundry condivisa: la usano P e M", d(fdoP, "week", { laundry_id: 3 }).allowed && d(adminM, "week", { laundry_id: 3 }).allowed);
check("laundryUpdate: usa body.id", d(fdoP, "laundryUpdate", { id: 3 }).allowed && !d(adminV, "laundryUpdate", { id: 3 }).allowed);
check("setMachineStatus: la lavanderia si ricava dalla camera", d(adminV, "setMachineStatus", { room: "V112" }).allowed && !d(adminV, "setMachineStatus", { room: "P5" }).allowed);
check("... e una camera di una sezione che condivide la lavanderia va bene", d(adminM, "setMachineStatus", { room: "P5" }).allowed);
check("camera inesistente / assente: 400", d(adminV, "setMachineStatus", { room: "Z9" }).status === 400 && d(adminV, "setMachineStatus", {}).status === 400);
check("forceBook: la camera deve stare nella lavanderia scelta", d(fdoP, "forceBook", { room: "M5", laundry_id: 3 }).allowed && !d(fdoP, "forceBook", { room: "V112", laundry_id: 3 }).allowed && !d(fdoP, "forceBook", { room: "P5", laundry_id: 1 }).allowed);
check("forceBook: camera non valida -> 400", d(fdoP, "forceBook", { room: "xx", laundry_id: 3 }).status === 400);
check("recurringAddLaundry: stesse regole, DIREZIONE ammessa", d(adminV, "recurringAddLaundry", { room: "DIREZIONE", laundry_id: 1 }).allowed);
check("clearDirezione con DIREZIONE chiede la lavanderia", (() => { const r = d(adminV, "clearDirezione", { room: "DIREZIONE" }); return !r.allowed && r.status === 400 && /lavanderia/.test(r.reason); })());
check("clearDirezione con DIREZIONE + laundry_id: ok, e il piano porta la lavanderia", (() => { const r = d(adminV, "clearDirezione", { room: "DIREZIONE", laundry_id: 1 }); return r.allowed && r.laundryId === 1; })());
check("laundry_id non numerico: negato", !d(fdoP, "week", { laundry_id: "x" }).allowed);
check("superadmin: una lavanderia usata da qualcuno va bene senza sezione", d(sup, "week", { laundry_id: 3 }).allowed && !d(sup, "week", { laundry_id: 99 }).allowed);

// camere
check("room: bici della propria sezione", d(adminV, "biciAddRoom", { room: "V112" }).allowed);
check("room: bici di un'altra sezione", !d(adminV, "biciAddRoom", { room: "P5" }).allowed);

// risorse per sezione, con condivisione
check("resource: la propria sezione possiede la sala polivalente", (() => { const r = d(adminV, "conferenzaAdd"); return r.allowed && r.resourceSectionId === 1; })());
check("resource condivisa: M usa la polivalente di V", d(adminM, "conferenzaAdd").resourceSectionId === 1 && d(adminM, "temaSet").resourceSectionId === 1);
check("resource non condivisa: M ha la sua grigliata; il cambio biancheria e' globale", d(adminM, "grigliataCrea").resourceSectionId === 3 && d(adminM, "cambioBiancheriaSet").resourceSectionId === 1);
check("sala: la feature segue body.space", d(adminM, "spaceSetChiuso", { space: "music" }).resourceSectionId === 3 && d(adminM, "bookSpaceDirezione", { space: "cinema" }).resourceSectionId === 3);
check("panoramica sale: le sezioni proprietarie (cinema e musica separate)", JSON.stringify(d(adminV, "spaces").spaceSectionIds) === "[1]");
check("resource senza sezione (superadmin): 400 'indica la sezione'", (() => { const r = d(sup, "conferenzaAdd"); return !r.allowed && r.status === 400 && /sezione/.test(r.reason); })());
check("superadmin con section_id: R calcolata sulla sezione scelta", d(sup, "conferenzaAdd", { section_id: 3 }).resourceSectionId === 1);

// per id
check("byId: il piano elenca i controlli da eseguire", (() => { const r = d(adminV, "conferenzaUpdate", { id: 5 }); return r.allowed && r.checks.length === 1 && r.checks[0].kinds[0] === "conference_event" && r.checks[0].id === 5; })());
check("byId: grigliata per adesione/ticket/evento", d(adminV, "grigliataConfermaPagamento", { adesione_id: 9 }).checks[0].kinds[0] === "grigliata_adesione" && d(adminV, "grigliataRipristinaTicket", { ticket_id: 3 }).checks[0].kinds[0] === "grigliata_ticket" && d(adminV, "grigliataChiudi", { evento_id: 2 }).checks[0].id === 2);
check("byId: le ricorrenti possono essere di lavanderia o di sala", JSON.stringify(d(adminV, "recurringDelete", { id: 1 }).checks[0].kinds) === '["recurring_space","recurring_laundry"]');
check("byId: iscrizioni push/Telegram", d(adminV, "deletePushSub", { id: 1 }).checks[0].kinds[0] === "push_sub" && d(adminV, "deleteTelegramSub", { id: 1 }).checks[0].kinds[0] === "telegram_sub");
check("grigliataAggiungiAdesione: evento da controllare E camera della propria sezione", d(adminV, "grigliataAggiungiAdesione", { evento_id: 1, room: "V112" }).allowed && !d(adminV, "grigliataAggiungiAdesione", { evento_id: 1, room: "P5" }).allowed);
check("byId senza sezione (superadmin): 400", d(sup, "conferenzaUpdate", { id: 1 }).status === 400);

// sezioni
check("section: l'admin modifica la propria", d(adminV, "sectionUpdate", { id: 1 }).allowed && !d(adminV, "sectionUpdate", { id: 2 }).allowed && !d(adminV, "sectionSetSharing", { id: 3 }).allowed);
check("range: l'admin ritocca i colori dei propri intervalli", d(adminV, "sectionSetRangeStyle", { range_id: 11 }).allowed && !d(adminV, "sectionSetRangeStyle", { range_id: 21 }).allowed && d(adminV, "sectionSetRangeStyle", { range_id: 999 }).status === 400);
check("superadmin: qualunque sezione e intervallo", d(sup, "sectionUpdate", { id: 2 }).allowed && d(sup, "sectionSetRangeStyle", { range_id: 21 }).allowed);
check("section inesistente: 400", d(sup, "sectionUpdate", { id: 99 }).status === 400);
check("creare sezioni/lavanderie: nessun bersaglio (la policy e' il ruolo)", d(adminV, "sectionCreate").allowed && d(adminV, "laundryCreate").allowed);

// default-deny: ogni azione amministrativa nota e' in REGOLE
check("REGOLE copre le azioni conosciute dai moduli", ["overview", "week", "spaces", "conferenzaList", "temaGet", "grigliataCrea", "cambioBiancheriaGet", "biciPurge", "pushSubs", "accountSetSection", "sectionSetSharing"].every((a) => a in REGOLE));

section("filterByScope()");
const ov = { ok: true, laundries: [{ id: 1, sections: [1] }, { id: 2, sections: [1] }, { id: 3, sections: [2, 3] }] };
check("overview: solo le lavanderie della sezione", filterByScope("overview", ov, [2], CONFIG).laundries.map((l) => l.id).join() === "3");
check("overview: scopeIds null = tutto", filterByScope("overview", ov, null, CONFIG).laundries.length === 3);
const bl = { ok: true, totale: 3, camere: [{ room: "V112" }, { room: "P5" }, { room: "M7" }] };
const fb = filterByScope("biciList", bl, [2, 3], CONFIG);
check("biciList: per lettera di sezione, totale ricalcolato", fb.camere.map((c) => c.room).join() === "P5,M7" && fb.totale === 2);
check("sectionList: solo la sezione", filterByScope("sectionList", { ok: true, sections: CONFIG.sections }, [3], CONFIG).sections.length === 1);
check("accountList: solo gli account della sezione", filterByScope("accountList", { ok: true, items: [{ id: 1, section_id: 1 }, { id: 2, section_id: 2 }, { id: 3, section_id: null }] }, [2], CONFIG).items.map((a) => a.id).join() === "2");
check("un errore passa com'e'", filterByScope("overview", { ok: false, error: "x" }, [1], CONFIG).ok === false);

section("checkResourceActors()");
const reposActors = (map) => ({ async resourceActors({ kind, id }) { return map[`${kind}:${id}`] ?? null; } });
{
  const sr = reposActors({ "conference_event:5": [1, 3], "recurring_laundry:9": [2, 3] });
  check("la sezione proprietaria puo'", (await checkResourceActors({ kind: "conference_event", id: 5, actingSectionId: 1 }, { sectionsRepository: sr })) === true);
  check("anche chi la condivide", (await checkResourceActors({ kind: "conference_event", id: 5, actingSectionId: 3 }, { sectionsRepository: sr })) === true);
  check("un'altra sezione: 403", (await throws(() => checkResourceActors({ kind: "conference_event", id: 5, actingSectionId: 2 }, { sectionsRepository: sr })))?.status === 403);
  check("risorsa inesistente: 400", (await throws(() => checkResourceActors({ kind: "conference_event", id: 6, actingSectionId: 1 }, { sectionsRepository: sr })))?.status === 400);
  check("elenco di tipi: si prova ciascuno", (await checkResourceActors({ kind: ["recurring_space", "recurring_laundry"], id: 9, actingSectionId: 2 }, { sectionsRepository: sr })) === true);
  check("id non valido: 400", (await throws(() => checkResourceActors({ kind: "conference_event", id: "x", actingSectionId: 1 }, { sectionsRepository: sr })))?.status === 400);
  check("tipo sconosciuto e' un bug, non un 403", (await throws(() => checkResourceActors({ kind: "boh", id: 1, actingSectionId: 1 }, { sectionsRepository: sr })))?.status === undefined);
}

section("resolveResourceSection()");
{
  const dp = { getConfig };
  check("camera V: la risorsa e' di V", (await resolveResourceSection({ room: "V112", feature: "conference" }, dp)) === 1);
  check("camera M: la polivalente e' quella di V (condivisa)", (await resolveResourceSection({ room: "M5", feature: "conference" }, dp)) === 1);
  check("camera M: la sala cinema e' la sua", (await resolveResourceSection({ room: "M5", feature: "cinema" }, dp)) === 3);
  check("funzione spenta: 403", (await throws(() => resolveResourceSection({ room: "P5", feature: "conference" }, dp)))?.status === 403);
  check("senza camera: 400 'camera mancante'", (await throws(() => resolveResourceSection({ room: "", feature: "cinema" }, dp)))?.message === "camera mancante");
  check("camera inesistente: 400", (await throws(() => resolveResourceSection({ room: "V100", feature: "cinema" }, dp)))?.status === 400);
  check("DIREZIONE + lettera di sezione", (await resolveResourceSection({ room: "DIREZIONE", sectionCode: "m", feature: "cinema" }, dp)) === 3);
  check("DIREZIONE senza lettera: 400", (await throws(() => resolveResourceSection({ room: "DIREZIONE", feature: "cinema" }, dp)))?.status === 400);
  check("DIREZIONE con sezione inesistente o disattivata: 400", (await throws(() => resolveResourceSection({ room: "DIREZIONE", sectionCode: "Z", feature: "cinema" }, dp)))?.status === 400 && (await throws(() => resolveResourceSection({ room: "DIREZIONE", sectionCode: "X", feature: "cinema" }, dp)))?.status === 400);
  check("DIREZIONE + sezione con la funzione spenta: 403", (await throws(() => resolveResourceSection({ room: "DIREZIONE", sectionCode: "P", feature: "conference" }, dp)))?.status === 403);
  check("DIREZIONE: anche con condivisione", (await resolveResourceSection({ room: "DIREZIONE", sectionCode: "M", feature: "conference" }, dp)) === 1);
}

section("adminSetSharing() / adminSetRangeStyle()");
{
  const calls2 = []; let inv = 0;
  const repo2 = new Proxy({}, { get: (_, name) => async (args) => { calls2.push({ name, args }); return { ok: true }; } });
  const adm2 = { sectionsRepository: repo2, invalidate: () => { inv++; } };
  await adminSetSharing({ id: "2", shared: { conference: "1", cinema: null } }, adm2);
  check("condivisione: chiavi note, ids interi, null ignorato", calls2[0].name === "setSharing" && calls2[0].args.id === 2 && JSON.stringify(calls2[0].args.shared) === '{"conference":1}' && inv === 1);
  await adminSetSharing({ id: 2, shared: {} }, adm2);
  check("oggetto vuoto = togli ogni condivisione", JSON.stringify(calls2[1].args.shared) === "{}");
  check("risorsa non condivisibile (laundry, bikes): respinta", (await throws(() => adminSetSharing({ id: 2, shared: { laundry: 1 } }, adm2))) !== null && (await throws(() => adminSetSharing({ id: 2, shared: { bikes: 1 } }, adm2))) !== null);
  check("sezione non valida / non oggetto: respinte", (await throws(() => adminSetSharing({ id: 2, shared: { conference: "x" } }, adm2))) !== null && (await throws(() => adminSetSharing({ id: 2, shared: [1] }, adm2))) !== null && (await throws(() => adminSetSharing({ id: 2, shared: null }, adm2))) !== null);
  check("parseSharing", Object.keys(parseSharing({ grigliata: 4, music: "" })).join() === "grigliata");
  await adminSetRangeStyle({ rangeId: "12", label: " 1° piano ", color: "#22C55E" }, adm2);
  check("stile intervallo: id, nome ripulito, colore normalizzato", calls2.at(-1).name === "setRangeStyle" && calls2.at(-1).args.rangeId === 12 && calls2.at(-1).args.label === "1° piano" && calls2.at(-1).args.color === "#22c55e");
  await adminSetRangeStyle({ rangeId: 12, color: "" }, adm2);
  check("colore vuoto = toglilo, nome non dato = invariato", calls2.at(-1).args.color === "" && calls2.at(-1).args.label === null);
  check("colore non esadecimale: respinto", (await throws(() => adminSetRangeStyle({ rangeId: 12, color: "rosso" }, adm2))) !== null && (await throws(() => adminSetRangeStyle({ rangeId: 12, color: "#12345" }, adm2))) !== null);
  check("parseColor", parseColor(" #ABCDEF ") === "#abcdef");
  check("range_id non valido / nome troppo lungo: respinti", (await throws(() => adminSetRangeStyle({ rangeId: "x" }, adm2))) !== null && (await throws(() => adminSetRangeStyle({ rangeId: 1, label: "x".repeat(41) }, adm2))) !== null);
  await adminCreateSection({ code: "q", number: 5, name: "Q", ranges: [{ label: "A", from: 1, to: 9, color: "#AABBCC" }] }, adm2);
  check("gli intervalli di una nuova sezione portano il colore", calls2.at(-1).args.ranges[0].color === "#aabbcc");
  check("colore non valido in un intervallo: respinto", (await throws(() => adminCreateSection({ code: "q", number: 5, name: "Q", ranges: [{ label: "A", from: 1, to: 9, color: "blu" }] }, adm2))) !== null);
  check("le feature globali (theme) si ignorano: non si spengono", Object.keys(parseFeatures({ theme: false, bikes: false })).join() === "bikes");
}

console.log(`\nPASSATI: ${pass}   FALLITI: ${fail}`);
process.exit(fail ? 1 : 0);
