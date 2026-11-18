import { rpc } from "../../../shared/db/rpcClient.js";

export const feedbackRepository = {
  async add(room, text) {
    return rpc("add_feedback", { p_room: room, p_text: text });
  },
  async list({ onlyOpen, limit, sectionIds = null }) {
    return rpc("admin_feedback", { p_only_open: onlyOpen, p_limit: limit, p_section_ids: sectionIds });
  },
  async markHandled({ id, handled, sectionIds = null }) {
    return rpc("admin_mark_feedback", { p_id: id, p_handled: handled, p_section_ids: sectionIds });
  },
};
