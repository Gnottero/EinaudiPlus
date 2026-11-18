// Funzioni pure sulla configurazione (sezioni, intervalli, lavanderie), nella
// forma in cui la restituisce section_config() in SQL:
//   { sections: [{ id, code, number, name, features, active, ranges: [{ id, label, from, to, laundry_id }] }],
//     laundries: [{ id, slug, name, pairs }] }

import { sectionCodeOf, roomDigits } from "../../../shared/validation/room.js";

export function findSectionByCode(config, code) {
  return (config?.sections ?? []).find((s) => s.code === code) ?? null;
}

/**
 * Dove sta una camera canonica ("V112")? Torna { section, range, laundryId }
 * se la sezione esiste, è attiva e il numero cade in uno dei suoi intervalli;
 * altrimenti null. Stessa regola di is_valid_room() in SQL.
 */
export function resolveRoom(config, room) {
  const code = sectionCodeOf(room);
  const n = roomDigits(room);
  if (code === null || n === null) return null;
  const section = findSectionByCode(config, code);
  if (!section || !section.active) return null;
  const range = (section.ranges ?? []).find((r) => n >= r.from && n <= r.to);
  if (!range) return null;
  return { section, range, laundryId: range.laundry_id ?? null };
}

/** Gli id delle sezioni che hanno un intervallo su questa lavanderia. */
export function sectionIdsOfLaundry(config, laundryId) {
  return (config?.sections ?? [])
    .filter((s) => (s.ranges ?? []).some((r) => r.laundry_id === laundryId))
    .map((s) => s.id);
}

/**
 * Di chi e' la risorsa `feature` che la sezione `sectionId` usa? La sezione
 * stessa, a meno che non l'abbia condivisa con un'altra (shared_with).
 * Specchio di resource_section() in SQL: vanno tenute allineate.
 */
export function resourceSection(config, sectionId, feature) {
  const s = (config?.sections ?? []).find((x) => x.id === sectionId);
  const v = s?.shared_with?.[feature];
  return v === undefined || v === null || v === "" ? sectionId : Number(v);
}

/**
 * Una camera qualsiasi che appartiene a questa lavanderia (per le chiamate SQL
 * che risolvono la lavanderia DALLA camera, quando chi agisce e' la Direzione e
 * non ne ha una). `preferSectionId` = si preferisce una camera di quella sezione.
 */
export function sampleRoomForLaundry(config, laundryId, preferSectionId = null) {
  const sezioni = (config?.sections ?? []).filter((s) => s.active);
  const ordinate = [...sezioni.filter((s) => s.id === preferSectionId), ...sezioni.filter((s) => s.id !== preferSectionId)];
  for (const s of ordinate) {
    const r = (s.ranges ?? []).find((x) => x.laundry_id === laundryId);
    if (r) return `${s.code}${r.from}`;
  }
  return null;
}

export function findSectionById(config, id) {
  return (config?.sections ?? []).find((s) => s.id === id) ?? null;
}

/** La sezione a cui appartiene un intervallo di camere (per id di intervallo). */
export function sectionIdOfRange(config, rangeId) {
  const s = (config?.sections ?? []).find((x) => (x.ranges ?? []).some((r) => r.id === rangeId));
  return s ? s.id : null;
}

export function sectionIdOfCode(config, code) {
  return findSectionByCode(config, code)?.id ?? null;
}
