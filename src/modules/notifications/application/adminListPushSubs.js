import { optionalSectionId } from "../../../shared/validation/section.js";
export async function adminListPushSubs({ sectionId = null } = {}, { notificationsRepository }) {
  return notificationsRepository.adminListPushSubs(optionalSectionId(sectionId));
}
