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
import { logAdminAction } from "../../src/shared/audit/auditLog.js";
import { wrapHandler } from "../../src/shared/errors/wrapHandler.js";
import { ACTIONS, MUTATIONS, ActionRefused } from "./_actions/index.js";
import { checkAccountRules } from "./_guards.js";

import {
  currentAdmin, accountByUsername, clearSessionCookie, sessioneAncoraValida,
  authorize as identityAuthorize, isSuperadmin,
} from "../../src/modules/identity/index.js";
import { authorize as laundryAuthorize } from "../../src/modules/laundry/index.js";
import { authorize as commonSpacesAuthorize } from "../../src/modules/common-spaces/index.js";
import {
  authorize as sectionsAuthorize, getConfig as getSectionConfig, scopeDecision, filterByScope, checkResourceActors,
} from "../../src/modules/sections/index.js";
import { authorize as themeAuthorize } from "../../src/modules/theme/index.js";
import { authorize as linenChangeAuthorize } from "../../src/modules/linen-change/index.js";
import { authorize as notificationsAuthorize } from "../../src/modules/notifications/index.js";
import { authorize as bikesAuthorize } from "../../src/modules/bikes/index.js";
import { authorize as feedbackAuthorize } from "../../src/modules/feedback/index.js";
import { authorize as conferenceAuthorize } from "../../src/modules/conference-room/index.js";
import { authorize as opsAuthorize } from "../../src/modules/ops/index.js";
import { authorize as grigliataAuthorize } from "../../src/modules/grigliata/index.js";

/**
 * Prova ogni modulo finché uno non riconosce l'azione come propria.
 * `false` = negato da chi possiede l'azione; `true` = concesso; `undefined`
 * = nessun modulo la reclama (l'azione probabilmente non esiste nemmeno —
 * lo scoprirà la ricerca in ACTIONS più sotto con "azione sconosciuta").
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

  const refusal = await checkAccountRules({ action, body, superadmin, A, config });
  if (refusal) return json(res, refusal.status, { ok: false, error: refusal.error });

  const handler = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!handler) return fail(res, "azione sconosciuta");

  let result;
  try {
    result = await handler({ body, me, A, R, plan, config });
  } catch (err) {
    if (err instanceof ActionRefused) return fail(res, err.message);
    throw err;
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
    }); // fire-and-forget, di proposito — le azioni che finiscono nel log sono in MUTATIONS (_actions/index.js)
  }

  return json(res, 200, result);
}, { exposeInternalErrors: true });
