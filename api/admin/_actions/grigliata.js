// Azioni admin del dominio: grigliata. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminCreaEvento, adminOverview as grigliataAdminOverview, adminConfermaPagamento, adminAnnullaConfermaPagamento, adminRipristinaTicket, adminChiudiEvento, adminModificaEvento, adminAggiungiAdesione, adminRimuoviAdesione, adminRiapriEvento, adminEliminaEvento, adminImpostaPagamenti, adminImpostaQuota } from "../../../src/modules/grigliata/index.js";

export const actions = {
  grigliataCrea: ({ body, me, R }) =>
    adminCreaEvento({
      titolo: body.titolo, scadenza: body.scadenza, giornoEvento: body.giorno_evento,
      paypalLink: body.paypal_link, satispayLink: body.satispay_link,
      menu: body.menu, pagamentiAttivi: body.pagamenti_attivi, quota: body.quota, tipo: body.tipo, attore: me.u,
      sectionId: R,
    }),
  grigliataOverview: ({ R }) => grigliataAdminOverview(R),
  grigliataConfermaPagamento: ({ body, me }) => adminConfermaPagamento(body.adesione_id, me.u),
  grigliataAnnullaConfermaPagamento: ({ body }) => adminAnnullaConfermaPagamento(body.adesione_id),
  grigliataRipristinaTicket: ({ body }) => adminRipristinaTicket(body.ticket_id),
  grigliataChiudi: ({ body }) => adminChiudiEvento(body.evento_id),
  grigliataModifica: ({ body }) => adminModificaEvento(body.evento_id, body.titolo, body.scadenza, body.giorno_evento, body.menu),
  grigliataAggiungiAdesione: ({ body }) => adminAggiungiAdesione(body.evento_id, body.room, body.menu_id, body.dieta, body.senza_glutine),
  grigliataRimuoviAdesione: ({ body }) => adminRimuoviAdesione(body.adesione_id),
  grigliataRiapri: ({ body }) => adminRiapriEvento(body.evento_id),
  grigliataElimina: ({ body }) => adminEliminaEvento(body.evento_id),
  grigliataPagamenti: ({ body }) => adminImpostaPagamenti(body.evento_id, body.attivi, body.paypal_link, body.satispay_link),
  grigliataQuota: ({ body }) => adminImpostaQuota(body.evento_id, body.quota),
};
