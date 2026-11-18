// Formattazione e valori predefiniti di date/quote per la scheda Grigliata (admin).
// Funzioni pure, nessuna dipendenza da React.

import { oggiISO, fmtGiornoLocale } from "../date";
export { oggiISO };

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "Grigliata del 20 settembre" — il nome di comodo suggerito dalla
 *  scadenza scelta, così l'evento ha subito un nome che lo distingue
 *  dall'ultimo (e da quello prima ancora), invece del generico "Grigliata"
 *  ripetuto ogni volta. Resta un suggerimento: il campo titolo si può
 *  sempre riscrivere a mano. */
export function titoloDaData(dataISO: string): string {
  const d = new Date(dataISO);
  if (Number.isNaN(d.getTime())) return "Grigliata";
  return `Grigliata del ${d.getDate()} ${MESI[d.getMonth()]}`;
}

/** Il valore di default per il campo `<input type="datetime-local">`: fra
 *  tre giorni alle 18:00 — un punto di partenza plausibile, non vincolante. */
export function scadenzaDiDefault(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Come sopra, ma per precompilare l'editor della scadenza a partire da un
 *  ISO già salvato (che porta anche i secondi, che l'input non accetta). */
export function isoInDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "12,50 €" — o null se la quota non è indicata. PostgREST restituisce un
 *  `numeric` come numero, ma non lo si dà per scontato. */
export function fmtQuota(q: number | string | null | undefined): string | null {
  if (q == null || q === "") return null;
  const n = Number(q);
  return Number.isFinite(n) ? n.toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : null;
}

/** Per precompilare il campo: "12,5" invece di "12.5". */
export function quotaInCampo(q: number | string | null | undefined): string {
  return q == null || q === "" ? "" : String(Number(q)).replace(".", ",");
}

export function fmtData(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Il giorno dell'evento (un `date` puro, "AAAA-MM-GG", senza orario) alla
 *  data odierna + 3 giorni — stesso orizzonte del default della scadenza. */
export function giornoEventoDiDefault(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "20 settembre" (italiano) da un `date` puro. */
export const fmtGiorno = (dataIso: string): string => fmtGiornoLocale(dataIso, "it-IT");
