// Operazioni del pannello amministrativo.
//
// Ogni azione passa da currentAdmin(): senza cookie valido si esce con 401
// prima di toccare il database.
//
// L'autorizzazione per-azione non vive più in due Set() centrali
// (SOLO_SISTEMISTA/VIETATE_A_STAFF) mantenuti a mano qui: ogni modulo
// possiede la policy delle proprie azioni tramite la propria authorize()
// (vedi refactor-enterprise/ARCHITETTURA-ENTERPRISE.md, audit finding #3).
// Un'azione nuova non finisce esposta per dimenticanza: se il modulo che la
// possiede non decide la sua policy, authorizeAction() la lascia semplicemente
// non riconosciuta, e non è questo il file dove si decide se un'azione è
// permessa o no.
//
// Allo stesso motivo, la validazione dei campi numerici non passa più dal
// dizionario LIMITI condiviso fra domini migrati e non (audit finding #4):
// ogni modulo valida i propri (day/slot in Laundry, day/start/end in Common
// Spaces, giorno in Conference Room, id ovunque serva...).

import { readBody, json, fail, methodOk } from "../_lib/http.js";
import { sectionCodeOf } from "../../src/shared/validation/room.js";
import { logAdminAction } from "../../src/shared/audit/auditLog.js";
import { wrapHandler } from "../../src/shared/errors/wrapHandler.js";

import {
  currentAdmin, accountByUsername, clearSessionCookie, sessioneAncoraValida,
  authorize as identityAuthorize,
  listAccounts, createAccount, resetAccountPassword, setAccountActive, setAccountCamera, setAccountSection, deleteAccount,
  isSuperadmin,
  changeOwnPassword,
} from "../../src/modules/identity/index.js";
import {
  authorize as laundryAuthorize,
  adminWeek, adminSetMachineStatus, adminDeleteBooking, adminForceBook,
  adminBookAsDirezione, adminClearAsDirezione, adminAddRecurringRule,
} from "../../src/modules/laundry/index.js";
import {
  authorize as commonSpacesAuthorize,
  adminGetSpacesOverview, adminDeleteSpaceBooking,
  adminBookAsDirezione as adminBookSpaceAsDirezione,
  adminAddRecurringRule as adminAddSpaceRecurringRule,
  adminSetSpaceChiuso,
} from "../../src/modules/common-spaces/index.js";
import {
  authorize as sectionsAuthorize, getConfig as getSectionConfig, scopeDecision, filterByScope,
  adminCreateSection, adminUpdateSection, adminSetRanges, adminCreateLaundry, adminUpdateLaundry,
  adminSetSharing, adminSetRangeStyle, checkResourceActors, sampleRoomForLaundry, sectionIdOfCode,
} from "../../src/modules/sections/index.js";
import { authorize as themeAuthorize, getTheme, setTheme } from "../../src/modules/theme/index.js";
import {
  authorize as linenChangeAuthorize, getLinenChangeAnchor, setLinenChangeAnchor, setLinenChangeSkip,
} from "../../src/modules/linen-change/index.js";
import {
  authorize as notificationsAuthorize,
  adminListPushSubs, adminDeletePushSub, adminListTelegramSubs, adminDeleteTelegramSub, adminBroadcast,
} from "../../src/modules/notifications/index.js";
import {
  authorize as bikesAuthorize,
  adminListBikes, adminPurgeBikes, adminDeleteBikeRoom, adminAddBikeRoom,
} from "../../src/modules/bikes/index.js";
import {
  authorize as feedbackAuthorize,
  adminListFeedback, adminMarkFeedback,
} from "../../src/modules/feedback/index.js";
import {
  authorize as conferenceAuthorize,
  listRules as conferenceListRules, addRule as conferenceAddRule, updateRule as conferenceUpdateRule,
  skipOccurrence as conferenceSkipOccurrence, moveOccurrence as conferenceMoveOccurrence,
  resetOccurrence as conferenceResetOccurrence, deleteRule as conferenceDeleteRule,
} from "../../src/modules/conference-room/index.js";
import {
  authorize as opsAuthorize,
  getOverview, listRecurringRules, setRecurringRuleActive, deleteRecurringRule,
  applyRecurringRules, purgeData, getCounts,
} from "../../src/modules/ops/index.js";
import {
  authorize as grigliataAuthorize,
  adminCreaEvento, adminOverview as grigliataAdminOverview,
  adminConfermaPagamento, adminAnnullaConfermaPagamento, adminRipristinaTicket, adminChiudiEvento, adminModificaEvento,
  adminAggiungiAdesione, adminRimuoviAdesione,
  adminRiapriEvento, adminEliminaEvento, adminImpostaPagamenti, adminImpostaQuota,
} from "../../src/modules/grigliata/index.js";

