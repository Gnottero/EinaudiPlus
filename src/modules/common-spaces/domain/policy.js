// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Chiudere una sala (deposito pacchi) non spetta allo staff; le ricorrenti sono del sistemista.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  spaces: P.SPACES_OPERATE, deleteSpaceBooking: P.SPACES_OPERATE, bookSpaceDirezione: P.SPACES_OPERATE,
  spaceSetChiuso: P.SPACES_CLOSE,
  recurringAddSpace: P.OPS_MANAGE,
});
