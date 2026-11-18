// Ambito per sezione delle azioni amministrative — il modello v2.0.
//
// Un account ha un ruolo (cosa puo' fare: identity/domain/permissions.js) e,
// tranne il superadmin, UNA sezione (admin_account.section_id). Questo file
// decide dove puo' farlo: dato un'azione e il suo payload, produce un PIANO —
// su quale sezione agisce, quali risorse "per id" vanno controllate prima di
// eseguire, e se e' permessa. E' pura: nessuna rete; chi la chiama (data.js)
// esegue i controlli per id (checkResourceActors) e i filtri sul risultato.
//
// Tutte le risorse sono per-sezione (v2.0):
//  - lavanderia: per intervalli di camere (laundry_id puo' servire piu' sezioni);
//  - sale, polivalente, cambio biancheria, grigliata, tema: appartengono a UNA
//    sezione ma una sezione puo' USARE quella di un'altra (section.shared_with):
//    l'azione gira sulla sezione che POSSIEDE la risorsa — R = resourceSection(A, f);
//  - segnalazioni, bici, iscrizioni push/Telegram: per sezione della camera.
//
// Un'azione non elencata in REGOLE e' negata a chi non e' superadmin
// (default-deny: una azione nuova non e' per sbaglio aperta a tutte le sezioni).

import { isGlobalScope } from "../../identity/index.js";
import { sectionCodeOf } from "../../../shared/validation/room.js";
import {
  findSectionById, resolveRoom, resourceSection, sectionIdOfCode, sectionIdOfRange, sectionIdsOfLaundry,
} from "./config.js";

/**
 * Descrittori (per azione):
 *  - wide:      agisce su tutta la sezione A; superadmin senza sezione = tutte
 *  - laundry:   body.laundry_id (o, se serve, la lavanderia della camera) deve
 *               essere usata da A
 *  - room:      la sezione di body.room deve essere A
 *  - resource:  gira sulla risorsa `feature` che A usa (R); `featureFrom` =
 *               nome del campo che sceglie la feature (body.space -> cinema/music)
 *  - byId:      risorsa esistente nominata da un id: va controllata con
 *               checkResourceActors({ kinds, id: body[field] }) — A deve essere
 *               fra chi puo' agire (proprietario o sezioni che la condividono)
 *  - section:   body.id e' la sezione A (superadmin: qualunque)
 *  - range:     body.range_id appartiene alla sezione A
 *  - account:   regole sugli account, in data.js
 *  - any:       nessun bersaglio
 *
 * Piu' descrittori in un array = tutti devono valere.
 */
