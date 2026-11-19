// modello.ts — le regole della lavanderia, senza interfaccia.
//
// Qui c'è solo COME funziona la lavanderia: quanti turni ci sono, quando
// iniziano, quali macchine esistono in quale edificio, quali turni appartengono
// a una camera. Nessun colore, nessuna traduzione, nessun componente — così si
// può leggere (e cambiare) senza aprire le 2000 righe di App.tsx, e si può
// verificare a mente guardando solo questo file.
//
// Regola pratica: se una cosa cambierebbe perché è cambiata la lavanderia
// (hanno aggiunto una macchina, i turni durano 90 minuti), va qui. Se
// cambierebbe perché è cambiata l'app, no.

import * as api from "./api";
import { version as PACKAGE_VERSION } from "./package.json";
import { getCachedConfig, parseRoom, resolveRoom, type SectionConfig } from "./sectionsApi";

// ─── Tipi ────────────────────────────────────────────────────────────────────

type MachineStatus = "available" | "in-use" | "out-of-order";
export type MachineType   = "washer" | "dryer";

export type WeekData   = api.WeekData;
export type StatusData = api.StatusData;

export interface Machine {
  id: string; label: string; type: MachineType; status: MachineStatus;
  room?: string; prevRoom?: string; prevNudgeSent?: boolean;
}

/** Un turno prenotato dalla propria camera. */
export interface MyBooking { day: number; slot: number; mid: string; }

/** Turno preferito: giorno + fascia oraria (es. domenica 14:30–15:45). */
export interface Fav { day: number; slot: number; }

// ─── Turni ───────────────────────────────────────────────────────────────────
//
// 19 turni da 75 minuti, dalle 07:00 alle 06:45 del giorno dopo. L'ultimo
// scavalca la mezzanotte: è il motivo per cui in giro si vedono conti su
// `% 1440` invece di ore normali.

export const N_SLOTS = 19;

