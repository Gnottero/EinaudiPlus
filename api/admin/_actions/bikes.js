// Azioni admin del dominio: bikes. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminListBikes, adminPurgeBikes, adminDeleteBikeRoom, adminAddBikeRoom } from "../../../src/modules/bikes/index.js";

export const actions = {
  biciList: () => adminListBikes(),
  // Il reset annuale: di una sezione per un admin, di tutte per il superadmin
  // senza sezione scelta.
  biciPurge: ({ A, config }) => adminPurgeBikes(A === null ? null : (config.sections ?? []).find((s) => s.id === A)?.code ?? null),
  biciDeleteRoom: ({ body }) => adminDeleteBikeRoom(body.room),
  biciAddRoom: ({ body }) => adminAddBikeRoom(body.room),
};
