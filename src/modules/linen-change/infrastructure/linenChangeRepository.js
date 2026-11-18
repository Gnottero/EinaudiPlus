// Adapter verso le funzioni SQL del cambio biancheria (via PostgREST).
// Nessuna logica qui dentro — stesso principio di themeRepository.js.

import { rpc } from "../../../shared/db/rpcClient.js";

export const linenChangeRepository = {
  /** L'ancora grezza (data + tipo) così com'è salvata — per popolare il form admin. */
  async adminGet(sectionId) {
    return rpc("linen_change_admin_get", { p_section_id: sectionId });
  },

  async setAnchor({ data, tipo, sectionId }) {
    return rpc("linen_change_set_anchor", { p_anchor_date: data, p_anchor_type: tipo, p_section_id: sectionId });
  },

  /** Segna (salta=true) o toglie (salta=false) il salto di un martedì. */
  async setSkip({ data, salta, sectionId }) {
    return rpc("linen_change_set_skip", { p_date: data, p_skip: salta, p_section_id: sectionId });
  },

  /** Percorso pubblico: la preferenza di notifica di QUESTA camera. */
  async getNotifyPref(room) {
    return rpc("linen_change_get_notify_pref", { p_room: room });
  },

  /** Percorso pubblico: la imposta. */
  async setNotifyPref({ room, enabled, notifyTime }) {
    return rpc("linen_change_set_notify_pref", { p_room: room, p_enabled: enabled, p_notify_time: notifyTime });
  },

  /** Cron: le camere da avvisare ADESSO — le segna avvisate nella stessa chiamata. */
  async claimDueNotifications() {
    return rpc("linen_change_claim_due_notifications");
  },
};
