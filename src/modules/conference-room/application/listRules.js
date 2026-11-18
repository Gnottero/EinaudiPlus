import { requireSectionId } from "../../../shared/validation/section.js";
export async function listRules({ sectionId }, { conferenceRepository }) {
  return conferenceRepository.rules(requireSectionId(sectionId));
}
