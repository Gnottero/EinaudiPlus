// Azioni admin del dominio: commonSpaces. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminGetSpacesOverview, adminDeleteSpaceBooking, adminBookAsDirezione as adminBookSpaceAsDirezione, adminSetSpaceChiuso } from "../../../src/modules/common-spaces/index.js";

export const actions = {
  // La panoramica delle sale: cinema e musica possono avere proprietari
  // diversi (si condividono separatamente), quindi si uniscono.
  async spaces({ plan }) {
    const ids = plan.spaceSectionIds ?? [null];
    const parti = await Promise.all(ids.map((id) => adminGetSpacesOverview(id)));
    return { ok: true, items: parti.flatMap((p) => p?.items ?? []) };
  },
  spaceSetChiuso: ({ body, R }) => adminSetSpaceChiuso({ space: body.space, chiuso: body.chiuso, sectionId: R }),
  deleteSpaceBooking: ({ body }) => adminDeleteSpaceBooking({ id: body.id }),
  bookSpaceDirezione: ({ body, R }) =>
    adminBookSpaceAsDirezione({
      space: body.space, day: body.day, start: body.start, end: body.end, type: body.type, sectionId: R,
    }),
};
