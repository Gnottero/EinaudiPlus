// Adapter verso le funzioni SQL del tema stagionale (via PostgREST).
// Nessuna logica qui dentro — vedi laundryRepository.js per lo stesso
// principio applicato per primo.

import { rpc } from "../../../shared/db/rpcClient.js";

export const themeRepository = {
  async get(sectionId) {
    return rpc("app_theme_get", { p_section_id: sectionId });
  },

  async set(tema, sectionId) {
    return rpc("sysadmin_set_theme", { p_tema: tema, p_section_id: sectionId });
  },
};
