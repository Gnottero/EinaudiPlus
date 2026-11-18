// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Le segnalazioni: FDO e sistemista (non lo staff).

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  feedback: P.FEEDBACK_MANAGE, markFeedback: P.FEEDBACK_MANAGE,
});
