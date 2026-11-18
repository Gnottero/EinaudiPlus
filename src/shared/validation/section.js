import { ValidationError } from "../errors/AppError.js";
import { parseIntInRange } from "./number.js";

/**
 * L'id di sezione di una risorsa (gia' risolto dal chiamante: la sezione che
 * POSSIEDE la risorsa, non quella di chi la usa). Obbligatorio: una risorsa
 * per-sezione senza sezione non ha un posto dove stare.
 */
export function requireSectionId(v) {
  const id = parseIntInRange(v, 1, 32767);
  if (id === null) throw new ValidationError("sezione mancante");
  return id;
}

/** Come requireSectionId, ma null/undefined = "tutte le sezioni" (solo superadmin). */
export function optionalSectionId(v) {
  if (v === null || v === undefined) return null;
  return requireSectionId(v);
}
