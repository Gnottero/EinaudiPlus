// Ogni risorsa e' di una sezione (v2.0): i use-case passano il sectionId alla
// SQL, lo esigono dove la risorsa non puo' esistere senza, e accettano null
// ("tutte le sezioni") dove lo decide il chiamante. Nessuna rete: repository
// finti che registrano le chiamate.

import { getBookings } from "../../src/modules/common-spaces/application/getBookings.js";
import { bookSpace } from "../../src/modules/common-spaces/application/bookSpace.js";
import { clearBooking } from "../../src/modules/common-spaces/application/clearBooking.js";
import { adminGetSpacesOverview } from "../../src/modules/common-spaces/application/adminGetSpacesOverview.js";
import { adminBookAsDirezione } from "../../src/modules/common-spaces/application/adminBookAsDirezione.js";
import { adminSetSpaceChiuso } from "../../src/modules/common-spaces/application/adminSetSpaceChiuso.js";
import { getAgenda } from "../../src/modules/conference-room/application/getAgenda.js";
import { listRules } from "../../src/modules/conference-room/application/listRules.js";
import { addRule } from "../../src/modules/conference-room/application/addRule.js";
import { getTheme } from "../../src/modules/theme/application/getTheme.js";
import { setTheme } from "../../src/modules/theme/application/setTheme.js";
import { getLinenChangeAnchor } from "../../src/modules/linen-change/application/getLinenChangeAnchor.js";
import { setLinenChangeAnchor } from "../../src/modules/linen-change/application/setLinenChangeAnchor.js";
import { setLinenChangeSkip } from "../../src/modules/linen-change/application/setLinenChangeSkip.js";
import { adminCreaEvento } from "../../src/modules/grigliata/application/adminCreaEvento.js";
import { adminOverview as grigliataOverview } from "../../src/modules/grigliata/application/adminOverview.js";
import { listRecurringRules } from "../../src/modules/ops/application/listRecurringRules.js";
import { applyRecurringRules } from "../../src/modules/ops/application/applyRecurringRules.js";
import { purgeData } from "../../src/modules/ops/application/purgeData.js";
import { getCounts } from "../../src/modules/ops/application/getCounts.js";
import { adminListPushSubs } from "../../src/modules/notifications/application/adminListPushSubs.js";
import { adminListTelegramSubs } from "../../src/modules/notifications/application/adminListTelegramSubs.js";
import { adminBroadcast } from "../../src/modules/notifications/application/adminBroadcast.js";
import { adminPurgeBikes } from "../../src/modules/bikes/application/adminPurgeBikes.js";
import { createAccount, setAccountSection, parseAccountSection } from "../../src/modules/identity/application/manageAccounts.js";
import { requireSectionId, optionalSectionId } from "../../src/shared/validation/section.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FALLA " + name + " " + detail); }
};
const section = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);
const throws = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

/** Repository finto: ogni metodo registra (nome, argomenti) e torna `risposta`. */
const rec = (risposta = { ok: true }) => {
  const calls = [];
  const repo = new Proxy({}, { get: (_, name) => async (...args) => { calls.push({ name, args }); return typeof risposta === "function" ? risposta(name, args) : risposta; } });
  return { repo, calls };
};

section("requireSectionId() / optionalSectionId()");
check("intero valido", requireSectionId(3) === 3 && requireSectionId("3") === 3);
check("mancante / non valido: 'sezione mancante'", (await throws(() => requireSectionId(undefined)))?.message === "sezione mancante" && (await throws(() => requireSectionId(0))) !== null && (await throws(() => requireSectionId("x"))) !== null && (await throws(() => requireSectionId(40000))) !== null);
check("optional: null/undefined = tutte", optionalSectionId(null) === null && optionalSectionId(undefined) === null && optionalSectionId(2) === 2);
check("optional: un valore sbagliato resta un errore", (await throws(() => optionalSectionId("x"))) !== null);

