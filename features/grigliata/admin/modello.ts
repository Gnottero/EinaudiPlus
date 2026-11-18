// Tipi, costanti e predicati puri della scheda Grigliata (admin): la forma dei
// dati che arrivano dal server e i filtri sulle adesioni. Niente React qui.

// v1.3: i menu non sono più un elenco fisso — li decide il delegato per
// ogni grigliata (tabella grigliata_menu in SQL), es. "Carne"/"Pesce". v1.3.1:
// "vegetariano"/"vegano" NON sono un menu — sono un'informazione a sé che il
// residente dichiara IN PIÙ, qualunque menu abbia scelto (vedi `dieta` su
// Adesione più sotto): si può scegliere "Carne" e dichiararsi vegani, il
// delegato prepara un piatto a parte.
// v1.5: ogni menu si scompone in una o più voci-ticket (es. menu "Carne" =
// "Salsiccia" + "Patatine" + "Bibita") — decise dal delegato insieme al menu.
// v1.8: con un'emoji facoltativa (es. 🌭), mostrata al residente accanto al nome.
type MenuTicketVoce = { id: number; nome: string; emoji?: string | null };
type MenuVoce = { id: number; nome: string; ticket: MenuTicketVoce[] };
export type Dieta = "classico" | "vegetariano" | "vegano";
export const NOME_DIETA: Record<Dieta, string> = { classico: "Mangia di tutto", vegetariano: "Vegetariano", vegano: "Vegano" };

// v1.1: un'adesione è, per definizione, una camera che partecipa — non
// esiste più "partecipa=false" (vedi la nota gemella in
// src/modules/grigliata/application/iscriviti.js). Il menu quindi non è
// più opzionale. v1.3: "senza glutine" e una nota libera, scritti dal
// residente — qui si leggono soltanto. v1.3.1: "dieta" torna un campo a sé
// (nel pannello non si segna 'classico', si segnano solo gli altri due).
// v1.5: i ticket di questa adesione — uno per voce del menu scelto, esistono
// solo a pagamento confermato (v1.8: tenuti allineati al menu, vedi
// grigliata_allinea_ticket in SQL); `numero` resta null finché il residente
// non usa quel ticket dal proprio schermo (Grigliata.tsx). `id` è il ticket
// di QUESTA adesione, `menu_ticket_id` la voce del menu a cui corrisponde —
// è quello da confrontare con MenuTicketVoce.id. Il delegato può solo
// rimettere "da usare" un ticket consumato (Ripristina), non usarlo.
type AdesioneTicket = {
  id: number; menu_ticket_id: number; nome: string; emoji?: string | null;
  usato: boolean; numero: number | null; usato_at: string | null;
};

export type Adesione = {
  id: number; room: string; menu_id: number; dieta: Dieta;
  senza_glutine: boolean; note: string | null;
  pagamento_dichiarato: boolean; pagamento_confermato: boolean;
  confermato_da: string | null; confermato_at: string | null;
  ticket: AdesioneTicket[];
};

export type Evento = {
  id: number; titolo: string; scadenza: string;
  // v1.4: il giorno VERO in cui si mangia — distinto dalla scadenza delle
  // adesioni/pagamenti, che può cadere prima.
  giorno_evento: string;
  /** v1.4 — assente se il server non ha ancora la migrazione 048: vale attivi. */
  pagamenti_attivi?: boolean;
  /** v1.4.1 — quota a persona in euro; null/assente = non indicata. */
  quota?: number | string | null;
  paypal_link: string | null; satispay_link: string | null;
  chiuso: boolean; attiva: boolean;
  /** v1.6 — assente se il server non ha ancora la migrazione 052: vale aperte
   *  finche' non e' passata `scadenza`. */
  iscrizioni_aperte?: boolean;
  /** v1.7.2 — l'ultimo numero di ticket assegnato in questo evento (unico per
   *  tutte le voci). Assente se il server non ha ancora la migrazione 056:
   *  si ricava allora dai ticket ancora presenti. */
  ticket_contatore?: number;
  menu: MenuVoce[];
};

// ─── Filtri e raggruppamento delle camere ──────────────────────────────────────
//
// v1.4: con decine di camere la griglia per piano non basta più a rispondere
// a "quante vegane?", "chi ha scritto di un'allergia?". Filtri che si
// sommano (menu E esigenza E pagamento) più una ricerca libera nelle note, e la scelta
// di raggruppare per piano (dove sono) o per menu (cosa preparare).
export type FiltroEsigenza = "tutte" | "vegetariano" | "vegano" | "senza_glutine" | "note" | "nessuna";
export type Raggruppa = "piano" | "menu";
// v1.8: il pannello è diviso in tre schede — come si configura l'evento,
// chi partecipa (e chi ha pagato), e il giorno vero coi ticket.
export type Scheda = "impostazioni" | "partecipanti" | "giorno";
// v1.7.1: a che punto è il pagamento — "da confermare" (ha dichiarato di aver
// pagato, il delegato non ha ancora confermato) è la lista su cui lavorare.
// v1.10.2: anche solo confermato / non confermato, a prescindere da cosa ha
// dichiarato il residente — questi due valgono anche coi pagamenti in app
// spenti (si conferma comunque, es. contanti), gli altri due no.
export type FiltroPagamento = "tutti" | "confermato" | "non_confermato" | "da_confermare" | "non_dichiarato";
export const FILTRI_SOLO_CON_PAGAMENTI: FiltroPagamento[] = ["da_confermare", "non_dichiarato"];

export function haPagamento(a: Adesione, f: FiltroPagamento): boolean {
  switch (f) {
    case "tutti": return true;
    case "da_confermare": return a.pagamento_dichiarato && !a.pagamento_confermato;
    case "non_dichiarato": return !a.pagamento_dichiarato && !a.pagamento_confermato;
    case "confermato": return a.pagamento_confermato;
    case "non_confermato": return !a.pagamento_confermato;
  }
}

export function haEsigenza(a: Adesione, f: FiltroEsigenza): boolean {
  switch (f) {
    case "tutte": return true;
    case "vegetariano": return a.dieta === "vegetariano";
    case "vegano": return a.dieta === "vegano";
    case "senza_glutine": return a.senza_glutine;
    case "note": return Boolean(a.note);
    case "nessuna": return a.dieta === "classico" && !a.senza_glutine && !a.note;
  }
}


export type Overview = { evento: Evento | null; adesioni: Adesione[] };
