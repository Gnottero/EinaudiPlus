// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Panoramica: FDO e sistemista (non lo staff). Tutto il resto: sistemista.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  overview: P.OPS_OVERVIEW,
  recurringList: P.OPS_MANAGE, recurringSetActive: P.OPS_MANAGE, recurringDelete: P.OPS_MANAGE,
  applyRecurring: P.OPS_MANAGE, purge: P.OPS_MANAGE, counts: P.OPS_MANAGE,
});
