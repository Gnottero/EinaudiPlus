// Use-case: legge il tema stagionale attivo (pannello admin).

import { requireSectionId } from "../../../shared/validation/section.js";
export async function getTheme({ sectionId }, { themeRepository }) {
  return { ok: true, tema: await themeRepository.get(requireSectionId(sectionId)) };
}
