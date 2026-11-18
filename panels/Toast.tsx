import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { RED } from "../tema";

export function Toast({ msg, onClose, undo }: { msg: string; onClose: () => void; undo?: { label: string; onUndo: () => void } }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    // In basso, non in cima: e' li' che si guarda dopo aver toccato uno slot
    // in fondo alla griglia, e non copre l'intestazione su schermi bassi.
    // Largo al massimo quanto lo schermo meno i margini, e il testo va a capo:
    // con "whitespace-nowrap" un messaggio lungo (per esempio quello che spiega
    // che il turno e' della Direzione) usciva dai due lati del telefono.
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-toast-in pointer-events-none px-4 w-full max-w-[26rem]">
      <div className="flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-2xl pointer-events-auto border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <CheckCircle2 size={14} className="shrink-0" style={{ color: RED }}/>
        <span className="text-sm font-medium leading-snug min-w-0 flex-1" style={{ color: "var(--foreground)", overflowWrap:"anywhere" }}>{msg}</span>
        {undo && (
          <button
            onClick={() => { undo.onUndo(); onClose(); }}
            className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg"
            style={{ color: RED }}
          >
            {undo.label}
          </button>
        )}
      </div>
    </div>
  );
}
