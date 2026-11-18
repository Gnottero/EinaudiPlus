// Azioni admin del dominio: linenChange. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { getLinenChangeAnchor, setLinenChangeAnchor, setLinenChangeSkip } from "../../../src/modules/linen-change/index.js";

export const actions = {
  cambioBiancheriaGet: ({ R }) => getLinenChangeAnchor(R),
  cambioBiancheriaSet: ({ body, R }) => setLinenChangeAnchor(body.ancora_data, body.ancora_tipo, R),
  cambioBiancheriaSkip: ({ body, R }) => setLinenChangeSkip(body.data, body.salta, R),
};