function buildSlots() {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (x: number) => { const m = ((x % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  const out: { start: string; end: string }[] = [];
  let m = 7 * 60;
  for (let i = 0; i < N_SLOTS; i++) { out.push({ start: fmt(m), end: fmt(m + 75) }); m += 75; }
  return out;
}

export const TIME_SLOTS = buildSlots();

/**
 * Quota settimanale per camera.
 *
 * È un'indicazione, non un limite: il server NON la applica. Senza un login
 * vero la camera è autodichiarata in localStorage, quindi un blocco si
 * aggirerebbe cambiando una stringa nel browser e fermerebbe solo chi lo
 * rispettava già. Alla Direzione non si applica affatto.
 */
export const WEEKLY_QUOTA = 2;

// Una sola fonte di verità: package.json. Prima era una stringa ripetuta a
// mano qui dentro, e la v1.1 aveva dimostrato il rischio — build e deploy
// erano già a posto, solo questa riga era rimasta a "1.0.0" perché nessuno
// aveva pensato di aggiornarla insieme al resto.
export const APP_VERSION = PACKAGE_VERSION;

// ─── "Adesso" ────────────────────────────────────────────────────────────────
//
// Calcolati UNA VOLTA all'avvio, non a ogni render: sono la fotografia del
// momento in cui l'app è stata aperta. È anche il motivo per cui l'app si
// ricarica da sola quando torna in primo piano dopo più di cinque minuti —
// altrimenti a mezzanotte mostrerebbe ancora il giorno prima.

function nowInfo(d = new Date()) {
  let mins = d.getHours() * 60 + d.getMinutes();
  let shift = 0;
  // Prima delle 07:00 si appartiene ancora alla "giornata" precedente.
  if (mins < 7 * 60) { shift = -1; mins += 1440; }
  const since7 = mins - 7 * 60;
  let slot = Math.floor(since7 / 75);
  if (slot > N_SLOTS - 1) slot = N_SLOTS - 1;
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift);
  const dow  = (base.getDay() + 6) % 7;
  const early = (since7 - slot * 75) < 20;
  return { dayIdx: dow, slotIdx: slot, early, base };
}

const NOW       = nowInfo();
export const TODAY_DOW = NOW.dayIdx;
export const CUR_SLOT  = NOW.slotIdx;
export const PREV_SLOT = CUR_SLOT - 1;

/**
 * Anteprima del lunedì della settimana prossima: da sabato alle 16:00 a
 * lunedì alle 07:00 (domenica intera compresa) — lo stesso confine finale di
 * nowInfo/current_laundry_week_start lato server (vedi supabase/functions.sql
 * e migrations/033). In questa finestra il server risolve già le scritture e
 * le letture del giorno 0 sulla settimana dopo (laundry_week_start_for_day):
 * qui si decide solo come MOSTRARLO, non se prenotarlo lì — quello lo fa il
 * server, comunque, anche se questo calcolo lato client sbagliasse per un
 * orologio scentrato.
 *
 * Tre copie della stessa finestra, da tenere allineate a mano: questa,
 * laundry_preview_active() in supabase/functions.sql, e il test che la
 * verifica in tests/unit/anteprima-lunedi.test.mjs. Se cambi l'orario o il
 * giorno qui, cambiali anche negli altri due.
 *
 * Calcolato su `new Date()` diretto, non su NOW.base: quest'ultimo è già
 * spostato di un giorno prima delle 07:00 (per i turni che scavalcano la
 * mezzanotte) e mischiare i due spostamenti avrebbe reso la finestra un'ora
 * più corta o più lunga a seconda del momento.
 */
function computaAnteprimaLunedi(d = new Date()) {
  const dow = d.getDay();   // 0=domenica … 6=sabato (nativo di Date)
  const hh  = d.getHours();
  if (dow === 6) return hh >= 16;   // sabato pomeriggio
  if (dow === 0) return true;       // domenica, tutta
  if (dow === 1) return hh < 7;     // lunedì presto: la settimana non è ancora girata
  return false;
}
export const ANTEPRIMA_LUNEDI = computaAnteprimaLunedi();

// L'ordine in cui i sette giorni si mostrano nelle viste a griglia
// (Giornaliero, Settimana): normalmente 0..6 (Lun..Dom). Durante l'anteprima
// il lunedì (0) passa in fondo — è quello di cui si vede in anticipo la
// prenotabilità, non quello che si sta vivendo — lasciando gli altri sei
// nel loro ordine e posto di sempre.
export const ORDINE_GIORNI: readonly number[] = ANTEPRIMA_LUNEDI ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

// La posizione di ciascun giorno nell'ordine qui sopra: serve per capire "è
// prima o dopo oggi" quando l'ordine di visualizzazione non coincide più con
// il numero del giorno (during l'anteprima, il lunedì vale 0 ma si mostra
// per ultimo).
const RANGO_GIORNI: number[] = new Array(7);
ORDINE_GIORNI.forEach((giorno, pos) => { RANGO_GIORNI[giorno] = pos; });
export { RANGO_GIORNI };

const MONDAY = new Date(NOW.base.getFullYear(), NOW.base.getMonth(), NOW.base.getDate() - TODAY_DOW);
const WEEK_DATES = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i);
  // Il lunedì che si vede durante l'anteprima è già quello della settimana
  // dopo: la data mostrata deve dirlo, non restare quella del lunedì appena
  // passato.
  return (i === 0 && ANTEPRIMA_LUNEDI) ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7) : d;
});
export const DAYS_DATE  = WEEK_DATES.map((d) => d.getDate());

/**
 * Il mese abbreviato di un giorno della settimana corrente ("21 ago").
 *
 * I nomi arrivano da fuori invece di stare qui: il calendario è di questo
 * file, le parole sono di i18n.ts. Tenerli qui dentro voleva dire che
 * `modello` doveva conoscere le lingue — e visto che i18n importa già
 * WEEKLY_QUOTA da qui, sarebbe stato un anello circolare.
 */
