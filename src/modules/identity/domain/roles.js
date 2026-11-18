// Regole di dominio dell'identità: quali ruoli esistono e chi può fare cosa
// sulle azioni che QUESTO modulo possiede (account amministrativi).
//
// Risolve l'audit finding #3: nel codice attuale (api/admin/data.js) le
// action riservate al sistemista vivono in un Set() centrale mantenuto a
// mano, separato dalle action stesse — un'azione nuova non finisce lì
// automaticamente, e il controllore ha zero modo di accorgersi che manca.
// Qui la policy sta accanto alle azioni che descrive: aggiungere un'azione
// account senza decidere la sua policy non è possibile, perché authorize()
// è l'unico modo con cui l'adapter scopre se può procedere.

import { can, PERMESSI } from "./permissions.js";

/**
 * Quattro ruoli (v2.0). I permessi di ciascuno stanno in permissions.js; qui
 * solo i nomi.
 *  - `superadmin`: la piattaforma, senza sezione: crea sezioni, intervalli e
 *    lavanderie, nomina gli admin, vede tutto;
 *  - `admin`: l'amministratore di UNA sezione;
 *  - `fdo`: la portineria di una sezione;
 *  - `delegato`: ruolo STRETTO a una sola cosa — la Grigliata (vedi
 *    src/modules/grigliata).
 * Ogni account tranne il superadmin appartiene a una sezione
 * (admin_account.section_id).
 */
export const RUOLI = new Set(["superadmin", "admin", "fdo", "delegato"]);

export function isValidRole(role) {
  return RUOLI.has(role);
}

/** Il ruolo di piattaforma: crea sezioni, intervalli e lavanderie, vede tutto. */
export function isSuperadmin(claims) {
  return claims?.r === "superadmin";
}

export function isAdmin(claims) {
  return claims?.r === "admin";
}

export function isDelegato(claims) {
  return claims?.r === "delegato";
}

/** I ruoli che un account di una sezione puo' avere (tutti tranne superadmin). */
export const RUOLI_DI_SEZIONE = new Set(["admin", "fdo", "delegato"]);

// Azioni di gestione account (permesso accounts.manage).
const AZIONI_ACCOUNT = new Set([
  "accountList", "accountCreate", "accountSetPassword", "accountSetActive", "accountDelete",
  "accountSetCamera", "accountSetSection",
]);

/**
 * Decide se `claims` può eseguire `action`.
 *
 * Torna `null` (non `false`) quando l'azione non appartiene a questo modulo:
 * è la differenza fra "vietato" e "non è affar mio", e serve al chiamante
 * (l'adapter che smista fra moduli) per sapere se deve continuare a cercare
 * altrove o fermarsi con un 403.
 */
export function authorize(claims, action) {
  // Il titolare cambia la propria password: nessun ruolo richiesto oltre
  // all'essere autenticato, è l'unica azione ammessa anche con la password
  // provvisoria ancora attiva (quel controllo resta a monte, nell'adapter).
  if (action === "accountChangeOwnPassword") return Boolean(claims);

  // Gestire gli account è un permesso della matrice (permissions.js). Resta
  // l'obbligo, in data.js, che un admin tocchi solo fdo/delegato della propria
  // sezione (e che accountSetSection sia del solo superadmin): qui si decide
  // solo il ruolo.
  if (AZIONI_ACCOUNT.has(action)) return can(claims, PERMESSI.ACCOUNTS_MANAGE);

  return null; // azione non gestita da questo modulo
}
