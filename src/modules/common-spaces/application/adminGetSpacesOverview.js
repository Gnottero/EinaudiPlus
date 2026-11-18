import { optionalSectionId } from "../../../shared/validation/section.js";
// Use-case: panoramica di tutte le sale per il pannello admin.

// `sectionId` null = tutte le sezioni (solo superadmin senza sezione scelta).
export async function adminGetSpacesOverview({ sectionId = null } = {}, { commonSpacesRepository }) {
  return commonSpacesRepository.adminOverview(optionalSectionId(sectionId));
}
