// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Programmare la sala polivalente: ogni ruolo operativo, non il delegato.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  conferenzaList: P.CONFERENCE_MANAGE, conferenzaAdd: P.CONFERENCE_MANAGE, conferenzaUpdate: P.CONFERENCE_MANAGE,
  conferenzaSkip: P.CONFERENCE_MANAGE, conferenzaMove: P.CONFERENCE_MANAGE,
  conferenzaResetOccorrenza: P.CONFERENCE_MANAGE, conferenzaDelete: P.CONFERENCE_MANAGE,
});
