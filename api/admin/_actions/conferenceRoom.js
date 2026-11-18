// Azioni admin del dominio: conferenceRoom. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { listRules as conferenceListRules, addRule as conferenceAddRule, updateRule as conferenceUpdateRule, skipOccurrence as conferenceSkipOccurrence, moveOccurrence as conferenceMoveOccurrence, resetOccurrence as conferenceResetOccurrence, deleteRule as conferenceDeleteRule } from "../../../src/modules/conference-room/index.js";

export const actions = {
  conferenzaList: ({ R }) => conferenceListRules(R),
  conferenzaAdd: ({ body, me, R }) =>
    conferenceAddRule({
      titolo: body.titolo, inizio: body.inizio, fine: body.fine, dal: body.dal, al: body.al,
      giorno: body.giorno, note: body.note, attore: me.u, sectionId: R,
    }),
  conferenzaUpdate: ({ body }) =>
    conferenceUpdateRule({
      id: body.id, titolo: body.titolo, inizio: body.inizio, fine: body.fine,
      dal: body.dal, al: body.al, giorno: body.giorno, note: body.note,
    }),
  // `data` è la data che la REGOLA produce (RECURRENCE-ID), non quella a
  // cui l'incontro si vede: è il suo nome per sempre, anche dopo che è
  // stato spostato.
  conferenzaSkip: ({ body, me }) => conferenceSkipOccurrence({ id: body.id, data: body.data, attore: me.u }),
  conferenzaMove: ({ body, me }) =>
    conferenceMoveOccurrence({
      id: body.id, data: body.data, nuovaData: body.nuova_data,
      inizio: body.inizio, fine: body.fine, titolo: body.titolo, note: body.note, attore: me.u,
    }),
  conferenzaResetOccorrenza: ({ body }) => conferenceResetOccurrence({ id: body.id, data: body.data }),
  conferenzaDelete: ({ body }) => conferenceDeleteRule(body.id),
};
