// Le funzionalità che una sezione può accendere o spegnere.
//
// Una chiave mancante in section.features vale "attiva": aggiungere una
// funzionalità qui sotto non spegne nessuna sezione esistente per sbaglio.

export const FEATURES = Object.freeze([
  "laundry",        // lavanderia
  "cinema",         // sala cinema
  "music",          // sala musica
  "conference",     // sala polivalente (agenda)
  "bikes",          // dichiarazione bici
  "linen",          // cambio biancheria
  "grigliata",      // grigliata
  "feedback",       // segnalazioni
  "notifications",  // push e Telegram
  "theme",          // tema stagionale decorativo
]);

/**
 * Le risorse che appartengono a UNA sezione e che un'altra sezione puo' scegliere
 * di USARE al posto di averne una propria (section.shared_with). La lavanderia
 * si condivide dagli intervalli di camere (section_range.laundry_id), non da qui.
 */
export const SHAREABLE = Object.freeze(["cinema", "music", "conference", "grigliata"]);
const SHAREABLE_SET = new Set(SHAREABLE);
export const isShareable = (name) => SHAREABLE_SET.has(name);

const KNOWN = new Set(FEATURES);

export const isFeature = (name) => KNOWN.has(name);

/**
 * Comuni a tutto il collegio (v2.1): sempre attive, non si spengono per sezione.
 * linen e theme hanno UN solo proprietario (la sezione con l'id piu' basso):
 * vedi GLOBAL_RESOURCES e resource_section() in SQL.
 */
export const GLOBAL_FEATURES = Object.freeze(["notifications", "linen", "theme"]);
export const GLOBAL_RESOURCES = Object.freeze(["linen", "theme"]);
const GLOBAL_SET = new Set(GLOBAL_FEATURES);

/** `section` come torna da section_public(); `feature` uno dei FEATURES. */
export function isFeatureEnabled(section, feature) {
  return GLOBAL_SET.has(feature) || section?.features?.[feature] !== false;
}
