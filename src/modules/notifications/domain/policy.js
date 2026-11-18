// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Iscrizioni e messaggi a tutti: sistemista.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  pushSubs: P.NOTIFICATIONS_MANAGE, deletePushSub: P.NOTIFICATIONS_MANAGE,
  telegramSubs: P.NOTIFICATIONS_MANAGE, deleteTelegramSub: P.NOTIFICATIONS_MANAGE,
  broadcastPush: P.NOTIFICATIONS_MANAGE,
});
