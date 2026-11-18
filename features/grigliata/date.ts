// Date "pure" (AAAA-MM-GG) nel fuso del dispositivo, condivise dal lato
// residente e da quello admin della Grigliata.

/** "AAAA-MM-GG" di oggi nel fuso del dispositivo — stesso formato del `date`
 *  che il server salva, per un confronto diretto senza passare da `Date`
 *  (che introdurrebbe un fuso orario nel confronto). */
export function oggiISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "20 settembre" da un `date` puro ("AAAA-MM-GG", senza orario) — split sui
 *  componenti invece di passare per `new Date(iso)`: letto come UTC e
 *  riformattato in fuso locale potrebbe slittare di un giorno. */
export function fmtGiornoLocale(dataIso: string, locale: string): string {
  const [y, m, d] = dataIso.split("-").map(Number);
  if (!y || !m || !d) return dataIso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "long" });
}
