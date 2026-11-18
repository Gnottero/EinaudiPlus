// Azioni admin del dominio: sections. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { getConfig as getSectionConfig, adminCreateSection, adminUpdateSection, adminSetRanges, adminCreateLaundry, adminUpdateLaundry, adminSetSharing, adminSetRangeStyle } from "../../../src/modules/sections/index.js";

export const actions = {
  sectionList: () => getSectionConfig({ fresh: true }),
  sectionCreate: ({ body }) =>
    adminCreateSection({
      code: body.code, number: body.number, name: body.name, features: body.features, ranges: body.ranges,
    }),
  sectionUpdate: ({ body }) => adminUpdateSection({ id: body.id, name: body.name, features: body.features, active: body.active }),
  sectionSetSharing: ({ body }) => adminSetSharing({ id: body.id, shared: body.shared }),
  sectionSetRangeStyle: ({ body }) => adminSetRangeStyle({ rangeId: body.range_id, label: body.label, color: body.color }),
  sectionSetRanges: ({ body }) => adminSetRanges({ id: body.id, ranges: body.ranges }),
  laundryCreate: ({ body }) => adminCreateLaundry({ slug: body.slug, name: body.name, pairs: body.pairs }),
  laundryUpdate: ({ body }) => adminUpdateLaundry({ id: body.id, name: body.name, pairs: body.pairs }),
};