section("Common Spaces — la sala e' di una sezione");
{
  const { repo, calls } = rec();
  const d = { commonSpacesRepository: repo };
  await getBookings({ space: "cinema", sectionId: 2 }, d);
  check("getBookings passa la sezione", calls[0].name === "bookings" && calls[0].args[0] === "cinema" && calls[0].args[1] === 2);
  await bookSpace({ space: "music", day: 1, start: 60, end: 120, name: "x", sectionId: 3 }, d);
  check("bookSpace passa la sezione", calls[1].args[0].sectionId === 3 && calls[1].args[0].space === "music");
  await clearBooking({ space: "cinema", id: "5", sectionId: 3 }, d);
  check("clearBooking passa la sezione", calls[2].args[0].sectionId === 3);
  await adminBookAsDirezione({ space: "cinema", day: 1, start: 60, end: 120, sectionId: 4 }, d);
  check("adminBookAsDirezione passa la sezione", calls[3].args[0].sectionId === 4);
  await adminSetSpaceChiuso({ space: "cinema", chiuso: true, sectionId: 4 }, d);
  check("adminSetSpaceChiuso passa la sezione", calls[4].args[0].sectionId === 4 && calls[4].args[0].chiuso === true);
  await adminGetSpacesOverview({ sectionId: 4 }, d);
  await adminGetSpacesOverview({}, d);
  check("panoramica: la sezione, o null = tutte", calls[5].args[0] === 4 && calls[6].args[0] === null);
  for (const [nome, fn] of [
    ["getBookings", () => getBookings({ space: "cinema" }, d)],
    ["bookSpace", () => bookSpace({ space: "cinema", day: 1, start: 60, end: 120, name: "x" }, d)],
    ["clearBooking", () => clearBooking({ space: "cinema", id: "1" }, d)],
    ["adminBookAsDirezione", () => adminBookAsDirezione({ space: "cinema", day: 1, start: 60, end: 120 }, d)],
    ["adminSetSpaceChiuso", () => adminSetSpaceChiuso({ space: "cinema", chiuso: true }, d)],
  ]) {
    const before = calls.length;
    check(`${nome} senza sezione: rifiutata, nessuna chiamata`, (await throws(fn))?.message === "sezione mancante" && calls.length === before);
  }
}

