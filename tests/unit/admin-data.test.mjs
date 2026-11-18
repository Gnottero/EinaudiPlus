// api/admin/data.js — l'handler vero, contro un finto PostgREST locale.
//
// Qui si prova cio' che nessun test dei moduli puo' provare: che l'handler
// metta insieme sessione, ruolo e sezione DELLA RIGA dell'account, scopeDecision,
// i controlli "per id" e le regole sugli account, e che le chiamate SQL
// escano con la sezione giusta (o non escano affatto). Nessuna rete esterna:
// un server http su 127.0.0.1 risponde a /rest/v1/rpc/<funzione>.

import http from "node:http";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FALLA " + name + " " + detail); }
};
const section = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);

// ─── lo stato del finto database ────────────────────────────────────────────
const CONFIG = {
  ok: true,
  laundries: [{ id: 1, slug: "valentino", name: "Valentino", pairs: 3 }, { id: 2, slug: "manica", name: "Manica", pairs: 1 }, { id: 3, slug: "po-mole", name: "Po-Mole", pairs: 2 }],
  sections: [
    { id: 1, code: "V", number: 1, name: "Valentino", active: true, features: {}, shared_with: {},
      ranges: [{ id: 11, label: "Manica", from: 1, to: 50, laundry_id: 2, color: "#f97316" }, { id: 12, label: "1° piano", from: 101, to: 136, laundry_id: 1, color: null }] },
    { id: 2, code: "P", number: 2, name: "Po", active: true, features: {}, shared_with: {}, ranges: [{ id: 21, label: "Po", from: 1, to: 40, laundry_id: 3 }] },
    { id: 3, code: "M", number: 3, name: "Mole", active: true, features: {}, shared_with: { conference: 1 }, ranges: [{ id: 31, label: "Mole", from: 1, to: 30, laundry_id: 3 }] },
  ],
};
const ACCOUNTS = {
  boss:   { id: 1, username: "boss",   ruolo: "superadmin", attivo: true, section_id: null },
  adminV: { id: 2, username: "adminV", ruolo: "admin", attivo: true, section_id: 1 },
  fdoV:   { id: 3, username: "fdoV",   ruolo: "fdo", attivo: true, section_id: 1 },
  adminP: { id: 4, username: "adminP", ruolo: "admin", attivo: true, section_id: 2 },
  fdoP:   { id: 5, username: "fdoP",   ruolo: "fdo", attivo: true, section_id: 2 },
  adminM: { id: 6, username: "adminM", ruolo: "admin", attivo: true, section_id: 3 },
  delV:   { id: 7, username: "delV",   ruolo: "delegato", attivo: true, section_id: 1 },
  nuovo:  { id: 8, username: "nuovo",  ruolo: "admin", attivo: true, section_id: 1, deve_cambiare_password: true },
  ex:     { id: 9, username: "ex",     ruolo: "fdo", attivo: true, section_id: 1 },   // il cookie dice admin
};
const ACTORS = { "conference_event:5": [1, 3], "conference_event:6": [2], "space_booking:8": [1], "grigliata_evento:4": [2], "recurring_laundry:9": [2, 3], "push_sub:3": [2] };
let chiamate = [];

function rpcRisposta(fn, a) {
  switch (fn) {
    case "section_config": return CONFIG;
    case "account_by_username": return ACCOUNTS[a.p_username] ?? null;
    case "account_list": return { ok: true, items: Object.values(ACCOUNTS).map(({ id, username, ruolo, section_id }) => ({ id, username, ruolo, section_id })) };
    case "resource_actors": return ACTORS[`${a.p_kind}:${a.p_id}`] ?? null;
    case "admin_spaces": return { ok: true, items: [{ id: a.p_section_id ?? 0, space: "cinema" }] };
    case "bike_admin_list": return { ok: true, camere: [{ room: "V112" }, { room: "P5" }, { room: "P7" }] };
    case "bike_delete_room": return { ok: true, deleted: true };
    case "admin_overview": return { ok: true, laundries: [{ id: 1, sections: [1] }, { id: 3, sections: [2, 3] }] };
    case "admin_log": return null;
    default: return { ok: true };
  }
}
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const fn = req.url.split("/rpc/")[1];
    const args = raw ? JSON.parse(raw) : {};
    if (fn !== "admin_log") chiamate.push({ fn, args });
    const out = rpcRisposta(fn, args);
    res.setHeader("Content-Type", "application/json");
    res.end(out === null ? "" : JSON.stringify(out));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.SUPABASE_SECRET_KEY = "test";