export const REGOLE = Object.freeze({
  // — su tutta la sezione —
  overview: "wide", feedback: "wide", markFeedback: "wide", deleteBooking: "wide", biciList: "wide",
  recurringList: "wide", applyRecurring: "wide", purge: "wide", counts: "wide",
  pushSubs: "wide", telegramSubs: "wide", broadcastPush: "wide", sectionList: "wide",
  // — lavanderia —
  week: ["laundry"], bookDirezione: ["laundry"], laundryUpdate: ["laundry"],
  forceBook: ["laundry", "roomInLaundry"], recurringAddLaundry: ["laundry", "roomInLaundry"],
  setMachineStatus: ["laundry"], clearDirezione: ["laundry"],
  // — camere (bici) —
  biciAddRoom: ["room"], biciDeleteRoom: ["room"],
  // — sale comuni —
  spaces: [{ resource: "spaces" }], spaceSetChiuso: [{ resource: "space" }], bookSpaceDirezione: [{ resource: "space" }],
  deleteSpaceBooking: [{ byId: ["space_booking"], field: "id" }],
  recurringAddSpace: [{ byId: ["room_space"], field: "space_id" }],
  recurringSetActive: [{ byId: ["recurring_space", "recurring_laundry"], field: "id" }],
  recurringDelete: [{ byId: ["recurring_space", "recurring_laundry"], field: "id" }],
  // — sala polivalente —
  conferenzaList: [{ resource: "conference" }], conferenzaAdd: [{ resource: "conference" }],
  conferenzaUpdate: [{ byId: ["conference_event"], field: "id" }], conferenzaSkip: [{ byId: ["conference_event"], field: "id" }],
  conferenzaMove: [{ byId: ["conference_event"], field: "id" }], conferenzaResetOccorrenza: [{ byId: ["conference_event"], field: "id" }],
  conferenzaDelete: [{ byId: ["conference_event"], field: "id" }],
  // — cambio biancheria e tema —
  cambioBiancheriaGet: [{ resource: "linen" }], cambioBiancheriaSet: [{ resource: "linen" }], cambioBiancheriaSkip: [{ resource: "linen" }],
  temaGet: [{ resource: "theme" }], temaSet: [{ resource: "theme" }],
  // — grigliata —
  grigliataCrea: [{ resource: "grigliata" }], grigliataOverview: [{ resource: "grigliata" }],
  grigliataConfermaPagamento: [{ byId: ["grigliata_adesione"], field: "adesione_id" }],
  grigliataAnnullaConfermaPagamento: [{ byId: ["grigliata_adesione"], field: "adesione_id" }],
  grigliataRimuoviAdesione: [{ byId: ["grigliata_adesione"], field: "adesione_id" }],
  grigliataRipristinaTicket: [{ byId: ["grigliata_ticket"], field: "ticket_id" }],
  grigliataChiudi: [{ byId: ["grigliata_evento"], field: "evento_id" }], grigliataModifica: [{ byId: ["grigliata_evento"], field: "evento_id" }],
  grigliataRiapri: [{ byId: ["grigliata_evento"], field: "evento_id" }], grigliataElimina: [{ byId: ["grigliata_evento"], field: "evento_id" }],
  grigliataPagamenti: [{ byId: ["grigliata_evento"], field: "evento_id" }], grigliataQuota: [{ byId: ["grigliata_evento"], field: "evento_id" }],
  grigliataAggiungiAdesione: [{ byId: ["grigliata_evento"], field: "evento_id" }, "room"],
  // — notifiche per id —
  deletePushSub: [{ byId: ["push_sub"], field: "id" }], deleteTelegramSub: [{ byId: ["telegram_sub"], field: "id" }],
  // — sezioni —
  sectionUpdate: ["section"], sectionSetSharing: ["section"], sectionSetRangeStyle: ["range"],
  sectionCreate: ["any"], sectionSetRanges: ["any"], laundryCreate: ["any"],
  // — account (regole fini in data.js) —
  accountList: ["account"], accountCreate: ["account"], accountSetPassword: ["account"], accountSetActive: ["account"],
  accountDelete: ["account"], accountSetCamera: ["account"], accountSetSection: ["account"],
  accountChangeOwnPassword: ["any"],
  biciPurge: "wide",
});

/** La feature che una risorsa "resource" usa per una data azione. */
function featureFor(desc, action, body) {
  if (desc === "spaces") return null;           // entrambe le sale: vedi `spaceSections`
  if (desc === "space") return body?.space === "music" ? "music" : "cinema";
  return desc;
}

const nega = (reason, status = 403, extra = {}) => ({ ...extra, allowed: false, reason, status });

/**
 * @param {{ role: string, sectionId: number|null }} who  (dalla RIGA dell'account)
 * @param {string} action
 * @param {object} body
 * @param {object} config  section_config()
 * @returns {{ allowed: boolean, reason?: string, status?: number,
 *             actingSectionId: number|null, scopeIds: number[]|null,
 *             resourceSectionId?: number|null, spaceSectionIds?: number[]|null,
 *             checks: { kinds: string[], id: any }[] }}
 *   actingSectionId: la sezione A (null = superadmin senza sezione scelta);
 *   scopeIds: [A] oppure null (nessun filtro) — per le funzioni SQL con p_section_ids;
 *   resourceSectionId: R per le azioni "resource";
 *   checks: i controlli "per id" che chi chiama deve eseguire.
 */