section("Conference Room — l'agenda e' di una sezione");
{
  const { repo, calls } = rec();
  const d = { conferenceRepository: repo };
  await getAgenda({ giorni: 10, sectionId: 2 }, d);
  check("agenda: giorni e sezione", calls[0].name === "agenda" && calls[0].args[0] === 10 && calls[0].args[1] === 2);
  await listRules({ sectionId: 2 }, d);
  check("regole: la sezione", calls[1].name === "rules" && calls[1].args[0] === 2);
  await addRule({ titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-01-01", al: "2026-01-01", attore: "a", sectionId: 5 }, d);
  check("addRule passa la sezione", calls[2].args[0].sectionId === 5);
  check("senza sezione: rifiutate", (await throws(() => getAgenda({ giorni: 10 }, d))) !== null && (await throws(() => listRules({}, d))) !== null && (await throws(() => addRule({ titolo: "x", inizio: "10:00", fine: "11:00", dal: "2026-01-01", al: "2026-01-01" }, d))) !== null && calls.length === 3);
}

section("Tema e cambio biancheria — per sezione");
{
  const t = rec({ ok: true });
  const r = await getTheme({ sectionId: 2 }, { themeRepository: { get: async (s) => { t.calls.push(s); return "natale"; } } });
  check("tema: lettura per sezione", r.tema === "natale" && t.calls[0] === 2);
  await setTheme({ tema: "natale", sectionId: 2 }, { themeRepository: t.repo });
  check("tema: scrittura per sezione", t.calls.at(-1).name === "set" && t.calls.at(-1).args[0] === "natale" && t.calls.at(-1).args[1] === 2);
  check("tema senza sezione: rifiutato", (await throws(() => setTheme({ tema: "natale" }, { themeRepository: t.repo }))) !== null && (await throws(() => getTheme({}, { themeRepository: t.repo }))) !== null);

  const l = rec();
  const d = { linenChangeRepository: l.repo };
  await getLinenChangeAnchor({ sectionId: 2 }, d);
  await setLinenChangeAnchor({ data: "2026-09-15", tipo: "grande", sectionId: 2 }, d);
  await setLinenChangeSkip({ data: "2026-09-15", salta: true, sectionId: 2 }, d);
  check("cambio biancheria: ogni chiamata porta la sezione", l.calls.map((c) => (typeof c.args[0] === "object" ? c.args[0].sectionId : c.args[0])).join() === "2,2,2");
  check("senza sezione: rifiutato", (await throws(() => setLinenChangeAnchor({ data: "2026-09-15", tipo: "grande" }, d))) !== null && (await throws(() => setLinenChangeSkip({ data: "2026-09-15", salta: true }, d))) !== null && (await throws(() => getLinenChangeAnchor({}, d))) !== null);
}

section("Grigliata — l'evento e' di una sezione");
{
  const g = rec({ ok: true, id: 1 });
  const futuro = new Date(Date.now() + 3600_000).toISOString();
  const giorno = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const menu = [{ nome: "Carne", ticket: [{ nome: "Panino" }] }];
  await adminCreaEvento({ titolo: "x", scadenza: futuro, giornoEvento: giorno, paypalLink: "p", satispayLink: "", menu, attore: "a", sectionId: 2 }, { grigliataRepository: g.repo });
  check("creazione: la sezione arriva al repository", g.calls[0].args[0].sectionId === 2);
  check("creazione senza sezione: rifiutata", (await throws(() => adminCreaEvento({ titolo: "x", scadenza: futuro, giornoEvento: giorno, paypalLink: "p", satispayLink: "", menu, attore: "a" }, { grigliataRepository: g.repo }))) !== null);
  await grigliataOverview({ sectionId: 2 }, { grigliataRepository: g.repo });
  check("panoramica: la sezione", g.calls.at(-1).name === "adminOverview" && g.calls.at(-1).args[0] === 2);
  check("panoramica senza sezione: rifiutata", (await throws(() => grigliataOverview({}, { grigliataRepository: g.repo }))) !== null);
}

section("Ops e Notifiche — della sezione (null = tutte)");
{
  const o = rec();
  const d = { opsRepository: o.repo };
  await listRecurringRules({ sectionId: 2 }, d); await listRecurringRules({}, d);
  check("ricorrenti: la sezione, o tutte", o.calls[0].args[0] === 2 && o.calls[1].args[0] === null);
  await applyRecurringRules({ offset: 1, sectionId: 2 }, d);
  check("applica: offset e sezione", o.calls[2].args[0].offset === 1 && o.calls[2].args[0].sectionId === 2);
  await purgeData({ scope: "prenotazioni", sectionId: 2 }, d); await purgeData({ scope: "settimana" }, d);
  check("pulizia: la sezione, o tutte", o.calls[3].args[0].sectionId === 2 && o.calls[4].args[0].sectionId === null);
  await getCounts({ sectionId: 3 }, d);
  check("conteggi: la sezione", o.calls[5].args[0] === 3);
  check("un valore sbagliato e' un errore, non 'tutte'", (await throws(() => purgeData({ scope: "tutto", sectionId: "x" }, d))) !== null && (await throws(() => getCounts({ sectionId: 0 }, d))) !== null);

  const n = rec({ ok: true });
  await adminListPushSubs({ sectionId: 2 }, { notificationsRepository: n.repo });
  await adminListTelegramSubs({ sectionId: 2 }, { notificationsRepository: n.repo });
  await adminListPushSubs({}, { notificationsRepository: n.repo });
  check("iscrizioni: per sezione, o tutte", n.calls[0].args[0] === 2 && n.calls[1].args[0] === 2 && n.calls[2].args[0] === null);

  const subs = []; const chats = [];
  const repoB = { async allPushSubs(a) { subs.push(a); return []; }, async allTelegramSubs(a) { chats.push(a); return []; }, async prunePushSubs() {} };
  const dep = { notificationsRepository: repoB, pushSender: { configured: () => true, send: async () => "ok" }, telegramSender: { configured: () => true, send: async () => "ok" }, checkRateLimit: async () => true };
  await adminBroadcast({ actor: "a", title: "t", body: "b", room: "", sectionId: 2 }, dep);
  check("broadcast: il filtro di sezione arriva a push e Telegram", subs[0].sectionId === 2 && chats[0].sectionId === 2 && subs[0].room === null);
  await adminBroadcast({ actor: "a", title: "t", body: "b", room: "p5", sectionId: 2 }, dep);
  check("broadcast a una camera: camera canonica + sezione", subs[1].room === "P5" && subs[1].sectionId === 2);
  await adminBroadcast({ actor: "a", title: "t", body: "b" }, dep);
  check("broadcast senza sezione (superadmin): tutte", subs[2].sectionId === null);
}

section("Bici — il reset annuale di una sezione");
{
  const eliminate = [];
  const repoBici = {
    async purge() { return { ok: true, tutte: true }; },
    async adminList() { return { ok: true, camere: [{ room: "V112" }, { room: "P5" }, { room: "P7" }, { room: "M3" }] }; },
    async deleteRoom(r) { eliminate.push(r); return { deleted: true }; },
  };
  const tutte = await adminPurgeBikes({}, { bikeRepository: repoBici });
  check("senza sezione: bike_purge() (tutte)", tutte.tutte === true && eliminate.length === 0);
  const res = await adminPurgeBikes({ sectionCode: "P" }, { bikeRepository: repoBici });
  check("con sezione: solo le camere di quella lettera, una per una", eliminate.join() === "P5,P7" && res.cancellate === 2);
}

section("Account — una sezione per account, tranne il superadmin");
{
  check("parseAccountSection: ruoli di sezione richiedono la sezione", parseAccountSection("admin", 2) === 2 && parseAccountSection("fdo", "3") === 3 && parseAccountSection("delegato", 1) === 1);
  check("... e senza sezione e' un errore", (await throws(() => parseAccountSection("fdo", null)))?.message === "indica la sezione" && (await throws(() => parseAccountSection("admin", undefined))) !== null);
  check("superadmin: nessuna sezione", parseAccountSection("superadmin", null) === null && parseAccountSection("superadmin", undefined) === null);
  check("superadmin con una sezione: errore", (await throws(() => parseAccountSection("superadmin", 1))) !== null);
  check("ruolo sconosciuto (sistemista, staff): errore", (await throws(() => parseAccountSection("sistemista", 1))) !== null && (await throws(() => parseAccountSection("staff", 1))) !== null);
  const a = rec({ ok: true, id: 7 });
  const hasher = { hashPassword: (p) => "hash:" + p };
  await createAccount({ username: " mario ", password: "Password-123", ruolo: "fdo", attore: "boss", sectionId: "2" }, { accountRepository: a.repo, hasher });
  check("createAccount passa la sezione numerica", a.calls[0].args[0].sectionId === 2 && a.calls[0].args[0].username === "mario");
  await createAccount({ username: "boss2", password: "Password-123", ruolo: "superadmin", attore: "boss" }, { accountRepository: a.repo, hasher });
  check("createAccount superadmin: sezione nulla", a.calls[1].args[0].sectionId === null);
  check("createAccount fdo senza sezione: errore, nessuna scrittura", (await throws(() => createAccount({ username: "x1x", password: "Password-123", ruolo: "fdo", attore: "b" }, { accountRepository: a.repo, hasher }))) !== null && a.calls.length === 2);
  await setAccountSection({ id: "3", sectionId: "4" }, { accountRepository: a.repo });
  check("setAccountSection: id e sezione numerici", a.calls[2].name === "setSection" && a.calls[2].args[0].id === 3 && a.calls[2].args[0].sectionId === 4);
  check("setAccountSection senza sezione: errore", (await throws(() => setAccountSection({ id: 3 }, { accountRepository: a.repo }))) !== null);
}

console.log(`\nPASSATI: ${pass}   FALLITI: ${fail}`);
process.exit(fail ? 1 : 0);
