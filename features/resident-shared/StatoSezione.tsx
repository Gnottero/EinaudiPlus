// StatoSezione.tsx — le tre schermate "di stato" che le sezioni per-camera
// (Bici, Grigliata) mostrano al posto del contenuto: niente camera, in
// caricamento, errore con "riprova". Condivise perché identiche pixel per pixel.

import type { ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

const RED = "var(--primary)", RED_FG = "var(--primary-foreground)";

/** Sezione riservata alle camere, aperta da chi non ne ha una (la Direzione). */
export function StatoSoloCamere({ icona, testo, colore }: { icona: ReactNode; testo: string; colore: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
      {icona}
      <p className="text-sm" style={{ color: colore }}>{testo}</p>
    </div>
  );
}

export function StatoCaricamento({ testo, colore }: { testo: string; colore: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: colore }}>
      <Loader2 size={26} className="animate-spin-slow" style={{ color: RED }} />
      <p className="text-sm">{testo}</p>
    </div>
  );
}

export function StatoErrore({ testo, retry, onRetry, colore }: { testo: string; retry: string; onRetry: () => void; colore: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ color: colore }}>
      <AlertTriangle size={26} style={{ color: "var(--destructive)" }} />
      <p className="text-sm">{testo}</p>
      <button onClick={onRetry} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: RED, color: RED_FG }}>
        {retry}
      </button>
    </div>
  );
}
