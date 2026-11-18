/**
 * Numero di camera nel formato ammesso: una o due lettere di sezione, poi le
 * cifre, con una lettera a/b finale facoltativa ("V112", "P21-b", "M7A").
 *
 * È la validazione di SINTASSI: dice se la stringa ha la forma di una camera
 * e la riporta in forma canonica (lettera di sezione maiuscola). Che quella
 * sezione esista, sia attiva e abbia davvero quel numero in uno dei suoi
 * intervalli lo decide il modulo Sections (assertRoomExists) e, in SQL,
 * is_valid_room() — che restano l'autorità: gli intervalli sono configurabili
 * e vivono nel database, non in una costante di questo file.
 *
 * Una camera senza lettera ("112") NON è più valida: dalla v2.0 l'identità
 * include la sezione, perché lo stesso numero esiste in più sezioni.
 */
const ROOM_SYNTAX = /^([A-Za-z]{1,2})(\d{1,4})(-?[abAB])?$/;

export function parseRoomNumber(v) {
  const m = ROOM_SYNTAX.exec(String(v ?? "").trim());
  if (!m) return null;
  return m[1].toUpperCase() + m[2] + (m[3] ?? "");
}

/** La lettera di sezione di una camera già canonica, o null. */
export function sectionCodeOf(room) {
  const m = ROOM_SYNTAX.exec(String(room ?? "").trim());
  return m ? m[1].toUpperCase() : null;
}

/** Il numero (senza lettera né suffisso) di una camera: "V21-b" -> 21. */
export function roomDigits(room) {
  const m = ROOM_SYNTAX.exec(String(room ?? "").trim());
  return m ? Number(m[2]) : null;
}
