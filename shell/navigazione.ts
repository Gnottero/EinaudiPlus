// navigazione.ts — dove si può andare nell'app e chi lo vede: le strutture dei
// residenti (lavanderia, cinema...), le schede admin per ruolo e le pagine di
// utilità. Solo dati e predicati puri; le schermate che li usano stanno accanto.

import * as api from "../api";
import { Film, Music, Presentation, Bike, Flame, Wrench, Bed, MessageSquare, UserCog, Repeat, Bell, Eraser, Sparkles, Layers } from "lucide-react";
import { WashingMachine } from "../icons";
import { featureOn, type FeatureKey, type Section } from "../sectionsApi";
import type { Role as AdminRole, Tab as AdminTab } from "../AdminPanel";

// Le sezioni amministrative sono destinazioni di navigazione come le altre,
// non un pannello a parte: chi ha la sessione le trova nella stessa lista di
// Lavanderia, Cinema e Musica.
// Le tre pagine di utilita' (segnalazione guasti, impostazioni, feedback)
// sono destinazioni come le altre: si raggiungono dallo stesso menu, con lo
// stesso `onChange`, e non aprono piu' un foglio sopra la pagina.
// "bike" e non "bici": l'id amministrativo "bici" (vedi ADMIN_TABS) e' gia'
// preso — sono due schermate diverse (qui la camera dichiara la sua, li' la
// portineria le vede tutte) e non possono condividere lo stesso id o
// `isAdminFacility` scambierebbe l'una per l'altra. Stessa ragione per
// "grigliata" (qui, il residente aderisce) e "grigliataAdmin" (li', il
// delegato vede chi ha aderito).
export type Facility = "laundry" | "cinema" | "music" | "conferenze" | "bike" | "grigliata" | "guasto" | "impostazioni" | "feedback" | AdminTab;

const ADMIN_TABS: AdminTab[] = ["macchine", "segnalazioni", "bici", "account", "ricorrenti", "notifiche", "manutenzione", "tema", "cambiobiancheria", "grigliataAdmin", "sezioni"];
export const isAdminFacility = (f: Facility): f is AdminTab => (ADMIN_TABS as string[]).includes(f);

/** Etichetta della camera nell'intestazione. Chi amministra è la Direzione. */
// "St. 318" era un'abbreviazione che non abbreviava niente: la pastiglia ha
// spazio, e nell'app la parola e' "camera" dappertutto. Da quando il saluto
// ("Buonasera, camera 318") non c'e' piu', questo e' l'UNICO posto dove sta
// scritta la camera — quindi ci sta scritta per intero.
export const roomLabel = (room: string | null, t: { changeRoom: string; room: string }) =>
  room === api.DIREZIONE ? "DIREZIONE" : room ? `${t.room} ${room}` : t.changeRoom;

// ─── Selettore struttura (Lavanderia / Cinema / Musica) ───────────────────────

//  e non l'etichetta: i testi stanno tutti in lingue/, e con sei
// lingue un oggetto { it, en } scritto qui dentro non reggeva piu'.
export const FACILITIES: {
  id: Facility; icon: any;
  chiave: "navLavanderia" | "navCinema" | "navMusica" | "navConferenze" | "bici" | "navGrigliata";
}[] = [
  { id: "laundry",    icon: WashingMachine, chiave: "navLavanderia" },
  { id: "cinema",     icon: Film,           chiave: "navCinema" },
  { id: "music",      icon: Music,          chiave: "navMusica" },
  // La sala conferenze non si prenota: la programma la direzione e qui la si
  // guarda. Sta comunque fra le strutture perche' la domanda che ci si fa
  // ("e' libera adesso?") e' la stessa che si fa per le altre.
  { id: "conferenze", icon: Presentation,   chiave: "navConferenze" },
  // Non e' una prenotazione ma la domanda ("questa camera ha una bici?") e'
  // la stessa specie delle altre: una struttura, non un'impostazione — per
  // questo sta qui e non piu' dentro Impostazioni.
  { id: "bike",       icon: Bike,           chiave: "bici" },
  // Compare SOLO quando il delegato ha una grigliata attiva (vedi
  // facilitiesFor): a differenza delle altre strutture, che esistono sempre,
  // questa e' un evento con un inizio e una fine.
  { id: "grigliata",  icon: Flame,          chiave: "navGrigliata" },
];

// La Direzione non e' una camera: non ha una bici da dichiarare ne' aderisce
// a una grigliata, quindi non ha senso che veda quelle schede. Nascondere la
// voce non e' una protezione (le sezioni stesse mostrano gia' un messaggio
// se ci si arriva lo stesso) — e' solo per non promettere una cosa che
// DIREZIONE non puo' fare.
//
// `grigliataAttiva` viene dal server (vedi App(), stato omonimo): senza
// un evento in corso la scheda sparisce, non resta li' vuota o disabilitata.
//
// `section` e' la sezione della camera: se ha spento una funzionalita' la sua
// voce non compare (vedi FUNZIONE_DI). Anche questo non e' un'autorizzazione —
// il server rifiuta comunque (403) — ma non si promette cio' che non c'e'.
const FUNZIONE_DI: Partial<Record<Facility, FeatureKey>> = {
  laundry: "laundry", cinema: "cinema", music: "music", conferenze: "conference",
  bike: "bikes", grigliata: "grigliata",
};

export const facilitiesFor = (roomNumber: string | null, grigliataAttiva: boolean, section: Section | null) =>
  FACILITIES.filter((f) =>
    (f.id !== "bike" || roomNumber !== api.DIREZIONE) &&
    (f.id !== "grigliata" || (grigliataAttiva && roomNumber !== api.DIREZIONE)) &&
    featureOn(section, FUNZIONE_DI[f.id]!)
  );

