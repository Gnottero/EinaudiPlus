import { rpc } from "../../../shared/db/rpcClient.js";

export const conferenceRepository = {
  async agenda(giorni, sectionId) {
    return rpc("conference_agenda", { p_giorni: giorni, p_section_id: sectionId });
  },
  async rules(sectionId) {
    return rpc("conference_rules", { p_section_id: sectionId });
  },
  async add({ titolo, oraInizio, oraFine, dal, al, giornoSettimana, note, attore, sectionId }) {
    return rpc("conference_add", {
      p_titolo: titolo, p_ora_inizio: oraInizio, p_ora_fine: oraFine,
      p_dal: dal, p_al: al, p_giorno_settimana: giornoSettimana, p_note: note, p_attore: attore,
      p_section_id: sectionId,
    });
  },
  async update({ id, titolo, oraInizio, oraFine, dal, al, giornoSettimana, note }) {
    return rpc("conference_update", {
      p_id: id, p_titolo: titolo, p_ora_inizio: oraInizio, p_ora_fine: oraFine,
      p_dal: dal, p_al: al, p_giorno_settimana: giornoSettimana, p_note: note,
    });
  },
  async skip({ id, data, attore }) {
    return rpc("conference_skip", { p_id: id, p_data: data, p_attore: attore });
  },
  async move({ id, data, nuovaData, oraInizio, oraFine, titolo, note, attore }) {
    return rpc("conference_move", {
      p_id: id, p_data: data, p_nuova_data: nuovaData,
      p_ora_inizio: oraInizio, p_ora_fine: oraFine, p_titolo: titolo, p_note: note, p_attore: attore,
    });
  },
  async resetOccorrenza({ id, data }) {
    return rpc("conference_reset_occorrenza", { p_id: id, p_data: data });
  },
  async delete({ id }) {
    return rpc("conference_delete", { p_id: id });
  },
};
