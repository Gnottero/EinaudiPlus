import type { RoomKind, RoomBooking } from "../../roomsApi";
import { T } from "./testi";
import type { Lang } from "../../i18n";

// ─── Helpers tempo ──────────────────────────────────────────────────────────
export const pad = (n: number) => String(n).padStart(2, "0");
export const fmtMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const TODAY = (new Date().getDay() + 6) % 7; // 0 = Lunedì

// Il numero del giorno accanto alla sigla ("LUN 31"), come in lavanderia.
//
// Non si riusa il DAYS_DATE di modello.ts: lì il giorno cambia alle 07:00 (chi
// prenota un turno all'una di notte sta ancora "nel" giorno prima), qui a
// mezzanotte come sul calendario — sono due settimane calcolate diversamente,
// che quasi sempre coincidono e non devono essere confuse per l'unica sera in
// cui non coincidono.
//
// Serve soprattutto la domenica sera dopo mezzanotte: senza il numero, "LUN"
// da solo non diceva se la settimana appena caricata fosse quella nuova o si
// fosse fermata alla vecchia — il numero toglie il dubbio a colpo d'occhio.
const OGGI = new Date();
const LUNEDI = new Date(OGGI.getFullYear(), OGGI.getMonth(), OGGI.getDate() - TODAY);
export const DAYS_DATE = Array.from({ length: 7 }, (_, i) =>
  new Date(LUNEDI.getFullYear(), LUNEDI.getMonth(), LUNEDI.getDate() + i).getDate()
);

// Finestra oraria e tipo per ciascuna sala
// `overnight`: se la sala si può tenere oltre la mezzanotte. Vero per
// entrambe: una prova che finisce all'una capita quanto una proiezione.
//
// Le due sale ora hanno la STESSA finestra, 0–24. La musica apriva alle 9 e
// chiudeva alle 23; il limite è stato tolto, e da lì in poi tenerle diverse
// non descriveva più niente — le regole di prenotazione della musica sono
// quelle del cinema. Resta diverso solo ciò che è davvero diverso: gli
// strumenti non in cuffia (STRUMENTI_DA/A più sotto), che è un vincolo sul
// rumore, non sull'apertura della sala.
//
// Nota: questi valori vivono solo qui. Le colonne open_min/close_min di
// room_space dicono le stesse ore ma non le applica nessuno — il database
// accetta qualunque fascia dentro le 24 ore.
export const ROOM_CFG: Record<RoomKind, { winStart: number; winEnd: number; step: number; overnight: boolean }> = {
  cinema: { winStart: 0, winEnd: 24 * 60, step: 30, overnight: true },
  music:  { winStart: 0, winEnd: 24 * 60, step: 30, overnight: true },
};

export function timeOptions(winStart: number, winEnd: number, step: number) {
  const out: number[] = [];
  for (let m = winStart; m <= winEnd; m += step) out.push(m);
  return out;
}

/**
 * Gli orari di fine selezionabili, dato un inizio.
 *
 * Prima erano gli stessi dell'inizio filtrati per `m > start`: da una sala che
 * chiude a mezzanotte, partendo alle 21:00, si poteva arrivare al massimo alle
 * 24:00. Per tenerla dalle 21 all'una bisognava fare due prenotazioni su due
 * giorni — e ricordarsi di farle entrambe.
 *
 * Ora la lista prosegue oltre la mezzanotte, fino a un massimo di 24 ore di
 * durata (il limite che il database applica comunque). I valori oltre le 24:00
 * restano espressi in minuti dall'inizio del giorno di partenza: 1500 = l'una
 * di notte del giorno dopo. È la stessa convenzione che il resto del file usa
 * già in `endOf()` per disegnare la timeline.
 */
export function endOptions(start: number, cfg: { winEnd: number; step: number; overnight: boolean }) {
  const out: number[] = [];
  for (let m = start + cfg.step; m <= cfg.winEnd; m += cfg.step) out.push(m);
  if (!cfg.overnight) return out;
  // La coda riparte da dove finisce la griglia della sala, non da un 24:00
  // fisso. Oggi per entrambe le sale le due cose coincidono, ma la regola
  // scritta così regge anche una sala che chiudesse prima: partendo fisso da
  // 24:00, per una griglia che finisce alle 23:00 la lista saltava da 23:00 a
  // 00:30, perdendo per strada le 23:30 e la mezzanotte esatta.
  //
  // Si ferma prima di richiudere il cerchio sull'orario di partenza: una
  // prenotazione di 24 ore esatte non ha senso e il database la rifiuterebbe.
  for (let m = cfg.winEnd + cfg.step; m < start + 24 * 60; m += cfg.step) out.push(m);
  return out;
}

/**
 * L'orario di fine, dicendo a parole se cade il giorno dopo.
 *
 * Prima "(+1)", che è una notazione da tabella oraria: fuori da chi la conosce
 * già non vuol dire niente, e chi prenota la sala cinema non sta leggendo un
 * orario ferroviario.
 *
 * Poi "(domani)", che era sbagliato in un modo più insidioso: se oggi è
 * mercoledì e stai prenotando per venerdì sera, quella fascia finisce sabato,
 * non domani. "Domani" si misura da oggi; qui il riferimento è il giorno della
 * prenotazione. "(del giorno successivo)" lo dice senza ambiguità.
 */
export const fmtEnd = (m: number, lang: Lang = "it") =>
  m > 24 * 60 ? `${fmtMin(m)} ${T[lang].giornoSuccessivo}`
  : m === 24 * 60 ? "24:00"
  : fmtMin(m);

/**
 * Ricostruisce il blocco originale di una prenotazione appena cancellata, per
 * "Annulla". Per una fascia normale e' la riga stessa; per una che scavalcava
 * la mezzanotte sono due righe con lo stesso `group` — si ricompongono in un
 * solo intervallo (l'`end` della seconda meta' spostato oltre le 24:00), la
 * stessa forma che `submit()` manda quando la crea la prima volta.
 */
export function payloadForUndo(b: RoomBooking, all: RoomBooking[]): Omit<RoomBooking, "id"> {
  if (!b.group) return { day: b.day, start: b.start, end: b.end, name: b.name, type: b.type };
  const pair = all.filter((x) => x.group === b.group);
  const first = pair.find((x) => x.start > 0) ?? b;
  const second = pair.find((x) => x.id !== first.id);
  const end = second ? 24 * 60 + second.end : first.end;
  return { day: first.day, start: first.start, end, name: first.name, type: first.type };
}
