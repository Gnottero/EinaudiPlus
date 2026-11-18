// La chiamata verso /api/admin/data, condivisa da ogni scheda del pannello:
// tutte parlano con lo stesso endpoint, distinte solo dall'`action` che
// mandano.

// La sezione su cui sta lavorando un superadmin. Gli altri ruoli hanno UNA
// sezione sola e il server la ricava dall'account (ignora questo campo); il
// superadmin non ne ha una, quindi sceglie dal selettore in cima al pannello e
// ogni chiamata la porta con se': nessuna scheda deve ricordarsene.
//
// Una chiamata che vuole esplicitamente "tutte le sezioni" (es. l'elenco delle
// sezioni) passa `section_id: undefined` nel payload: il payload vince.
const CHIAVE_SEZIONE = "einaudiplus.adminSection";
let sezioneCorrente: number | null = (() => {
  try {
    const v = Number(localStorage.getItem(CHIAVE_SEZIONE));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch { return null; }
})();

export const getAdminSection = (): number | null => sezioneCorrente;

export function setAdminSection(id: number | null): void {
  sezioneCorrente = id;
  try {
    if (id === null) localStorage.removeItem(CHIAVE_SEZIONE);
    else localStorage.setItem(CHIAVE_SEZIONE, String(id));
  } catch { /* modalita' privata: vale solo per questa sessione */ }
}

export async function call<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/admin/data", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-requested-with": "admin" },
    body: JSON.stringify({ action, ...(sezioneCorrente !== null ? { section_id: sezioneCorrente } : {}), ...payload }),
  });
  if (res.status === 401) throw new Error("SESSIONE_SCADUTA");
  const data = await res.json();
  if (!data.ok) {
    // I campi oltre `error` restano attaccati all'eccezione: alcune funzioni
    // SQL spiegano il rifiuto invece di limitarsi a nominarlo — `con` e
    // `quando` dicono con quale evento e in che data una programmazione si
    // sovrappone. Buttarli via lasciava all'utente il compito di cercarlo.
    const err = Object.assign(new Error(data.error || "errore"), data);
    throw err;
  }
  return data;
}
