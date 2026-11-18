import { optionalSectionId } from "../../../shared/validation/section.js";
export async function getCounts({ sectionId = null } = {}, { opsRepository }) {
  return opsRepository.counts(optionalSectionId(sectionId));
}
