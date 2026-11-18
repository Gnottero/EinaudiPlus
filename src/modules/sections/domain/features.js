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
export const SHAREABLE = Object.freeze(["cinema", "music", "conference", "linen", "grigliata", "theme"]);
const SHAREABLE_SET = new Set(SHAREABLE);
export const isShareable = (name) => SHAREABLE_SET.has(name);

const KNOWN = new Set(FEATURES);

export const isFeature = (name) => KNOWN.has(name);

/** `section` come torna da section_public(); `feature` uno dei FEATURES. */
export function isFeatureEnabled(section, feature) {
  return section?.features?.[feature] !== false;
}