// Le azioni che modificano qualcosa finiscono nell'audit log. Le letture no,
// sarebbero solo rumore.
const MUTATIONS = new Set([
  "setMachineStatus", "deleteBooking", "forceBook",
  "markFeedback", "deleteSpaceBooking", "spaceSetChiuso",
  "recurringAddLaundry", "recurringAddSpace", "recurringSetActive",
  "recurringDelete", "applyRecurring", "purge",
  "deletePushSub", "deleteTelegramSub", "broadcastPush",
  "bookDirezione", "bookSpaceDirezione", "clearDirezione",
  "conferenzaAdd", "conferenzaUpdate", "conferenzaDelete",
  "conferenzaSkip", "conferenzaMove", "conferenzaResetOccorrenza",
  "accountCreate", "accountSetPassword", "accountSetActive", "accountDelete", "accountSetCamera", "accountSetSection",
  "sectionCreate", "sectionUpdate", "sectionSetRanges", "sectionSetSharing", "sectionSetRangeStyle", "laundryCreate", "laundryUpdate",
  "accountChangeOwnPassword", "biciPurge", "biciDeleteRoom", "biciAddRoom", "temaSet",
  "cambioBiancheriaSet", "cambioBiancheriaSkip",
  "grigliataCrea", "grigliataConfermaPagamento", "grigliataAnnullaConfermaPagamento", "grigliataChiudi", "grigliataModifica",
  "grigliataAggiungiAdesione", "grigliataRimuoviAdesione", "grigliataRiapri", "grigliataElimina",
  "grigliataPagamenti", "grigliataQuota", "grigliataRipristinaTicket",
]);

/**
 * Prova ogni modulo finché uno non riconosce l'azione come propria.
 * `false` = negato da chi possiede l'azione; `true` = concesso; `undefined`
 * = nessun modulo la reclama (l'azione probabilmente non esiste nemmeno —
 * lo scoprirà lo switch più sotto con "azione sconosciuta").
 */
function authorizeAction(me, action) {
  return identityAuthorize(me, action)
    ?? laundryAuthorize(me, action)
    ?? commonSpacesAuthorize(me, action)
    ?? themeAuthorize(me, action)
    ?? linenChangeAuthorize(me, action)
    ?? notificationsAuthorize(me, action)
    ?? bikesAuthorize(me, action)
    ?? feedbackAuthorize(me, action)
    ?? conferenceAuthorize(me, action)
    ?? grigliataAuthorize(me, action)
    ?? opsAuthorize(me, action)
    ?? sectionsAuthorize(me, action);
}

