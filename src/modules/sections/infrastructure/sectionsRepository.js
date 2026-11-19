import { rpc } from "../../../shared/db/rpcClient.js";

export const sectionsRepository = {
  async config() { return rpc("section_config"); },

  async createSection({ code, number, name, features, ranges }) {
    return rpc("section_admin_create", {
      p_code: code, p_number: number, p_name: name, p_features: features, p_ranges: ranges,
    });
  },
  async updateSection({ id, name, features, active }) {
    return rpc("section_admin_update", { p_id: id, p_name: name, p_features: features, p_active: active });
  },
  async deleteSection({ id }) { return rpc("section_admin_delete", { p_id: id }); },
  async setRanges({ id, ranges }) {
    return rpc("section_admin_set_ranges", { p_id: id, p_ranges: ranges });
  },
  async createLaundry({ slug, name, pairs }) {
    return rpc("laundry_admin_create", { p_slug: slug, p_name: name, p_pairs: pairs });
  },
  async setSharing({ id, shared }) {
    return rpc("section_admin_set_sharing", { p_id: id, p_shared: shared });
  },
  async setRangeStyle({ rangeId, label, color }) {
    return rpc("section_admin_set_range_style", { p_range_id: rangeId, p_label: label, p_color: color });
  },
  /** Chi puo' agire su una risorsa esistente (proprietario + sezioni che la condividono). */
  async resourceActors({ kind, id }) {
    return rpc("resource_actors", { p_kind: kind, p_id: id });
  },
  async updateLaundry({ id, name, pairs }) {
    return rpc("laundry_admin_update", { p_id: id, p_name: name, p_pairs: pairs });
  },
};
