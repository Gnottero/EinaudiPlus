// Superficie pubblica del modulo Sections — l'UNICO file importabile da fuori.
//
// Dominio: le sezioni del collegio (una lettera, un numero, un nome), le loro
// funzionalita' accese/spente, gli intervalli di camere e la lavanderia a
// cui ogni intervallo punta (due sezioni possono puntare alla stessa).
// L'identita' di una camera e' "<lettera><numero>": "V112", "P21-b".
//
// La configurazione si legge con una cache breve (CONFIG_TTL_MS): ogni
// richiesta pubblica la consulta, e cambia di rado. Dopo una scrittura
// amministrativa la cache dell'istanza che ha scritto si svuota subito; le
// altre istanze (serverless) la rileggono alla scadenza — fino a 30 secondi
// di ritardo su un cambio, accettabile per un'impostazione di sezione.

import { sectionsRepository } from "./infrastructure/sectionsRepository.js";
import { getSectionConfig as _getSectionConfig } from "./application/getConfig.js";
import { checkResourceActors as _checkResourceActors } from "./application/resourceActors.js";
import { resolveResourceSection as _resolveResourceSection } from "./application/resolveResource.js";
import { assertRoomAllowed as _assertRoomAllowed } from "./application/assertRoom.js";
import {
  adminCreateSection as _adminCreateSection, adminUpdateSection as _adminUpdateSection,
  adminSetRanges as _adminSetRanges, adminCreateLaundry as _adminCreateLaundry,
  adminUpdateLaundry as _adminUpdateLaundry, adminSetSharing as _adminSetSharing,
  adminSetRangeStyle as _adminSetRangeStyle,
} from "./application/adminSections.js";

export { authorize } from "./domain/policy.js";
export { RESOURCE_KINDS } from "./application/resourceActors.js";
export { FEATURES, SHAREABLE, isFeature, isShareable, isFeatureEnabled } from "./domain/features.js";
export { scopeDecision, filterByScope, REGOLE } from "./domain/scope.js";
export { sampleRoomForLaundry, resourceSection, findSectionById, sectionIdOfRange, resolveRoom, sectionIdsOfLaundry, sectionIdOfCode, findSectionByCode } from "./domain/config.js";

export const CONFIG_TTL_MS = 30_000;
let cache = { at: 0, value: null };

export function invalidateConfig() { cache = { at: 0, value: null }; }

/** La configurazione, dalla cache se ancora fresca. */
export async function getConfig({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CONFIG_TTL_MS) return cache.value;
  const value = await _getSectionConfig({}, { sectionsRepository });
  cache = { at: Date.now(), value };
  return value;
}

const deps = { sectionsRepository, invalidate: invalidateConfig };

/** La camera esiste e (se `feature`) la sua sezione l'ha accesa. Lancia ValidationError/ForbiddenError. */
export function assertRoomAllowed(room, feature = null, { required = true } = {}) {
  return _assertRoomAllowed({ room, feature, required }, { getConfig });
}

/**
 * L'id della sezione che possiede la risorsa `feature` usata da `room` (o, per
 * la DIREZIONE, dalla sezione `sectionCode`). Lancia Validation/Forbidden.
 * `shareKey` = la chiave di condivisione, se diversa dalla funzionalita'.
 */
export const resolveResourceSection = (input) => _resolveResourceSection(input, { getConfig });

export const adminCreateSection = (input) => _adminCreateSection(input, deps);
export const adminUpdateSection = (input) => _adminUpdateSection(input, deps);
export const adminSetRanges = (input) => _adminSetRanges(input, deps);
export const adminCreateLaundry = (input) => _adminCreateLaundry(input, deps);
export const adminUpdateLaundry = (input) => _adminUpdateLaundry(input, deps);
export const adminSetSharing = (input) => _adminSetSharing(input, deps);
export const adminSetRangeStyle = (input) => _adminSetRangeStyle(input, deps);

/** Lancia Forbidden/Validation se `actingSectionId` non puo' agire su quella risorsa. */
export const checkResourceActors = (input) => _checkResourceActors(input, deps);
