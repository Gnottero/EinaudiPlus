// Matrice ruolo → permessi: l'UNICO posto che dice cosa può fare ogni ruolo.
//
// Prima la stessa informazione era sparsa in undici policy.js, ognuna con i
// suoi `if (isStaff(...)) return false` / `if (isDelegato(...)) return false`
// e un `return true` finale che concedeva per default a chiunque non fosse
// stato escluso a mano. Un ruolo stretto come "delegato" costringeva a
// riaprire ogni policy per ricordarsi di escluderlo; un ruolo nuovo
// avrebbe ereditato ogni permesso che nessuno aveva pensato di negargli.
//
// Ora è il contrario: un permesso va CONCESSO a un ruolo, qui, con il suo
// nome. Chi non è elencato non può — nessun `return true` di default.
// Ogni modulo continua a possedere l'elenco delle PROPRIE azioni e a dire
// quale permesso serve a ciascuna (domain/policy.js); questa tabella dice
// solo chi ha quale permesso.
//
// Dichiarato (CLAUDE.md, "fedeltà prima, hardening dopo"): la matrice
// riproduce ESATTAMENTE i permessi di prima per fdo/staff/sistemista/delegato
// — i test dei moduli, rimasti invariati, ne sono la prova. Cambia solo
// l'aggiunta del ruolo `superadmin` e i due permessi nuovi di sezione.

/** I permessi, per nome: `<area>.<verbo>`. */
export const PERMESSI = Object.freeze({
  // Lavanderia
  LAUNDRY_OPERATE: "laundry.operate",       // griglia, prenotare/liberare per la Direzione, cancellare, forzare
  MACHINES_MANAGE: "machines.manage",       // stato guasto/funzionante di una macchina
  // Sale comuni e polivalente
  SPACES_OPERATE: "spaces.operate",         // panoramica, prenotare/cancellare per la Direzione
  SPACES_CLOSE: "spaces.close",             // chiudere una sala (deposito pacchi)
  CONFERENCE_MANAGE: "conference.manage",   // programmare la sala polivalente
  // Portineria
  FEEDBACK_MANAGE: "feedback.manage",       // segnalazioni dei residenti
  BIKES_VIEW: "bikes.view",                 // elenco camere con bici
  BIKES_MANAGE: "bikes.manage",             // aggiungere/togliere/azzerare
  LINEN_MANAGE: "linen.manage",             // cambio biancheria
  // Eventi
  GRIGLIATA_MANAGE: "grigliata.manage",     // organizzare la grigliata
  // Operatività riservata
  OPS_OVERVIEW: "ops.overview",             // panoramica lavanderie
  OPS_MANAGE: "ops.manage",                 // ricorrenti, pulizia dati, conteggi
  NOTIFICATIONS_MANAGE: "notifications.manage",
  THEME_MANAGE: "theme.manage",
  // Identità e struttura
  ACCOUNTS_MANAGE: "accounts.manage",       // creare/disattivare account
  SECTIONS_CONFIGURE: "sections.configure", // funzionalità e nome della propria sezione; coppie di una lavanderia
  SECTIONS_MANAGE: "sections.manage",       // creare sezioni, intervalli, lavanderie
});

const P = PERMESSI;

/**
 * Quattro ruoli (v2.0):
 *  - `superadmin`: la piattaforma — tutti i permessi, su tutte le sezioni; solo
 *    lui crea sezioni, intervalli e lavanderie e nomina gli admin;
 *  - `admin`: l'amministratore di UNA sezione (la sua, admin_account.section_id):
 *    tutto cio' che riguarda la sezione, comprese le sue funzioni, le
 *    risorse condivise, i colori dei piani e gli account fdo/delegato della
 *    sezione — mai la struttura (sezioni, intervalli, lavanderie nuove);
 *  - `fdo`: la portineria di una sezione;
 *  - `delegato`: un solo permesso, la grigliata.
 *
 * Ex `sistemista` -> `admin` e ex `staff` -> `fdo` (migrazione 061): dichiarato
 * in DEPLOY.md, lo staff guadagna le funzioni di portineria.
 */
export const RUOLI_PERMESSI = Object.freeze({
  superadmin: "*",
  admin: new Set([
    P.LAUNDRY_OPERATE, P.MACHINES_MANAGE, P.SPACES_OPERATE, P.SPACES_CLOSE, P.CONFERENCE_MANAGE,
    P.FEEDBACK_MANAGE, P.BIKES_VIEW, P.BIKES_MANAGE, P.LINEN_MANAGE, P.GRIGLIATA_MANAGE,
    P.OPS_OVERVIEW, P.OPS_MANAGE, P.NOTIFICATIONS_MANAGE, P.THEME_MANAGE, P.ACCOUNTS_MANAGE,
    P.SECTIONS_CONFIGURE,
  ]),
  fdo: new Set([
    P.LAUNDRY_OPERATE, P.MACHINES_MANAGE, P.SPACES_OPERATE, P.SPACES_CLOSE, P.CONFERENCE_MANAGE,
    P.FEEDBACK_MANAGE, P.BIKES_VIEW, P.LINEN_MANAGE, P.OPS_OVERVIEW,
  ]),
  delegato: new Set([P.GRIGLIATA_MANAGE]),
});

/** Il ruolo `claims.r` ha il permesso? Senza claims, mai. */
export function can(claims, permesso) {
  const grant = RUOLI_PERMESSI[claims?.r];
  if (!grant) return false;
  return grant === "*" || grant.has(permesso);
}

/**
 * Ogni account tranne il superadmin appartiene a UNA sezione. `sectionId` e'
 * quello della riga dell'account (null per il superadmin).
 */
export function isGlobalScope(role) {
  return role === "superadmin";
}

export function sectionAllowed(role, ownSectionId, sectionId) {
  return isGlobalScope(role) || (ownSectionId != null && ownSectionId === sectionId);
}

/**
 * Costruisce l'`authorize(claims, action)` di un modulo a partire dalla sua
 * mappa azione → permesso. Torna `null` per le azioni che non sono del modulo
 * ("non è affar mio": il chiamante prova il modulo successivo), `false` senza
 * sessione o senza il permesso, `true` altrimenti.
 *
 * Il modulo POSSIEDE la mappa delle proprie azioni — aggiungerne una obbliga
 * a sceglierne il permesso, non c'è un elenco esterno da dimenticare — ma non
 * decide chi ha quel permesso: lo dice RUOLI_PERMESSI.
 */
export function makeAuthorize(azioni) {
  const mappa = new Map(Object.entries(azioni));
  return function authorize(claims, action) {
    if (!mappa.has(action)) return null;
    if (!claims) return false;
    return can(claims, mappa.get(action));
  };
}