export const monShort = (i: number, mesi: readonly string[]) => mesi[WEEK_DATES[i].getMonth()];

/** Quando finisce un turno, come Date. */
export function slotEndDate(slotIdx: number) {
  const d = new Date(NOW.base);
  d.setMinutes(d.getMinutes() + 7 * 60 + (slotIdx + 1) * 75);
  return d;
}

/**
 * La finestra in cui la Dashboard mostra il blocco "cambio biancheria":
 * martedì, dalle 05:00 (incluse) alle 14:00 (escluse).
 *
 * A differenza di ANTEPRIMA_LUNEDI, non è una costante calcolata una volta
 * sola all'avvio: la Dashboard tiene già un `now` che avanza (il conto alla
 * rovescia del turno corrente), e questa funzione va richiamata a ogni suo
 * aggiornamento — il blocco deve sparire da solo alle 14:00 anche se
 * nessuno ricarica la pagina.
 *
 * Usa il giorno/ora LOCALE del dispositivo (Date.getDay/getHours), non
 * nowInfo() con il suo spostamento di giornata alle 07:00: quello serve a
 * capire a quale turno di lavanderia appartiene un istante, questo descrive
 * un evento del calendario reale — un vero martedì mattina — che non ha
 * niente a che fare con i turni. Nessuna prenotazione dipende da questo
 * calcolo: è solo un avviso, quindi un orologio scentrato al peggio mostra
 * il blocco con qualche minuto di scarto, non un dato sbagliato.
 */
export function finestraCambioBiancheriaAttiva(d: Date): boolean {
  return d.getDay() === 2 && d.getHours() >= 5 && d.getHours() < 14;
}

// ─── Macchine ────────────────────────────────────────────────────────────────

/**
 * La camera nella forma canonica: lettera di sezione maiuscola, spazi tolti
 * ("v112 " -> "V112"). Il suffisso a/b resta com'e'.
 */
export function normalizeRoom(v: string): string {
  const s = v.trim();
  const m = /^([A-Za-z]{1,2})(.*)$/.exec(s);
  return m ? m[1].toUpperCase() + m[2] : s;
}

/**
 * Chi prenota per un'altra camera della propria sezione di solito scrive solo
 * le cifre ("112"): se `typed` non comincia con una lettera si usa la lettera
 * di `ownRoom` ("V112"). Se `ownRoom` non ha una sezione (Direzione, nessuna
 * camera) o `typed` ha gia' la sua lettera, resta com'e' (normalizzata).
 */
export function completeRoom(typed: string, ownRoom: string | null | undefined): string {
  const t = typed.trim();
  const own = parseRoom(ownRoom);
  if (own && /^\d/.test(t)) return own.code + t;
  return normalizeRoom(t);
}

/**
 * Numero di camera valido: una o due lettere di sezione, le cifre, e una
 * lettera a/b finale facoltativa ("V112", "P21-b"). Le cifre da sole non
 * bastano piu': l'identita' include la sezione.
 *
 * Il controllo SEMANTICO (la sezione esiste e il numero cade in uno dei suoi
 * intervalli) c'e' solo se la configurazione e' stata caricata; senza, vale
 * la sintassi e l'ultima parola resta al server (src/shared/validation/room.js
 * e is_valid_room() in SQL).
 */
export function isValidRoom(v: string, config: SectionConfig | null = getCachedConfig()): boolean {
  const room = normalizeRoom(v);
  if (!parseRoom(room)) return false;
  return config ? resolveRoom(config, room) !== null : true;
}

