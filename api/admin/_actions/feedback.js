// Azioni admin del dominio: feedback. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminListFeedback, adminMarkFeedback } from "../../../src/modules/feedback/index.js";

export const actions = {
  feedback: ({ body, plan }) => adminListFeedback({ onlyOpen: body.only_open, limit: body.limit, sectionIds: plan.scopeIds }),
  markFeedback: ({ body, plan }) => adminMarkFeedback({ id: body.id, handled: body.handled, sectionIds: plan.scopeIds }),
};