export default wrapHandler("admin/data", async (req, res) => {
  if (!methodOk(req, res, ["POST"])) return;

  // Header applicativo, contro il CSRF.
  //
  // Un modulo HTML da un altro sito puo' fare POST qui portandosi dietro i
  // cookie, ma NON puo' impostare un header inventato: servirebbe fetch/XHR, e
  // li' scatta il preflight CORS che questa API non concede. Un header custom
  // e' quindi una prova che la richiesta viene dal nostro codice.
  //
  // La difesa vera resta SameSite=Strict sul cookie di sessione, che da sola
  // basterebbe. Ma il client questo header lo mandava GIA' — api.ts e
  // AdminPanel.tsx — e nessuno lo guardava: sembrava una protezione e non lo
  // era. O si verifica o si toglie; verificarlo costa tre righe.
  if (req.headers["x-requested-with"] !== "admin") {
    return json(res, 400, { ok: false, error: "richiesta non riconosciuta" });
  }

  const me = currentAdmin(req);
  if (!me) return json(res, 401, { ok: false, error: "non autenticato" });

  const body = readBody(req);
  const action = String(body.action || "");

  // Primo controllo, sul ruolo del cookie: scarta subito il banale. Il
  // controllo che conta e' quello ripetuto piu' sotto sul ruolo della RIGA.
  if (authorizeAction(me, action) === false) {
    return json(res, 403, { ok: false, error: "permesso negato" });
  }

  // Lo stato dell'account, riletto a ogni azione. Serve a tre controlli, ed e'
  // una lettura sola per tutti: la sessione e' ancora valida, c'e' una password
  // provvisoria da cambiare, e — nuovo con le sezioni — qual e' il RUOLO e la
  // SEZIONE attuali dell'account.
  //
  // `rowLetta` distingue "il database non ha risposto" da "l'account non c'e'
  // piu'": il primo caso lascia passare (ogni azione qui sotto finisce comunque
  // sul database, e con il database muto fallisce da sola), il secondo no.
  let row;
  let rowLetta = true;
  try {
    row = await accountByUsername(me.u);
  } catch {
    rowLetta = false;
  }

  // 1. Sessione revocata: l'account e' stato disattivato o eliminato mentre il
  //    cookie era ancora in giro (il token dura 12 ore e verifica solo firma e
  //    scadenza).
  if (rowLetta && !sessioneAncoraValida(row)) {
    clearSessionCookie(res);
    return json(res, 401, { ok: false, error: "sessione non piu' valida" });
  }

  // 2. Chi ha ancora la password provvisoria non puo' fare altro che cambiarla:
  //    il pannello lo impedisce con una schermata, ma `curl` parla a questo
  //    endpoint direttamente.
  if (action !== "accountChangeOwnPassword" && Boolean(row?.deve_cambiare_password)) {
    return json(res, 403, {
      ok: false,
      error: "cambia la password provvisoria prima di continuare",
      deve_cambiare_password: true,
    });
  }

  // 3. Ruolo e sezione dalla RIGA, non dal cookie: promuovere, degradare o
  //    spostare un account ha effetto subito, non alla scadenza del token.
  const ruolo = row?.ruolo ?? me.r;
  const claims = { ...me, r: ruolo };
  if (authorizeAction(claims, action) === false) {
    return json(res, 403, { ok: false, error: "permesso negato" });
  }
  const superadmin = isSuperadmin(claims);

  // ── Ambito per sezione ────────────────────────────────────────────────
  // Il ruolo (cosa puo' fare) e' deciso; qui si decide su QUALE sezione, e
  // si ricavano la sezione che agisce (A), quella che possiede la risorsa
  // (R, condivisioni incluse) e i controlli "per id" da eseguire.
  const who = { role: ruolo, sectionId: row?.section_id ?? null };
  const config = await getSectionConfig();
  const plan = scopeDecision(who, action, body, config);
  if (!plan.allowed) {
    return json(res, plan.status ?? 403, { ok: false, error: plan.status === 400 ? plan.reason : `permesso negato: ${plan.reason}` });
  }
  const A = plan.actingSectionId;          // null = superadmin senza sezione scelta
  const R = plan.resourceSectionId ?? null;
  for (const c of plan.checks) {
    await checkResourceActors({ kind: c.kinds, id: c.id, actingSectionId: A });
  }

  // ── Regole sugli account ──────────────────────────────────────────────
  // Un admin gestisce SOLO gli account fdo e delegato della propria sezione:
  // mai un altro admin, mai un superadmin (altrimenti reimposterebbe la
  // password di chi sta sopra e lo diventerebbe). Il superadmin gestisce tutti.
  const TOCCA_ACCOUNT = new Set(["accountSetPassword", "accountSetActive", "accountDelete", "accountSetCamera", "accountSetSection"]);
  const RUOLI_GESTIBILI_DA_ADMIN = new Set(["fdo", "delegato"]);
  if (action === "accountSetSection" && !superadmin) {
    return json(res, 403, { ok: false, error: "permesso negato: solo un superadmin sposta un account di sezione" });
  }
  if (action === "accountCreate" && !superadmin) {
    if (!RUOLI_GESTIBILI_DA_ADMIN.has(String(body.ruolo || ""))) {
      return json(res, 403, { ok: false, error: "permesso negato: un admin crea solo account fdo e delegato" });
    }
  }
  let targetAccount = null;
  if (TOCCA_ACCOUNT.has(action)) {
    const elenco = await listAccounts();
    targetAccount = (elenco?.items ?? []).find((a) => a.id === Number(body.id)) ?? null;
    if (!targetAccount) return json(res, 400, { ok: false, error: "account non trovato" });
    if (!superadmin && (targetAccount.section_id !== A || !RUOLI_GESTIBILI_DA_ADMIN.has(targetAccount.ruolo))) {
      return json(res, 403, { ok: false, error: "permesso negato: account fuori dalla tua sezione o di un ruolo superiore" });
    }
  }
  // La camera associata a un account deve stare nella sezione dell'account.
  if (action === "accountSetCamera" && String(body.camera ?? "").trim() !== "") {
    const sidCamera = sectionIdOfCode(config, sectionCodeOf(body.camera));
    if (sidCamera === null || sidCamera !== targetAccount.section_id) {
      return json(res, 400, { ok: false, error: "la camera deve essere della sezione dell'account" });
    }
  }
  // Attivare o disattivare una sezione intera e' del superadmin.
  if (action === "sectionUpdate" && body.active !== undefined && !superadmin) {
    return json(res, 403, { ok: false, error: "permesso negato: solo un superadmin attiva o disattiva una sezione" });
  }
  // Un broadcast "a una camera" non puo' uscire dalla sezione dell'admin.
  if (action === "broadcastPush" && A !== null && String(body.room ?? "").trim() !== "" &&
      sectionIdOfCode(config, sectionCodeOf(body.room)) !== A) {
    return json(res, 403, { ok: false, error: "permesso negato: camera di un'altra sezione" });
  }

  let result;

  switch (action) {
    // ── Letture ──────────────────────────────────────────────────────────
    case "overview":
      result = await getOverview();
      break;

    case "week":
      result = await adminWeek({ laundryId: body.laundry_id, offset: body.offset });
      break;

    case "feedback":
      result = await adminListFeedback({ onlyOpen: body.only_open, limit: body.limit, sectionIds: plan.scopeIds });
      break;

    // La panoramica delle sale: cinema e musica possono avere proprietari
    // diversi (si condividono separatamente), quindi si uniscono.
    case "spaces": {
      const ids = plan.spaceSectionIds ?? [null];
      const parti = await Promise.all(ids.map((id) => adminGetSpacesOverview(id)));
      result = { ok: true, items: parti.flatMap((p) => p?.items ?? []) };
      break;
    }

    case "spaceSetChiuso":
      result = await adminSetSpaceChiuso({ space: body.space, chiuso: body.chiuso, sectionId: R });
      break;

    // ── Scritture ────────────────────────────────────────────────────────
    case "setMachineStatus":
      // Il fuori servizio rende lo stato visibile a tutti, ma NON blocca le
      // prenotazioni: chi prenota vede un avviso e decide.
      result = await adminSetMachineStatus({ room: body.room, machine: body.machine, oos: body.oos });
      break;

    case "deleteBooking":
      result = await adminDeleteBooking({ id: body.id, sectionIds: plan.scopeIds });
      break;

    case "forceBook":
      result = await adminForceBook({
        laundryId: body.laundry_id, day: body.day, slot: body.slot,
        machine: body.machine, room: body.room,
      });
      break;

    case "markFeedback":
      result = await adminMarkFeedback({ id: body.id, handled: body.handled, sectionIds: plan.scopeIds });
      break;

    case "deleteSpaceBooking":
      result = await adminDeleteSpaceBooking({ id: body.id });
      break;

    // ── Azioni a nome della DIREZIONE, usate dall'app principale ─────────
    case "bookDirezione":
      result = await adminBookAsDirezione({ laundryId: body.laundry_id, day: body.day, slot: body.slot, machine: body.machine });
      break;

    case "bookSpaceDirezione":
      result = await adminBookSpaceAsDirezione({
        space: body.space, day: body.day, start: body.start, end: body.end, type: body.type, sectionId: R,
      });
      break;

    // Liberare un turno, compresi quelli della DIREZIONE che dal percorso
    // pubblico sono protetti. `p_as_admin: true` si può scrivere qui e solo
    // qui: currentAdmin() ha già verificato il cookie in cima all'handler.
    //
    // Se chi agisce e' la Direzione (room = "DIREZIONE") la SQL non saprebbe
    // di quale lavanderia si parla (ricadrebbe sul Valentino): il client manda
    // `laundry_id`, e qui si passa una camera qualsiasi di quella lavanderia.
    case "clearDirezione": {
      const room = String(body.room ?? "") === "DIREZIONE"
        ? sampleRoomForLaundry(config, plan.laundryId, A)
        : body.room;
      result = await adminClearAsDirezione({ room, day: body.day, slot: body.slot, machine: body.machine });
      break;
    }

    // ── Sala polivalente (della sezione, o di quella che la condivide) ───
    case "conferenzaList":
      result = await conferenceListRules(R);
      break;

    case "conferenzaAdd":
      result = await conferenceAddRule({
        titolo: body.titolo, inizio: body.inizio, fine: body.fine, dal: body.dal, al: body.al,
        giorno: body.giorno, note: body.note, attore: me.u, sectionId: R,
      });
      break;

    case "conferenzaUpdate":
      result = await conferenceUpdateRule({
        id: body.id, titolo: body.titolo, inizio: body.inizio, fine: body.fine,
        dal: body.dal, al: body.al, giorno: body.giorno, note: body.note,
      });
      break;

    // ── Un singolo incontro di una serie ricorrente ──────────────────────
    // `data` è la data che la REGOLA produce (RECURRENCE-ID), non quella a
    // cui l'incontro si vede: è il suo nome per sempre, anche dopo che è
    // stato spostato.
    case "conferenzaSkip":
      result = await conferenceSkipOccurrence({ id: body.id, data: body.data, attore: me.u });
      break;

    case "conferenzaMove":
      result = await conferenceMoveOccurrence({
        id: body.id, data: body.data, nuovaData: body.nuova_data,
        inizio: body.inizio, fine: body.fine, titolo: body.titolo, note: body.note, attore: me.u,
      });
      break;

    case "conferenzaResetOccorrenza":
      result = await conferenceResetOccurrence({ id: body.id, data: body.data });
      break;

    case "conferenzaDelete":
      result = await conferenceDeleteRule(body.id);
      break;

    // ── Account ──────────────────────────────────────────────────────────
    case "accountList":
      result = await listAccounts();
      break;

    case "accountCreate": {
      const password = String(body.password || "");
      if (password.length < 8) return fail(res, "la password deve avere almeno 8 caratteri");
      const ruoloNuovo = String(body.ruolo || "");
      // Un admin crea sempre nella propria sezione; il superadmin sceglie
      // (section_id) — tranne per un altro superadmin, che non ne ha.
      const sezione = ruoloNuovo === "superadmin" ? null : (A ?? body.section_id ?? null);
      result = await createAccount(String(body.username || "").trim(), password, ruoloNuovo, me.u, sezione);
      break;
    }

    case "accountSetPassword": {
      const password = String(body.password || "");
      if (password.length < 8) return fail(res, "la password deve avere almeno 8 caratteri");
      result = await resetAccountPassword(Number(body.id), password);
      break;
    }

    case "accountSetActive":
      result = await setAccountActive(Number(body.id), body.attivo !== false);
      break;

    case "accountSetCamera":
      result = await setAccountCamera(Number(body.id), body.camera);
      break;

    case "accountSetSection":
      result = await setAccountSection(Number(body.id), body.section_id);
      break;

    case "accountDelete":
      result = await deleteAccount(Number(body.id));
      break;

    // Il titolare cambia la propria password: nessun ruolo richiesto oltre
    // all'essere autenticato.
    case "accountChangeOwnPassword": {
      const attuale = String(body.password_attuale || "");
      const nuova = String(body.password_nuova || "");
      result = await changeOwnPassword(me.u, attuale, nuova);
      break;
    }

    // ── Ricorrenti, pulizia, conteggi: della sezione (superadmin: tutte) ──
    case "recurringList":
      result = await listRecurringRules(A);
      break;

    case "recurringAddLaundry":
      result = await adminAddRecurringRule({
        laundryId: body.laundry_id, day: body.day, slot: body.slot,
        machine: body.machine, room: body.room, note: body.note,
      });
      break;

    case "recurringAddSpace":
      result = await adminAddSpaceRecurringRule({
        spaceId: body.space_id, day: body.day, start: body.start, end: body.end,
        name: body.name, type: body.type, note: body.note,
      });
      break;

    case "recurringSetActive":
      result = await setRecurringRuleActive({ id: body.id, active: body.active });
      break;

    case "recurringDelete":
      result = await deleteRecurringRule(body.id);
      break;

    case "applyRecurring":
      result = await applyRecurringRules(body.offset, A);
      break;

    case "purge":
      result = await purgeData({ scope: body.scope, sala: body.sala, sectionId: A });
      break;

    case "counts":
      result = await getCounts(A);
      break;

    // ── Notifiche ────────────────────────────────────────────────────────
    case "pushSubs":
      result = await adminListPushSubs(A);
      break;

    case "deletePushSub":
      result = await adminDeletePushSub(body.id);
      break;

    case "telegramSubs":
      result = await adminListTelegramSubs(A);
      break;

    case "deleteTelegramSub":
      result = await adminDeleteTelegramSub(body.id);
      break;

    case "broadcastPush":
      result = await adminBroadcast({ actor: me.u, title: body.title, body: body.body, room: body.room, sectionId: A });
      break;

    // ── Tema e cambio biancheria (della sezione, o di quella che li condivide)
    case "temaGet":
      result = await getTheme(R);
      break;

    case "temaSet":
      result = await setTheme(body.tema, R);
      break;

    case "cambioBiancheriaGet":
      result = await getLinenChangeAnchor(R);
      break;

    case "cambioBiancheriaSet":
      result = await setLinenChangeAnchor(body.ancora_data, body.ancora_tipo, R);
      break;

    case "cambioBiancheriaSkip":
      result = await setLinenChangeSkip(body.data, body.salta, R);
      break;

    // ── Grigliata (della sezione, o di quella che la condivide) ──────────
    case "grigliataCrea":
      result = await adminCreaEvento({
        titolo: body.titolo, scadenza: body.scadenza, giornoEvento: body.giorno_evento,
        paypalLink: body.paypal_link, satispayLink: body.satispay_link,
        menu: body.menu, pagamentiAttivi: body.pagamenti_attivi, quota: body.quota, attore: me.u,
        sectionId: R,
      });
      break;

    case "grigliataOverview":
      result = await grigliataAdminOverview(R);
      break;

    case "grigliataConfermaPagamento":
      result = await adminConfermaPagamento(body.adesione_id, me.u);
      break;

    case "grigliataAnnullaConfermaPagamento":
      result = await adminAnnullaConfermaPagamento(body.adesione_id);
      break;

    case "grigliataRipristinaTicket":
      result = await adminRipristinaTicket(body.ticket_id);
      break;

    case "grigliataChiudi":
      result = await adminChiudiEvento(body.evento_id);
      break;

    case "grigliataModifica":
      result = await adminModificaEvento(body.evento_id, body.titolo, body.scadenza, body.giorno_evento, body.menu);
      break;

    case "grigliataAggiungiAdesione":
      result = await adminAggiungiAdesione(body.evento_id, body.room, body.menu_id, body.dieta, body.senza_glutine);
      break;

    case "grigliataRimuoviAdesione":
      result = await adminRimuoviAdesione(body.adesione_id);
      break;

    case "grigliataRiapri":
      result = await adminRiapriEvento(body.evento_id);
      break;

    case "grigliataElimina":
      result = await adminEliminaEvento(body.evento_id);
      break;

    case "grigliataPagamenti":
      result = await adminImpostaPagamenti(body.evento_id, body.attivi, body.paypal_link, body.satispay_link);
      break;

    case "grigliataQuota":
      result = await adminImpostaQuota(body.evento_id, body.quota);
      break;

    // ── Bici (per camere: la sezione e' quella della camera) ─────────────
    case "biciList":
      result = await adminListBikes();
      break;

    // Il reset annuale: di una sezione per un admin, di tutte per il superadmin
    // senza sezione scelta.
    case "biciPurge":
      result = await adminPurgeBikes(A === null ? null : (config.sections ?? []).find((s) => s.id === A)?.code ?? null);
      break;

    case "biciDeleteRoom":
      result = await adminDeleteBikeRoom(body.room);
      break;

    case "biciAddRoom":
      result = await adminAddBikeRoom(body.room);
      break;

    // ── Sezioni e lavanderie ──────────────────────────────────────────────
    case "sectionList":
      result = await getSectionConfig({ fresh: true });
      break;

    case "sectionCreate":
      result = await adminCreateSection({
        code: body.code, number: body.number, name: body.name, features: body.features, ranges: body.ranges,
      });
      break;

    case "sectionUpdate":
      result = await adminUpdateSection({ id: body.id, name: body.name, features: body.features, active: body.active });
      break;

    case "sectionSetSharing":
      result = await adminSetSharing({ id: body.id, shared: body.shared });
      break;

    case "sectionSetRangeStyle":
      result = await adminSetRangeStyle({ rangeId: body.range_id, label: body.label, color: body.color });
      break;

    case "sectionSetRanges":
      result = await adminSetRanges({ id: body.id, ranges: body.ranges });
      break;

    case "laundryCreate":
      result = await adminCreateLaundry({ slug: body.slug, name: body.name, pairs: body.pairs });
      break;

    case "laundryUpdate":
      result = await adminUpdateLaundry({ id: body.id, name: body.name, pairs: body.pairs });
      break;

    default:
      return fail(res, "azione sconosciuta");
  }

  // Le azioni "wide" tornano dati di tutte le sezioni: si tolgono quelli fuori
  // dalla sezione di chi chiede (no-op per il superadmin senza sezione scelta).
  result = filterByScope(action, result, plan.scopeIds, await getSectionConfig());

  if (MUTATIONS.has(action)) {
    logAdminAction({
      actor: me.u, action,
      detail: Object.fromEntries(
        Object.entries(body).filter(([k]) => k !== "action" && !k.toLowerCase().includes("password")),
      ),
    }); // fire-and-forget, di proposito — vedi commento sopra
  }

  return json(res, 200, result);
}, { exposeInternalErrors: true });
