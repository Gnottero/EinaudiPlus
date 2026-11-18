// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Staff: prenota e libera per la Direzione come l'FDO, ma non tocca lo stato
// delle macchine. Le ricorrenti sono del sistemista in tutto il pannello:
// nascondere una voce non e' un'autorizzazione.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  week: P.LAUNDRY_OPERATE, deleteBooking: P.LAUNDRY_OPERATE, forceBook: P.LAUNDRY_OPERATE,
  bookDirezione: P.LAUNDRY_OPERATE, clearDirezione: P.LAUNDRY_OPERATE,
  setMachineStatus: P.MACHINES_MANAGE,
  recurringAddLaundry: P.OPS_MANAGE,
});
