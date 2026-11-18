// Azioni admin del dominio: theme. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { getTheme, setTheme } from "../../../src/modules/theme/index.js";

export const actions = {
  temaGet: ({ R }) => getTheme(R),
  temaSet: ({ body, R }) => setTheme(body.tema, R),
};
