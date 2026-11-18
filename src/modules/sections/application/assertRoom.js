// Use-case: una camera esiste davvero, e (se richiesto) la sua sezione ha
// acceso quella funzionalita'. Chiamato dagli adapter pubblici prima di
// toccare le funzionalita' di una camera.
//
// Dichiarato: l'identita' di un residente e' autodichiarata (README), quindi
// questo NON e' un controllo di sicurezza — e' coerenza di prodotto: una
// sezione che ha spento la sala polivalente non la mostra e non la accetta.
//
// `room` vuoto o 'DIREZIONE' non appartengono a nessuna sezione: passano
// (le letture senza camera restano come prima; la Direzione e' un'identita'
// amministrativa, non una camera).

import { ValidationError, ForbiddenError } from "../../../shared/errors/AppError.js";
import { parseRoomNumber } from "../../../shared/validation/room.js";
import { resolveRoom } from "../domain/config.js";
import { isFeature, isFeatureEnabled } from "../domain/features.js";

export async function assertRoomAllowed({ room, feature = null, required = true }, { getConfig }) {
  const raw = String(room ?? "").trim();
  if (raw === "" || raw === "DIREZIONE") {
    if (required && raw === "") throw new ValidationError("camera mancante");
    return null;
  }
  const parsed = parseRoomNumber(raw);
  if (!parsed) throw new ValidationError("camera non valida");
  const where = resolveRoom(await getConfig(), parsed);
  if (!where) throw new ValidationError("camera non valida");
  if (feature) {
    if (!isFeature(feature)) throw new Error(`funzionalita' sconosciuta: ${feature}`);
    if (!isFeatureEnabled(where.section, feature)) {
      throw new ForbiddenError("questa funzione non e' attiva per la tua sezione");
    }
  }
  return where;
}
