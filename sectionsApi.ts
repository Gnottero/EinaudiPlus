// sectionsApi.ts — la configurazione delle sezioni del collegio, lato client.
//
// Una sezione ha una lettera (con cui i residenti entrano: V112, P21-b), un
// elenco di intervalli di camere e le funzionalita' accese. Il server resta
// l'autorita': questa configurazione serve solo a decidere cosa MOSTRARE
// (quali schede, quali camere sono plausibili) e a dare un errore chiaro
// subito, prima di un giro di rete.
//
// Fail-soft: se la configurazione non arriva (rete, server vecchio) l'app
// funziona lo stesso, semplicemente senza nascondere niente e senza il
// controllo semantico sulla camera — la sintassi e il server fanno il resto.

const TOKEN = import.meta.env.VITE_SECRET_TOKEN;

/** Le funzionalita' che una sezione puo' spegnere. Chiave mancante = accesa. */
export type FeatureKey =
  | "laundry" | "cinema" | "music" | "conference" | "bikes"
  | "linen" | "grigliata" | "feedback" | "notifications" | "theme";

/** Le risorse che una sezione puo' CONDIVIDERE con un'altra (section.shared_with). */
export type SharedKey = "cinema" | "music" | "conference" | "linen" | "grigliata" | "theme";

interface SectionRange {
  id?: number; label: string; from: number; to: number; laundry_id: number | null;
  /** Colore del gruppo di camere (#rrggbb), scelto dall'amministratore della sezione. */
  color?: string | null;
}

export interface Section {
  id: number; code: string; number: number; name: string; active: boolean;
  features: Partial<Record<FeatureKey, boolean>>;
  /** Risorse usate da un'altra sezione: {conference: <id proprietario>}. Vuoto = tutte proprie. */
  shared_with?: Partial<Record<SharedKey, number | null>>;
  ranges: SectionRange[];
}

export interface SectionConfig {
  sections: Section[];
  laundries: { id: number; slug: string; name: string; pairs: number }[];
}

/** La camera dichiarata su questo dispositivo. */
export function currentRoom(): string {
  try { return localStorage.getItem("laundryhub.room") || ""; } catch { return ""; }
}

let cache: SectionConfig | null = null;
let inFlight: Promise<SectionConfig | null> | null = null;

/** Dopo una modifica amministrativa (colori, nomi): la prossima lettura ricarica. */
export function invalidateSectionConfig(): void { cache = null; }

/** L'ultima configurazione caricata, o null se non c'e' (ancora). */
export const getCachedConfig = (): SectionConfig | null => cache;

/** Carica la configurazione una volta sola; null se non disponibile. */
export function loadSectionConfig(): Promise<SectionConfig | null> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const res = await fetch(`/api/laundry?token=${TOKEN}&config=1`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.sections)) return null;
        cache = { sections: data.sections, laundries: Array.isArray(data.laundries) ? data.laundries : [] };
        return cache;
      } catch {
        return null;
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}

// ─── Funzioni pure sulla configurazione ──────────────────────────────────────

const ROOM_RE = /^([A-Za-z]{1,2})(\d{1,4})(-?[abAB])?$/;

export function parseRoom(room: string | null | undefined): { code: string; n: number } | null {
  const m = ROOM_RE.exec(String(room ?? "").trim());
  return m ? { code: m[1].toUpperCase(), n: Number(m[2]) } : null;
}

/** La sezione attiva di una camera e l'intervallo in cui cade, se la config c'e'. */
export function resolveRoom(config: SectionConfig | null, room: string | null | undefined):
  { section: Section; range: SectionRange } | null {
  const p = parseRoom(room);
  if (!p || !config) return null;
  const section = config.sections.find((s) => s.code === p.code && s.active);
  const range = section?.ranges.find((r) => p.n >= r.from && p.n <= r.to);
  return section && range ? { section, range } : null;
}

/** true se la funzionalita' e' accesa (o se non si sa: nessuna sezione = tutto acceso). */
export const featureOn = (section: Section | null | undefined, f: FeatureKey): boolean =>
  section?.features?.[f] !== false;
