import { Download, Printer } from "lucide-react";
import { RED, RED_FG } from "../../tema";

// Piede dei fogli stampabili (impegni della sala, settimana della lavanderia):
// "CSV" scarica, "Stampa" apre la stampa del browser. Entrambi disabilitati
// quando non c'è niente da esportare (`vuoto`).
export function PiedeStampa({ vuoto, onCsv, bordo, testo }: {
  vuoto: boolean; onCsv: () => void; bordo: string; testo: string;
}) {
  const opacity = vuoto ? 0.5 : 1;
  return (
    <div className="foglio-modale__piede pb-7 pt-3 flex gap-2">
      <button onClick={onCsv} disabled={vuoto}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold border"
        style={{ borderColor: bordo, color: testo, background: "transparent", opacity }}>
        <Download size={15} /> CSV
      </button>
      <button onClick={() => window.print()} disabled={vuoto}
        className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
        style={{ background: RED, color: RED_FG, opacity }}>
        <Printer size={15} /> Stampa
      </button>
    </div>
  );
}