process.env.ADMIN_SESSION_SECRET = "segreto-di-prova-abcdefghijklmnop";

const { issueToken } = await import("../../src/modules/identity/index.js");
const { default: handler } = await import("../../api/admin/data.js");

/** Una richiesta all'handler, loggata come `utente` (il cookie porta `ruoloCookie`). */
async function chiedi(utente, body, { ruoloCookie, header = "admin", senzaCookie = false } = {}) {
  chiamate = [];
  const acc = ACCOUNTS[utente];
  const cookie = senzaCookie ? undefined : `adm=${issueToken(utente, ruoloCookie ?? acc.ruolo)}`;
  const req = { method: "POST", headers: { "x-requested-with": header, ...(cookie ? { cookie } : {}) }, body, query: {}, socket: {} };
  let status = 200, payload;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(p) { payload = p; return this; } };
  await handler(req, res);
  return { status, payload, chiamate: [...chiamate].filter((c) => c.fn !== "account_by_username" && c.fn !== "section_config" && c.fn !== "account_list" && c.fn !== "resource_actors") };
}
const rpcChiamate = (r, fn) => r.chiamate.filter((c) => c.fn === fn);

section("Sessione");
{
  let r = await chiedi("adminV", { action: "overview" }, { senzaCookie: true });
  check("senza cookie: 401", r.status === 401);
  r = await chiedi("adminV", { action: "overview" }, { header: "x" });
  check("senza header applicativo: 400", r.status === 400);
  r = await chiedi("nuovo", { action: "overview" });
  check("password provvisoria: 403 finche' non la cambia", r.status === 403 && r.payload.deve_cambiare_password === true);
  r = await chiedi("adminV", { action: "overview" }, { ruoloCookie: "sistemista" });
  check("un cookie col vecchio ruolo 'sistemista' non passa", r.status === 401 || r.status === 403);
  r = await chiedi("ex", { action: "purge", scope: "settimana" }, { ruoloCookie: "admin" });
  check("il ruolo vale quello della RIGA, non del cookie: un ex-admin diventato fdo non fa la pulizia", r.status === 403 && rpcChiamate(r, "sysadmin_purge").length === 0);
}

