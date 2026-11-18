// piani.ts — a quale gruppo di camere appartiene una camera (un piano, un
// edificio) e con che colore la si riconosce a colpo d'occhio.
//
// I gruppi non sono piu' una convenzione scritta nel codice: sono gli
// INTERVALLI di camere di ogni sezione (section_range), ognuno con un nome e
// un colore che l'amministratore della sezione puo' cambiare dal pannello.
// Il nome del file resta "piani" perche' per la sezione V (Valentino) quei
// gruppi sono i piani e la Manica.
//
// Il colore e' un aiuto visivo, non uno stato: per questo non e' una coppia
// chiaro/scuro come GREEN/GREEN_T in tema.ts. Quei colori sono
// personalizzabili dal pannello Accessibilita' perche' portano un significato
// (libera/occupata/guasta) che deve restare leggibile anche a chi non
// distingue i colori; il gruppo di una camera non porta quel peso — e' un
// raggruppamento, non un giudizio sullo stato di qualcosa.
//
// Si legge la configurazione gia' caricata (getCachedConfig): finche' non c'e'
// (o per una camera fuori da ogni intervallo) non c'e' gruppo e quindi
// nessun colore, esattamente come prima per una camera "fuori schema".

import { getCachedConfig, resolveRoom, type SectionConfig } from "./sectionsApi";

export interface Gruppo { key: string; label: string; color: string; ordine: number }

/** Colori di ripiego per un intervallo a cui l'amministratore non ha ancora dato un colore. */
const RIPIEGO = ["#f97316", "#eab308", "#22c55e", "#ef4444", "#3b82f6", "#a855f7", "#14b8a6", "#ec4899"];

function gruppoDi_(config: SectionConfig, room: string | null | undefined): Gruppo | null {
  const where = resolveRoom(config, room);
  if (!where) return null;
  const { section, range } = where;
  const idx = section.ranges.indexOf(range);
  return {
    key: `${section.code}:${range.id ?? range.label}`,
    label: range.label,
    color: range.color || RIPIEGO[idx % RIPIEGO.length],
    // sezioni in ordine di numero, poi intervalli dal piu' basso: un ordine stabile
    ordine: section.number * 10000 + idx,
  };
}

/** Il gruppo di una camera, o null (DIREZIONE, camera fuori da ogni intervallo, configurazione assente). */
export function pianoDi(room: string | null | undefined, config: SectionConfig | null = getCachedConfig()): Gruppo | null {
  return config ? gruppoDi_(config, room) : null;
}

/** I gruppi che compaiono fra queste camere, nell'ordine sezione/intervallo (quelli senza camere non ci sono). */
export function gruppiPresenti(rooms: (string | null | undefined)[], config: SectionConfig | null = getCachedConfig()): Gruppo[] {
  if (!config) return [];
  const per = new Map<string, Gruppo>();
  for (const r of rooms) {
    const g = gruppoDi_(config, r);
    if (g && !per.has(g.key)) per.set(g.key, g);
  }
  return [...per.values()].sort((a, b) => a.ordine - b.ordine);
}

export const nomePiano   = (g: Gruppo) => g.label;
export const colorePiano = (g: Gruppo) => g.color;
