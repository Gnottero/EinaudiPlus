// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// L'elenco lo vede la portineria (FDO, sistemista); azzerare e modificare e' del sistemista.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  biciList: P.BIKES_VIEW,
  biciPurge: P.BIKES_MANAGE, biciDeleteRoom: P.BIKES_MANAGE, biciAddRoom: P.BIKES_MANAGE,
});