section("Lavanderia: la lavanderia deve essere della propria sezione");
{
  let r = await chiedi("adminV", { action: "week", laundry_id: 1, offset: 0 });
  check("admin V legge la griglia della propria lavanderia", r.status === 200 && rpcChiamate(r, "admin_week").length === 1);
  r = await chiedi("adminV", { action: "week", laundry_id: 3, offset: 0 });
  check("... non quella di Po-Mole: 403, nessuna chiamata", r.status === 403 && rpcChiamate(r, "admin_week").length === 0);
  r = await chiedi("adminM", { action: "week", laundry_id: 3, offset: 0 });
  check("la lavanderia condivisa la legge anche M", r.status === 200);
  r = await chiedi("fdoP", { action: "week", laundry_id: 3, offset: 0 });
  check("... e l'fdo di P", r.status === 200);
  r = await chiedi("fdoP", { action: "setMachineStatus", room: "P5", machine: "W-A", oos: true });
  check("setMachineStatus: camera della lavanderia della propria sezione", r.status === 200 && rpcChiamate(r, "set_machine_status").length === 1);
  r = await chiedi("fdoP", { action: "setMachineStatus", room: "V112", machine: "W-A", oos: true });
  check("... di un'altra: 403", r.status === 403 && rpcChiamate(r, "set_machine_status").length === 0);
  r = await chiedi("delV", { action: "week", laundry_id: 1, offset: 0 });
  check("il delegato non ha il permesso, qualunque sezione", r.status === 403);
  r = await chiedi("fdoV", { action: "clearDirezione", room: "DIREZIONE", day: 1, slot: 2, machine: "W-A", laundry_id: 1 });
  const clear = rpcChiamate(r, "clear_laundry")[0];
  check("clearDirezione da Direzione: la SQL riceve una camera della lavanderia giusta (non il fallback)", r.status === 200 && clear?.args.p_room === "V101" && clear.args.p_as_admin === true, JSON.stringify(clear));
  r = await chiedi("fdoV", { action: "clearDirezione", room: "DIREZIONE", day: 1, slot: 2, machine: "W-A" });
  check("... senza laundry_id: 400 'indica la lavanderia'", r.status === 400 && /lavanderia/.test(r.payload.error));
  r = await chiedi("adminV", { action: "forceBook", laundry_id: 1, day: 1, slot: 2, machine: "W-A", room: "P5" });
  check("forceBook: la camera deve essere della lavanderia scelta", r.status === 400 && rpcChiamate(r, "admin_force_book").length === 0);
  r = await chiedi("fdoV", { action: "deleteBooking", id: 5 });
  check("deleteBooking: l'ambito [sezione] arriva alla SQL", rpcChiamate(r, "admin_delete_booking")[0]?.args.p_section_ids?.join() === "1");
  r = await chiedi("boss", { action: "deleteBooking", id: 5 });
  check("... il superadmin senza sezione: null (nessun filtro)", rpcChiamate(r, "admin_delete_booking")[0]?.args.p_section_ids === null);
}