/** La struttura o pagina di utilita' e' spenta dalla sezione? */
export const facilityOff = (f: Facility, section: Section | null): boolean => {
  const fn = FUNZIONE_DI[f];
  if (fn) return !featureOn(section, fn);
  // Segnalare un guasto e' una segnalazione di una lavatrice: servono entrambe.
  if (f === "guasto") return !featureOn(section, "feedback") || !featureOn(section, "laundry");
  if (f === "feedback") return !featureOn(section, "feedback");
  return false;
};

export const utilityPagesFor = (section: Section | null) =>
  PAGINE_UTILITA.filter((p) => !facilityOff(p.id, section));

// Le voci fuori dall'elenco `ruoli` non compaiono con quella sessione, ma il
// controllo vero resta sul server: nascondere una voce non è un'autorizzazione.
//
// Un elenco esplicito di ruoli, non due booleani di esclusione
// (sistemistaOnly/staffEsclusa): con quattro ruoli invece di tre,
// un'esclusione per staff da sola non basta piu' a dire chi resta fuori — il
// delegato, che prima di questo elenco non era previsto affatto, sarebbe
// passato dal `return true` implicito di ogni condizione negativa. Elencare
// chi PUO' vedere una voce, invece di chi non puo', non lascia questo buco.
export const ADMIN_SECTIONS: {
  id: AdminTab; icon: any;
  chiave: "navMacchine" | "navSegnalazioni" | "navBici" | "navAccount" | "navRicorrenti" | "navNotifiche" | "navManutenzione" | "navTema" | "navCambioBiancheria" | "navGrigliataAdmin" | "navSezioni";
  ruoli: AdminRole[];
}[] = [
  // Macchine e segnalazioni restano affari di FDO e sistemista: lo staff
  // prenota per conto della Direzione come l'FDO, ma non deve vedere lo
  // stato guasto/funzionante delle macchine ne' le segnalazioni. Il delegato
  // no in ogni caso: i suoi permessi stanno per intero nella Grigliata.
  { id: "macchine",       icon: Wrench,        chiave: "navMacchine",     ruoli: ["fdo", "admin", "superadmin"] },
  // Stesso livello di Macchine: decisione operativa di portineria (FDO e
  // sistemista), non un'estetica come Tema qui sotto.
  { id: "cambiobiancheria", icon: Bed,         chiave: "navCambioBiancheria", ruoli: ["fdo", "admin", "superadmin"] },
  { id: "segnalazioni",   icon: MessageSquare, chiave: "navSegnalazioni", ruoli: ["fdo", "admin", "superadmin"] },
  // Quali camere hanno una bici: la vede chi e' in portineria, come le
  // macchine e le segnalazioni. Cancellarle tutte (reset annuale) resta al
  // sistemista — il pulsante compare solo a lui dentro la sezione stessa.
  { id: "bici",           icon: Bike,          chiave: "navBici",         ruoli: ["fdo", "admin", "superadmin"] },
  // Il delegato vede SOLO questa, oltre al sistemista che vede tutto.
  { id: "grigliataAdmin", icon: Flame,         chiave: "navGrigliataAdmin", ruoli: ["delegato", "admin", "superadmin"] },
  // La programmazione della sala polivalente non e' piu' una scheda a se':
  // vive dentro la sezione "Polivalente" stessa (vedi Conferenze.tsx), visibile
  // li' a chiunque abbia una sessione admin — non serve piu' una voce qui.
  // Chi crea e disattiva gli account e' una decisione dello stesso livello di
  // "chi puo' cancellare tutto": resta al sistemista.
  { id: "account",        icon: UserCog,       chiave: "navAccount",      ruoli: ["admin", "superadmin"] },
  { id: "ricorrenti",     icon: Repeat,        chiave: "navRicorrenti",   ruoli: ["admin", "superadmin"] },
  { id: "notifiche",      icon: Bell,          chiave: "navNotifiche",    ruoli: ["admin", "superadmin"] },
  { id: "manutenzione",   icon: Eraser,        chiave: "navManutenzione", ruoli: ["admin", "superadmin"] },
  // Decorazione dell'app (neve, pipistrelli...), acceso/spento a piacere:
  // stesso livello di privilegio di Account e Manutenzione, non perche' sia
  // rischioso quanto quelli, ma perche' cambia cosa vede OGNI residente.
  // Funzioni e coppie della propria sezione (sistemista); creare sezioni e
  // intervalli e' del superadmin, lo applica il server.
  { id: "sezioni",        icon: Layers,        chiave: "navSezioni",     ruoli: ["admin", "superadmin"] },
  { id: "tema",           icon: Sparkles,      chiave: "navTema",        ruoli: ["admin", "superadmin"] },
];

export const adminSectionsFor = (role: AdminRole | null) =>
  role === null ? [] : ADMIN_SECTIONS.filter((s) => s.ruoli.includes(role));

// Le tre pagine di utilita', raggiunte dal fondo del menu: non sono
// strutture ne' sezioni amministrative, ma il titolo in cima serve anche a
// loro — vedi l'header mobile.
export const PAGINE_UTILITA: { id: "guasto" | "impostazioni" | "feedback"; chiave: "reportOos" | "impostazioni" | "feedbackApp" }[] = [
  { id: "guasto",        chiave: "reportOos" },
  { id: "impostazioni",  chiave: "impostazioni" },
  { id: "feedback",      chiave: "feedbackApp" },
];
