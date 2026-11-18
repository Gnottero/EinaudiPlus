import { optionalSectionId } from "../../../shared/validation/section.js";
export async function adminListTelegramSubs({ sectionId = null } = {}, { notificationsRepository }) {
  return notificationsRepository.adminListTelegramSubs(optionalSectionId(sectionId));
}
