// Use-case: lettura pubblica delle prenotazioni di una sala.

import { requireSectionId } from "../../../shared/validation/section.js";
import { ValidationError } from "../../../shared/errors/AppError.js";
import { isValidSpace } from "../domain/spaces.js";

export async function getBookings({ space, sectionId }, { commonSpacesRepository }) {
  const slug = String(space || "").trim();
  if (!isValidSpace(slug)) throw new ValidationError("sala non valida");
  return commonSpacesRepository.bookings(slug, requireSectionId(sectionId));
}
