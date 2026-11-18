// Use-case: di quale sezione e' la risorsa `feature` che chi chiede sta usando?
//
// Chi chiede e' una camera ("P21"): la sezione e' la sua, e la risorsa e' quella
// che la sezione USA (la propria, o quella di un'altra se condivisa).
// Chi chiede e' la DIREZIONE (un amministratore che agisce da Direzione
// nell'app): non ha una camera, quindi dice la lettera della sezione in cui
// sta lavorando (`sectionCode`). E' la stessa fiducia di sempre — l'identita'
// e' dichiarata — ma il codice di sezione deve esistere ed essere attivo, e la
// funzione acceso.
//
// Torna l'id della sezione che POSSIEDE la risorsa (da passare ai moduli).

import { ValidationError, ForbiddenError } from "../../../shared/errors/AppError.js";
import { assertRoomAllowed } from "./assertRoom.js";
import { findSectionByCode, resourceSection } from "../domain/config.js";
import { isFeatureEnabled } from "../domain/features.js";

export async function resolveResourceSection({ room, sectionCode, feature, shareKey = feature }, { getConfig }) {
  const raw = String(room ?? "").trim();
  if (raw === "") throw new ValidationError("camera mancante");

  if (raw !== "DIREZIONE") {
    const where = await assertRoomAllowed({ room: raw, feature }, { getConfig });
    return resourceSection(await getConfig(), where.section.id, shareKey);
  }

  const config = await getConfig();
  const code = String(sectionCode ?? "").trim().toUpperCase();
  const section = findSectionByCode(config, code);
  if (!code || !section || !section.active) throw new ValidationError("sezione non valida");
  if (!isFeatureEnabled(section, feature)) {
    throw new ForbiddenError("questa funzione non e' attiva per la tua sezione");
  }
  return resourceSection(config, section.id, shareKey);
}
