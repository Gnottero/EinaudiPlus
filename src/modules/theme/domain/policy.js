// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Il tema stagionale cambia cio' che vede OGNI residente: sistemista.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  temaGet: P.THEME_MANAGE, temaSet: P.THEME_MANAGE,
});
