// Adapter verso le funzioni SQL delle sale comuni (via PostgREST).
//
// Nessuna logica qui dentro — vedi laundryRepository.js per lo stesso
// principio applicato per primo.

import { rpc } from "../../../shared/db/rpcClient.js";

export const commonSpacesRepository = {
  async bookings(space, sectionId) {
    return rpc("space_bookings", { p_slug: space, p_section_id: sectionId });
  },

  async book({ sectionId, space, day, start, end, name, type }) {
    return rpc("book_space", {
      p_slug: space, p_day: day, p_start: start, p_end: end, p_name: name, p_type: type, p_section_id: sectionId,
    });
  },

  async clear({ space, id, sectionId }) {
    return rpc("delete_space_booking", { p_slug: space, p_id: id, p_section_id: sectionId });
  },

  async adminOverview(sectionId = null) {
    return rpc("admin_spaces", { p_section_id: sectionId });
  },

  async adminDelete({ id }) {
    return rpc("admin_delete_space_booking", { p_id: id });
  },

  async bookAsDirezione({ sectionId, space, day, start, end, type }) {
    return rpc("book_space_as_direzione", {
      p_slug: space, p_day: day, p_start: start, p_end: end, p_type: type, p_section_id: sectionId,
    });
  },

  async addRecurringRule({ spaceId, day, start, end, name, type, note }) {
    return rpc("recurring_add_space", {
      p_space_id: spaceId, p_day: day, p_start: start, p_end: end,
      p_name: name, p_type: type, p_note: note,
    });
  },

  /** Chiude o riapre una sala (es. per il deposito dei pacchi). */
  async setChiuso({ space, chiuso, sectionId }) {
    return rpc("space_admin_set_chiuso", { p_slug: space, p_chiuso: chiuso, p_section_id: sectionId });
  },
};