section("Risorse per sezione, con condivisione");
{
  let r = await chiedi("adminV", { action: "conferenzaAdd", titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("polivalente: l'evento e' della propria sezione", rpcChiamate(r, "conference_add")[0]?.args.p_section_id === 1);
  r = await chiedi("adminM", { action: "conferenzaAdd", titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("M condivide la polivalente con V: l'evento e' di V", rpcChiamate(r, "conference_add")[0]?.args.p_section_id === 1);
  r = await chiedi("adminP", { action: "conferenzaAdd", titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("P ha la sua: l'evento e' di P", rpcChiamate(r, "conference_add")[0]?.args.p_section_id === 2);
  r = await chiedi("adminM", { action: "conferenzaList" });
  check("lista regole: della sezione proprietaria", rpcChiamate(r, "conference_rules")[0]?.args.p_section_id === 1);
  r = await chiedi("adminM", { action: "conferenzaDelete", id: 5 });
  check("per id: la sezione che condivide puo' toccare l'evento di V", r.status === 200 && rpcChiamate(r, "conference_delete").length === 1);
  r = await chiedi("adminV", { action: "conferenzaDelete", id: 6 });
  check("... un evento di P: 403, nessuna chiamata", r.status === 403 && rpcChiamate(r, "conference_delete").length === 0);
  r = await chiedi("adminV", { action: "conferenzaDelete", id: 999 });
  check("... un evento inesistente: errore, nessuna chiamata", r.status >= 400 && rpcChiamate(r, "conference_delete").length === 0);
  r = await chiedi("adminV", { action: "deleteSpaceBooking", id: 8 });
  check("prenotazione di sala per id: della propria sezione", r.status === 200 && rpcChiamate(r, "admin_delete_space_booking").length === 1);
  r = await chiedi("adminP", { action: "deleteSpaceBooking", id: 8 });
  check("... di un'altra: 403", r.status === 403 && rpcChiamate(r, "admin_delete_space_booking").length === 0);
  r = await chiedi("adminP", { action: "grigliataChiudi", evento_id: 4 });
  check("grigliata per id: della propria sezione", r.status === 200 && rpcChiamate(r, "grigliata_admin_chiudi").length === 1);
  r = await chiedi("delV", { action: "grigliataChiudi", evento_id: 4 });
  check("... il delegato di V non chiude quella di P", r.status === 403);
  r = await chiedi("delV", { action: "grigliataOverview" });
  check("il delegato vede la grigliata della propria sezione", rpcChiamate(r, "grigliata_admin_overview")[0]?.args.p_section_id === 1);
  r = await chiedi("adminM", { action: "temaSet", tema: "natale" });
  check("tema: M lo condivide? no — ha il proprio", rpcChiamate(r, "sysadmin_set_theme")[0]?.args.p_section_id === 3);
  r = await chiedi("adminM", { action: "cambioBiancheriaSet", ancora_data: "2026-09-15", ancora_tipo: "grande" });
  check("cambio biancheria: della propria sezione", rpcChiamate(r, "linen_change_set_anchor")[0]?.args.p_section_id === 3);
  r = await chiedi("adminV", { action: "spaces" });
  check("panoramica sale: della propria sezione", rpcChiamate(r, "admin_spaces")[0]?.args.p_section_id === 1 && r.payload.items.length === 1);
  r = await chiedi("adminV", { action: "recurringDelete", id: 9 });
  check("ricorrente di lavanderia per id: V non e' fra chi puo'", r.status === 403 && rpcChiamate(r, "recurring_delete").length === 0);
  r = await chiedi("adminM", { action: "recurringDelete", id: 9 });
  check("... M si' (lavanderia condivisa)", r.status === 200 && rpcChiamate(r, "recurring_delete").length === 1);
  r = await chiedi("adminP", { action: "deletePushSub", id: 3 });
  check("iscrizione push per id: della propria sezione", r.status === 200 && rpcChiamate(r, "sysadmin_delete_push_sub").length === 1);
  r = await chiedi("adminV", { action: "deletePushSub", id: 3 });
  check("... di un'altra: 403", r.status === 403 && rpcChiamate(r, "sysadmin_delete_push_sub").length === 0);
}

section("Superadmin: la sezione si sceglie");
{
  let r = await chiedi("boss", { action: "conferenzaAdd", titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("azione di risorsa senza section_id: 400", r.status === 400 && /sezione/.test(r.payload.error) && rpcChiamate(r, "conference_add").length === 0);
  r = await chiedi("boss", { action: "conferenzaAdd", section_id: 2, titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("con section_id: gira sulla sezione scelta", rpcChiamate(r, "conference_add")[0]?.args.p_section_id === 2);
  r = await chiedi("boss", { action: "conferenzaAdd", section_id: 3, titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-12-01", al: "2026-12-01" });
  check("... con la condivisione di quella sezione", rpcChiamate(r, "conference_add")[0]?.args.p_section_id === 1);
  r = await chiedi("boss", { action: "purge", scope: "settimana" });
  check("pulizia senza sezione: tutte (null)", rpcChiamate(r, "sysadmin_purge")[0]?.args.p_section_id === null);
  r = await chiedi("boss", { action: "purge", scope: "settimana", section_id: 2 });
  check("pulizia con sezione: quella", rpcChiamate(r, "sysadmin_purge")[0]?.args.p_section_id === 2);
  r = await chiedi("boss", { action: "purge", scope: "settimana", section_id: 99 });
  check("sezione inesistente: 400, nessuna pulizia", r.status === 400 && rpcChiamate(r, "sysadmin_purge").length === 0);
  r = await chiedi("adminV", { action: "purge", scope: "settimana", section_id: 2 });
  check("un admin che dichiara un'altra sezione: 403", r.status === 403 && rpcChiamate(r, "sysadmin_purge").length === 0);
  r = await chiedi("adminV", { action: "purge", scope: "settimana" });
  check("un admin: la pulizia e' della propria sezione", rpcChiamate(r, "sysadmin_purge")[0]?.args.p_section_id === 1);
  r = await chiedi("adminV", { action: "counts" });
  check("conteggi, ricorrenti, applica: della propria sezione", rpcChiamate(r, "sysadmin_conteggi")[0]?.args.p_section_id === 1);
  r = await chiedi("adminV", { action: "pushSubs" });
  check("iscrizioni push: della propria sezione", rpcChiamate(r, "sysadmin_push_subs")[0]?.args.p_section_id === 1);
  r = await chiedi("adminV", { action: "wut" });
  check("azione sconosciuta a un admin: 403 (default-deny)", r.status === 403);
  r = await chiedi("boss", { action: "wut" });
  check("... al superadmin: 'azione sconosciuta'", r.status === 200 && /sconosciuta/.test(r.payload.error));
}

section("Account");
{
  let r = await chiedi("adminV", { action: "accountList" });
  check("un admin vede solo gli account della propria sezione", r.status === 200 && r.payload.items.every((a) => a.section_id === 1) && r.payload.items.length >= 3);
  r = await chiedi("boss", { action: "accountList" });
  check("il superadmin li vede tutti", r.payload.items.length === Object.keys(ACCOUNTS).length);
  r = await chiedi("adminV", { action: "accountCreate", username: "nuovo1", password: "Password-123", ruolo: "fdo", section_id: 2 });
  check("admin crea un fdo: sempre nella propria sezione (anche se dichiara un'altra? no: 403 per sezione dichiarata)", r.status === 403 && rpcChiamate(r, "account_create").length === 0);
  r = await chiedi("adminV", { action: "accountCreate", username: "nuovo1", password: "Password-123", ruolo: "fdo" });
  check("admin crea un fdo: nella propria sezione", rpcChiamate(r, "account_create")[0]?.args.p_section_id === 1 && rpcChiamate(r, "account_create")[0]?.args.p_ruolo === "fdo");
  r = await chiedi("adminV", { action: "accountCreate", username: "nuovo2", password: "Password-123", ruolo: "delegato" });
  check("... o un delegato", rpcChiamate(r, "account_create").length === 1);
  r = await chiedi("adminV", { action: "accountCreate", username: "nuovo3", password: "Password-123", ruolo: "admin" });
  check("un admin non crea un admin", r.status === 403 && rpcChiamate(r, "account_create").length === 0);
  r = await chiedi("adminV", { action: "accountCreate", username: "nuovo4", password: "Password-123", ruolo: "superadmin" });
  check("ne' un superadmin", r.status === 403);
  r = await chiedi("boss", { action: "accountCreate", username: "nuovo5", password: "Password-123", ruolo: "admin", section_id: 2 });
  check("il superadmin nomina un admin di una sezione", rpcChiamate(r, "account_create")[0]?.args.p_section_id === 2 && rpcChiamate(r, "account_create")[0]?.args.p_ruolo === "admin");
  r = await chiedi("boss", { action: "accountCreate", username: "nuovo6", password: "Password-123", ruolo: "superadmin" });
  check("... o un altro superadmin (senza sezione)", rpcChiamate(r, "account_create")[0]?.args.p_section_id === null);
  r = await chiedi("boss", { action: "accountCreate", username: "nuovo7", password: "Password-123", ruolo: "fdo" });
  check("... ma un fdo senza sezione: errore, nessuna scrittura", rpcChiamate(r, "account_create").length === 0 || r.status >= 400 || r.payload.ok === false);
  r = await chiedi("adminV", { action: "accountSetPassword", id: ACCOUNTS.fdoV.id, password: "Password-123" });
  check("admin reimposta la password di un fdo della sezione", r.status === 200 && rpcChiamate(r, "account_set_password").length === 1);
  r = await chiedi("adminV", { action: "accountSetPassword", id: ACCOUNTS.fdoP.id, password: "Password-123" });
  check("... non di un fdo di un'altra sezione", r.status === 403 && rpcChiamate(r, "account_set_password").length === 0);
  r = await chiedi("adminV", { action: "accountSetPassword", id: ACCOUNTS.boss.id, password: "Password-123" });
  check("... non del superadmin", r.status === 403 && rpcChiamate(r, "account_set_password").length === 0);
  r = await chiedi("adminV", { action: "accountSetPassword", id: ACCOUNTS.nuovo.id, password: "Password-123" });
  check("... non di un altro admin, neanche della propria sezione", r.status === 403 && rpcChiamate(r, "account_set_password").length === 0);
  r = await chiedi("adminV", { action: "accountDelete", id: ACCOUNTS.delV.id });
  check("admin elimina un delegato della sezione", r.status === 200 && rpcChiamate(r, "account_delete").length === 1);
  r = await chiedi("adminV", { action: "accountSetActive", id: 999, attivo: false });
  check("account inesistente: 400", r.status === 400);
  r = await chiedi("boss", { action: "accountSetPassword", id: ACCOUNTS.adminP.id, password: "Password-123" });
  check("il superadmin tocca chiunque", r.status === 200);
  r = await chiedi("adminV", { action: "accountSetSection", id: ACCOUNTS.fdoV.id, section_id: 2 });
  check("solo il superadmin sposta un account di sezione", r.status === 403 && rpcChiamate(r, "account_set_section").length === 0);
  r = await chiedi("boss", { action: "accountSetSection", id: ACCOUNTS.fdoV.id, section_id: 2 });
  check("... il superadmin si'", r.status === 200 && rpcChiamate(r, "account_set_section")[0]?.args.p_section_id === 2);
  r = await chiedi("adminV", { action: "accountSetCamera", id: ACCOUNTS.delV.id, camera: "P5" });
  check("la camera dell'account deve stare nella sua sezione", r.status === 400 && rpcChiamate(r, "account_set_camera").length === 0);
  r = await chiedi("adminV", { action: "accountSetCamera", id: ACCOUNTS.delV.id, camera: "V112" });
  check("... se e' della sezione va", r.status === 200 && rpcChiamate(r, "account_set_camera").length === 1);
  r = await chiedi("adminV", { action: "accountSetCamera", id: ACCOUNTS.delV.id, camera: "" });
  check("togliere la camera e' sempre ammesso", r.status === 200);
  r = await chiedi("fdoV", { action: "accountList" });
  check("fdo: nessun permesso sugli account", r.status === 403);
}

section("Sezioni");
{
  let r = await chiedi("fdoV", { action: "sectionList" });
  check("sectionList: un fdo vede solo la propria sezione", r.status === 200 && r.payload.sections.length === 1 && r.payload.sections[0].id === 1);
  r = await chiedi("boss", { action: "sectionList" });
  check("il superadmin le vede tutte", r.payload.sections.length === 3);
  r = await chiedi("adminV", { action: "sectionUpdate", id: 1, name: "Valentino 2", features: { bikes: false } });
  check("admin modifica nome e funzioni della propria sezione", r.status === 200 && rpcChiamate(r, "section_admin_update")[0]?.args.p_features?.bikes === false);
  r = await chiedi("adminV", { action: "sectionUpdate", id: 2, name: "x" });
  check("... non di un'altra", r.status === 403 && rpcChiamate(r, "section_admin_update").length === 0);
  r = await chiedi("adminV", { action: "sectionUpdate", id: 1, active: false });
  check("... e non la disattiva", r.status === 403 && rpcChiamate(r, "section_admin_update").length === 0);
  r = await chiedi("boss", { action: "sectionUpdate", id: 1, active: false });
  check("il superadmin si'", r.status === 200 && rpcChiamate(r, "section_admin_update")[0]?.args.p_active === false);
  r = await chiedi("adminV", { action: "sectionSetSharing", id: 1, shared: { grigliata: 2 } });
  check("condivisioni: l'admin per la propria sezione", r.status === 200 && JSON.stringify(rpcChiamate(r, "section_admin_set_sharing")[0]?.args.p_shared) === '{"grigliata":2}');
  r = await chiedi("adminV", { action: "sectionSetSharing", id: 3, shared: {} });
  check("... non per un'altra", r.status === 403);
  r = await chiedi("adminV", { action: "sectionSetRangeStyle", range_id: 12, label: "Primo piano", color: "#112233" });
  check("colori dei piani: l'admin della sezione", r.status === 200 && rpcChiamate(r, "section_admin_set_range_style")[0]?.args.p_color === "#112233");
  r = await chiedi("adminV", { action: "sectionSetRangeStyle", range_id: 21, color: "#112233" });
  check("... non quelli di un'altra", r.status === 403 && rpcChiamate(r, "section_admin_set_range_style").length === 0);
  r = await chiedi("fdoV", { action: "sectionSetRangeStyle", range_id: 12, color: "#112233" });
  check("un fdo non cambia i colori", r.status === 403);
  r = await chiedi("adminV", { action: "sectionCreate", code: "Z", number: 9, name: "Z" });
  check("un admin non crea sezioni", r.status === 403 && rpcChiamate(r, "section_admin_create").length === 0);
  r = await chiedi("adminV", { action: "sectionSetRanges", id: 1, ranges: [] });
  check("ne' cambia gli intervalli", r.status === 403);
  r = await chiedi("adminV", { action: "laundryCreate", slug: "xx", name: "x", pairs: 1 });
  check("ne' crea lavanderie", r.status === 403);
  r = await chiedi("boss", { action: "sectionCreate", code: "Z", number: 9, name: "Zeta", ranges: [{ label: "z", from: 1, to: 9, color: "#abcdef" }] });
  check("il superadmin crea una sezione, con il colore dell'intervallo", r.status === 200 && rpcChiamate(r, "section_admin_create")[0]?.args.p_ranges[0].color === "#abcdef");
  r = await chiedi("adminM", { action: "laundryUpdate", id: 3, pairs: 3 });
  check("la lavanderia condivisa la modifica l'admin di M", r.status === 200 && rpcChiamate(r, "laundry_admin_update").length === 1);
  r = await chiedi("adminP", { action: "laundryUpdate", id: 3, name: "Po e Mole" });
  check("... e quello di P", r.status === 200);
  r = await chiedi("adminV", { action: "laundryUpdate", id: 3, pairs: 1 });
  check("... non quello di V", r.status === 403);
}

section("Notifiche, bici, panoramica");
{
  let r = await chiedi("adminP", { action: "broadcastPush", title: "t", body: "b" });
  check("broadcast: ai soli iscritti della sezione", rpcChiamate(r, "sysadmin_all_push_subs").length === 0 || rpcChiamate(r, "sysadmin_all_push_subs")[0].args.p_section_id === 2);
  r = await chiedi("adminP", { action: "broadcastPush", title: "t", body: "b", room: "V112" });
  check("broadcast a una camera di un'altra sezione: 403", r.status === 403);
  r = await chiedi("adminP", { action: "biciPurge" });
  const eliminate = rpcChiamate(r, "bike_delete_room").map((c) => c.args.p_room);
  check("reset bici dell'admin: solo le camere della sezione", r.status === 200 && eliminate.join() === "P5,P7" && rpcChiamate(r, "bike_purge").length === 0);
  r = await chiedi("boss", { action: "biciPurge" });
  check("... del superadmin senza sezione: tutte", rpcChiamate(r, "bike_purge").length === 1);
  r = await chiedi("adminP", { action: "biciAddRoom", room: "V5" });
  check("bici: una camera di un'altra sezione: 403", r.status === 403);
  r = await chiedi("adminP", { action: "overview" });
  check("panoramica lavanderie: solo quelle della propria sezione", r.status === 200 && r.payload.laundries.length === 1 && r.payload.laundries[0].id === 3);
  r = await chiedi("fdoP", { action: "feedback" });
  check("segnalazioni: l'ambito e' la sezione", rpcChiamate(r, "admin_feedback")[0]?.args.p_section_ids?.join() === "2");
}

server.close();
console.log(`\nPASSATI: ${pass}   FALLITI: ${fail}`);
process.exit(fail ? 1 : 0);
