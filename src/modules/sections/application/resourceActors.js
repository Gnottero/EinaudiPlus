// Use-case: l'amministratore che agisce da `actingSectionId` puo' toccare
// questa risorsa esistente? Si' se la sua sezione e' la proprietaria o una di
// quelle che la condividono (resource_actors in SQL). Serve alle azioni "per
// id" — cancellare una prenotazione di sala, modificare un evento, chiudere
// un ticket — dove il bersaglio e' un numero e non dice di chi e'.

import { ValidationError, ForbiddenError } from "../../../shared/errors/AppError.js";
import { parseIntInRange } from "../../../shared/validation/number.js";

export const RESOURCE_KINDS = Object.freeze([
  "conference_event", "room_space", "space_booking", "grigliata_evento", "grigliata_adesione",
  "grigliata_ticket", "recurring_space", "recurring_laundry", "push_sub", "telegram_sub",
]);
const KINDS = new Set(RESOURCE_KINDS);

/**
 * `kind` puo' essere un elenco (es. una regola ricorrente puo' essere di
 * lavanderia o di sala): si prova ciascuno finche' uno riconosce l'id.
 */
export async function checkResourceActors({ kind, id, actingSectionId }, { sectionsRepository }) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  for (const k of kinds) if (!KINDS.has(k)) throw new Error(`tipo di risorsa sconosciuto: ${k}`);
  const rid = parseIntInRange(id, 1, Number.MAX_SAFE_INTEGER);
  if (rid === null) throw new ValidationError('campo "id" non valido');
  let actors = null;
  for (const k of kinds) {
    actors = await sectionsRepository.resourceActors({ kind: k, id: rid });
    if (Array.isArray(actors)) break;
  }
  if (!Array.isArray(actors)) throw new ValidationError("elemento non trovato");
  if (!actors.includes(actingSectionId)) throw new ForbiddenError("fuori dalla tua sezione");
  return true;
}
