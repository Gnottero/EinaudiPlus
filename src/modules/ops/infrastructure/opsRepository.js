import { rpc } from "../../../shared/db/rpcClient.js";

export const opsRepository = {
  async overview() {
    return rpc("admin_overview");
  },
  async recurringList(sectionId = null) {
    return rpc("recurring_list", { p_section_id: sectionId });
  },
  async recurringSetActive({ id, active }) {
    return rpc("recurring_set_active", { p_id: id, p_active: active });
  },
  async recurringDelete({ id }) {
    return rpc("recurring_delete", { p_id: id });
  },
  async applyRecurring({ offset, sectionId = null }) {
    return rpc("apply_recurring", { p_offset: offset, p_section_id: sectionId });
  },
  async purge({ scope, sala, sectionId = null }) {
    return rpc("sysadmin_purge", { p_scope: scope, p_sala: sala, p_section_id: sectionId });
  },
  async counts(sectionId = null) {
    return rpc("sysadmin_conteggi", { p_section_id: sectionId });
  },
};