/**
 * Quali macchine esistono FISICAMENTE nella lavanderia di una camera.
 *
 * `pairs` (1–8) e' il numero di coppie lavatrice/asciugatrice di quella
 * lavanderia, come lo dichiara il server nello snapshot: la lavatrice X
 * prenota in automatico l'asciugatrice X, quindi i due numeri coincidono.
 * Prima la regola era "camere 1–99 una coppia, dal 100 in su tre" e dipendeva
 * dal numero di camera — adesso e' un dato della lavanderia, configurabile.
 */
const DEFAULT_PAIRS = 3;
export const MAX_PAIRS = 8; // lettere A-H, come il CHECK di machine.code in SQL

export function machinesFor(pairs: number): { washers: string[]; dryers: string[] } {
  const n = Math.min(MAX_PAIRS, Math.max(1, Math.trunc(pairs) || DEFAULT_PAIRS));
  const lettere = "ABCDEFGH".slice(0, n).split("");
  return { washers: lettere.map((l) => "W-" + l), dryers: lettere.map((l) => "D-" + l) };
}

/** Chi ha prenotato una certa macchina in un certo turno, se qualcuno. */
export function bookingAt(week: WeekData, day: number, slot: number, wid: string): string | undefined {
  if (day < 0 || slot < 0) return undefined;
  const v = week?.[day]?.[slot]?.[wid];
  return v ? String(v) : undefined;
}

/** Il turno precedente, scavalcando all'indietro il cambio di giorno. */
function prevRef(day: number, slot: number) {
  if (slot > 0) return { day, slot: slot - 1 };
  return { day: (day + 6) % 7, slot: N_SLOTS - 1 };
}

/**
 * Il turno DOPO, con lo stesso avvolgimento di prevRef.
 *
 * Serve a dire a chi prenota una lavatrice quale turno di asciugatrice gli
 * tocca di conseguenza: l'ultimo turno del giorno passa il testimone al primo
 * del giorno seguente, esattamente come prevRef guarda indietro.
 */
export function nextRef(day: number, slot: number) {
  if (slot < N_SLOTS - 1) return { day, slot: slot + 1 };
  return { day: (day + 1) % 7, slot: 0 };
}

/**
 * Lo stato delle macchine in un dato turno, come lo vede la dashboard.
 *
 * L'asciugatrice non si prenota: è implicitamente di chi ha la lavatrice con la
 * stessa lettera nel turno PRECEDENTE. Ecco perché qui si guarda indietro di
 * uno (`p`) per le asciugatrici e di due (`pp`) per sapere chi c'era prima.
 */
export function deriveMachines(
  week: WeekData, status: StatusData, day: number, slot: number, pairs: number,
): Machine[] {
  const p  = prevRef(day, slot);
  const pp = prevRef(p.day, p.slot);
  const mk = (id: string, type: MachineType, room?: string, prevRoom?: string): Machine => {
    const st: MachineStatus = status[id] === "oos" ? "out-of-order" : room ? "in-use" : "available";
    return { id, label: id[2], type, status: st, room, prevRoom };
  };
  const out: Machine[] = [];
  const { washers, dryers } = machinesFor(pairs);

  for (const L of washers.map((id) => id.slice(2))) {
    const wid = "W-" + L;
    out.push(mk(wid, "washer", bookingAt(week, day, slot, wid), bookingAt(week, p.day, p.slot, wid)));
  }
  for (const L of dryers.map((id) => id.slice(2))) {
    const did = "D-" + L, wid = "W-" + L;
    out.push(mk(did, "dryer", bookingAt(week, p.day, p.slot, wid), bookingAt(week, pp.day, pp.slot, wid)));
  }
  return out;
}

// ─── Le prenotazioni della propria camera ────────────────────────────────────

