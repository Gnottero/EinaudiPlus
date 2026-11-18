import { optionalSectionId } from "../../../shared/validation/section.js";
export async function listRecurringRules({ sectionId = null } = {}, { opsRepository }) {
  return opsRepository.recurringList(optionalSectionId(sectionId));
}