export function scopeDecision(who, action, body, config) {
  const regola = REGOLE[action];
  const superadmin = isGlobalScope(who.role);
  const base = { actingSectionId: null, scopeIds: null, checks: [] };

  if (regola === undefined) {
    return superadmin ? { allowed: true, ...base } : nega("azione non prevista per il tuo ruolo", 403, base);
  }

  // — la sezione che agisce —
  let A = null;
  const dichiarata = body?.section_id;
  if (superadmin) {
    if (dichiarata !== undefined && dichiarata !== null && dichiarata !== "") {
      const id = Number(dichiarata);
      if (!Number.isInteger(id) || !findSectionById(config, id)) return nega("sezione non trovata", 400, base);
      A = id;
    }
  } else {
    if (who.sectionId == null) return nega("account senza sezione", 403, base);
    A = who.sectionId;
    if (dichiarata !== undefined && dichiarata !== null && dichiarata !== "" && Number(dichiarata) !== A) {
      return nega("fuori dalla tua sezione", 403, base);
    }
  }
  const out = { allowed: true, actingSectionId: A, scopeIds: A === null ? null : [A], checks: [] };

  if (regola === "wide") return out;

  const descs = Array.isArray(regola) ? regola : [regola];
  for (const d of descs) {
    const kind = typeof d === "string" ? d : null;

    if (kind === "any") continue;
    if (kind === "account") continue;   // le regole sugli account stanno in data.js

    if (kind === "laundry") {
      // la lavanderia: body.laundry_id, oppure (setMachineStatus ecc.) quella della camera
      let lid = body?.laundry_id !== undefined && body?.laundry_id !== null ? Number(body.laundry_id) : null;
      if (lid === null && action === "laundryUpdate") lid = Number(body?.id);
      if (lid === null || !Number.isInteger(lid)) {
        const where = resolveRoom(config, String(body?.room ?? ""));
        lid = where?.laundryId ?? null;
      }
      if (lid === null) return nega(action === "clearDirezione" ? "indica la lavanderia" : "lavanderia non valida", 400, out);
      out.laundryId = lid;
      if (A !== null && !sectionIdsOfLaundry(config, lid).includes(A)) return nega("fuori dalla tua sezione", 403, out);
      if (A === null && sectionIdsOfLaundry(config, lid).length === 0) return nega("lavanderia non usata da nessuna sezione", 400, out);
      continue;
    }

    if (kind === "roomInLaundry") {
      // una camera di un'altra sezione che usa la stessa lavanderia va bene,
      // una camera di un'altra lavanderia no
      if (String(body?.room ?? "") === "DIREZIONE") continue;
      const where = resolveRoom(config, String(body?.room ?? ""));
      if (!where) return nega("camera non valida", 400, out);
      if (where.laundryId !== out.laundryId) return nega("quella camera non appartiene a questa lavanderia", 400, out);
      continue;
    }

    if (kind === "room") {
      const sid = sectionIdOfCode(config, sectionCodeOf(body?.room));
      if (sid === null) return nega("camera non valida", 400, out);
      if (A !== null && sid !== A) return nega("fuori dalla tua sezione", 403, out);
      continue;
    }

    if (kind === "section") {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || !findSectionById(config, id)) return nega("sezione non trovata", 400, out);
      if (A !== null && id !== A) return nega("fuori dalla tua sezione", 403, out);
      continue;
    }

    if (kind === "range") {
      const sid = sectionIdOfRange(config, Number(body?.range_id));
      if (sid === null) return nega("intervallo non trovato", 400, out);
      if (A !== null && sid !== A) return nega("fuori dalla tua sezione", 403, out);
      continue;
    }

    if (d && typeof d === "object" && d.resource) {
      if (A === null) return nega("indica la sezione", 400, out);
      if (d.resource === "spaces") {
        // panoramica sale: la sala cinema e la sala musica possono avere
        // proprietari diversi (si condividono separatamente)
        out.spaceSectionIds = [...new Set([resourceSection(config, A, "cinema"), resourceSection(config, A, "music")])];
        continue;
      }
      out.resourceSectionId = resourceSection(config, A, featureFor(d.resource, action, body));
      continue;
    }

    if (d && typeof d === "object" && d.byId) {
      if (A === null) return nega("indica la sezione", 400, out);
      out.checks.push({ kinds: d.byId, id: body?.[d.field] });
      continue;
    }

    return nega("azione non prevista per il tuo ruolo", 403, out);
  }
  return out;
}

/** Filtra il risultato di un'azione "wide" per la sezione A (null = tutto). */
export function filterByScope(action, result, scopeIds, config) {
  if (scopeIds === null || !result || result.ok === false) return result;
  const inScope = (sid) => scopeIds.includes(sid);
  const codes = new Set((config?.sections ?? []).filter((s) => inScope(s.id)).map((s) => s.code));

  if (action === "overview") {
    return { ...result, laundries: (result.laundries ?? []).filter((l) => (l.sections ?? []).some(inScope)) };
  }
  if (action === "biciList") {
    const camere = (result.camere ?? []).filter((c) => codes.has(sectionCodeOf(c.room)));
    return { ...result, camere, totale: camere.length };
  }
  if (action === "sectionList") {
    return { ...result, sections: (result.sections ?? []).filter((s) => inScope(s.id)) };
  }
  if (action === "accountList") {
    return { ...result, items: (result.items ?? []).filter((a) => a.section_id != null && inScope(a.section_id)) };
  }
  // feedback e deleteBooking/markFeedback: il filtro lo applica la SQL (p_section_ids).
  return result;
}