export function myWeekBookings(week: WeekData, room: string): MyBooking[] {
  const out: MyBooking[] = [];
  if (!room) return out;
  for (let day = 0; day < 7; day++) {
    const dd = week[day]; if (!dd) continue;
    for (const slotStr of Object.keys(dd)) {
      const slot = Number(slotStr);
      const slotData = dd[slot]; if (!slotData) continue;
      for (const mid of Object.keys(slotData)) {
        // Solo le lavatrici: l'asciugatrice viene con la lavatrice e
        // contarla separatamente raddoppierebbe ogni prenotazione.
        if (mid.startsWith("W-") && slotData[mid] === room) out.push({ day, slot, mid });
      }
    }
  }
  // Per rango di visualizzazione, non per numero di giorno grezzo: durante
  // l'anteprima (vedi ANTEPRIMA_LUNEDI) il giorno 0 e' il lunedi' della
  // settimana dopo, il piu' futuro di tutti, non il piu' vicino — ordinarlo
  // per "day - day" lo avrebbe messo per primo invece che per ultimo.
  out.sort((a, b) => RANGO_GIORNI[a.day] - RANGO_GIORNI[b.day] || a.slot - b.slot);
  return out;
}

// Per rango, non per valore grezzo del giorno: durante l'anteprima del
// lunedi' prossimo (vedi ANTEPRIMA_LUNEDI/RANGO_GIORNI qui sopra) il giorno 0
// e' il piu' futuro di tutti, e "b.day < TODAY_DOW" lo avrebbe segnato come
// passato solo perche' 0 e' il numero piu' piccolo.
export const isPastBooking    = (b: MyBooking) => RANGO_GIORNI[b.day] < RANGO_GIORNI[TODAY_DOW] || (b.day === TODAY_DOW && b.slot < CUR_SLOT);
export const isCurrentBooking = (b: MyBooking) => b.day === TODAY_DOW && b.slot === CUR_SLOT;

// ─── Preferiti ───────────────────────────────────────────────────────────────
//
// Per camera, non globali: cambiando stanza non restano quelli di prima.

export const favsKey = (room: string | null) => `laundryhub.favs.${room ?? "_"}`;

/** La sezione che esisteva prima delle sezioni: le camere senza lettera erano sue. */
const LEGACY_SECTION_CODE = "V";

/**
 * Migra i preferiti salvati con la camera SENZA lettera ("112") sotto la
 * camera con la lettera ("V112"), una volta sola.
 *
 * - Solo per la sezione storica (V): "P112" non eredita i preferiti della
 *   "112" di prima, che erano di un'altra camera.
 * - Se sotto la chiave nuova ci sono gia' preferiti, vincono quelli: la chiave
 *   vecchia resta com'e' (non si fondono due elenchi).
 * - La chiave vecchia di un ALTRO numero non si tocca mai.
 * - Il localStorage puo' lanciare (modalita' privata): tutto in try/catch.
 * Torna true se ha migrato qualcosa.
 */
function migrateLegacyFavs(room: string | null, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): boolean {
  const m = /^([A-Za-z]{1,2})(\d{1,4})/.exec(String(room ?? "").trim());
  if (!m || m[1].toUpperCase() !== LEGACY_SECTION_CODE) return false;
  const nuova = favsKey(String(room).trim());
  const vecchia = `laundryhub.favs.${m[2]}`;
  try {
    const esistenti = JSON.parse(storage.getItem(nuova) || "[]");
    if (Array.isArray(esistenti) && esistenti.length > 0) return false;
    const grezzo = storage.getItem(vecchia);
    if (!grezzo) return false;
    const vecchi = JSON.parse(grezzo);
    if (!Array.isArray(vecchi) || vecchi.length === 0) { storage.removeItem(vecchia); return false; }
    storage.setItem(nuova, grezzo);
    storage.removeItem(vecchia);
    return true;
  } catch { return false; }
}

export function loadFavs(room: string | null): Fav[] {
  if (!room) return [];
  migrateLegacyFavs(room);
  try {
    const raw = JSON.parse(localStorage.getItem(favsKey(room)) || "[]");
    return Array.isArray(raw)
      ? raw.filter((x: any) => x && typeof x.day === "number" && typeof x.slot === "number")
      : [];
  } catch { return []; }
}
