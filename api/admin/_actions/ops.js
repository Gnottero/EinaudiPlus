// Azioni admin del dominio: ops. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminAddRecurringRule } from "../../../src/modules/laundry/index.js";
import { adminAddRecurringRule as adminAddSpaceRecurringRule } from "../../../src/modules/common-spaces/index.js";
import { getOverview, listRecurringRules, setRecurringRuleActive, deleteRecurringRule, applyRecurringRules, purgeData, getCounts } from "../../../src/modules/ops/index.js";

export const actions = {
  overview: () => getOverview(),
  recurringList: ({ A }) => listRecurringRules(A),
  recurringAddLaundry: ({ body }) =>
    adminAddRecurringRule({
      laundryId: body.laundry_id, day: body.day, slot: body.slot,
      machine: body.machine, room: body.room, note: body.note,
    }),
  recurringAddSpace: ({ body }) =>
    adminAddSpaceRecurringRule({
      spaceId: body.space_id, day: body.day, start: body.start, end: body.end,
      name: body.name, type: body.type, note: body.note,
    }),
  recurringSetActive: ({ body }) => setRecurringRuleActive({ id: body.id, active: body.active }),
  recurringDelete: ({ body }) => deleteRecurringRule(body.id),
  applyRecurring: ({ body, A }) => applyRecurringRules(body.offset, A),
  purge: ({ body, A }) => purgeData({ scope: body.scope, sala: body.sala, sectionId: A }),
  counts: ({ A }) => getCounts(A),
};
