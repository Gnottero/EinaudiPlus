// Autorizzazione del modulo: quale permesso serve a ciascuna delle SUE azioni.
// Chi ha quel permesso lo dice la matrice in identity/domain/permissions.js
// (niente `return true` di default: un ruolo non elencato non può).
//
// Il delegato ha QUESTO permesso e nessun altro; il sistemista lo ha come tutti.

import { makeAuthorize, PERMESSI as P } from "../../identity/index.js";

export const authorize = makeAuthorize({
  grigliataCrea: P.GRIGLIATA_MANAGE,
  grigliataOverview: P.GRIGLIATA_MANAGE,
  grigliataConfermaPagamento: P.GRIGLIATA_MANAGE,
  grigliataAnnullaConfermaPagamento: P.GRIGLIATA_MANAGE,
  grigliataChiudi: P.GRIGLIATA_MANAGE,
  grigliataModifica: P.GRIGLIATA_MANAGE,
  grigliataAggiungiAdesione: P.GRIGLIATA_MANAGE,
  grigliataRimuoviAdesione: P.GRIGLIATA_MANAGE,
  grigliataRiapri: P.GRIGLIATA_MANAGE,
  grigliataElimina: P.GRIGLIATA_MANAGE,
  grigliataPagamenti: P.GRIGLIATA_MANAGE,
  grigliataQuota: P.GRIGLIATA_MANAGE,
  grigliataRipristinaTicket: P.GRIGLIATA_MANAGE,
});
