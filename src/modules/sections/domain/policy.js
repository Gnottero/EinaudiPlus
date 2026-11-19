// Azioni amministrative di sezioni e lavanderie.
//   - creare sezioni, cambiare gli intervalli (numeri), creare lavanderie:
//     superadmin (sections.manage);
//   - nome, funzioni, condivisioni e colori dei piani della PROPRIA sezione,
//     coppie di una lavanderia che la sezione usa: admin (sections.configure) —
//     ma solo dentro la propria sezione, che e' un controllo in data.js
//     (scopeDecision), non una questione di ruolo;
//   - sectionList: qualunque account autenticato (il pannello ha bisogno di
//     sapere in quale sezione sta); il risultato e' filtrato per ambito.
import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

const perPermesso = makeAuthorize({
  sectionUpdate: P.SECTIONS_CONFIGURE,
  sectionSetSharing: P.SECTIONS_CONFIGURE,
  sectionSetRangeStyle: P.SECTIONS_CONFIGURE,
  laundryUpdate: P.SECTIONS_CONFIGURE,
  sectionCreate: P.SECTIONS_MANAGE,
  sectionSetRanges: P.SECTIONS_MANAGE,
  sectionDelete: P.SECTIONS_MANAGE,
  laundryCreate: P.SECTIONS_MANAGE,
});

export function authorize(claims, action) {
  if (action === "sectionList") return Boolean(claims);
  return perPermesso(claims, action);
}
