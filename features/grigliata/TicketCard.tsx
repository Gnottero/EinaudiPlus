import { useState, useRef } from "react";
import { ChevronsRight, Lock, Check, Loader2 } from "lucide-react";
import type { Lang } from "../../i18n";
import { T } from "./testi";
import { EMOJI_TICKET_DEFAULT } from "./emojiTicket";
import type * as api from "../../api";

const RED = "var(--primary)", RED_FG = "var(--primary-foreground)";
const GREEN = "#22c55e";
const fg = "var(--foreground)";
const surf = "var(--card)", div = "var(--border)";

// ─── Ticket ─────────────────────────────────────────────────────────────────
//
// Uno slider "scorri per usare" invece di un bottone: un ticket si spende
// con un gesto deliberato, da sinistra a destra fino in fondo — un tocco
// distratto mentre si scorre la pagina non lo brucia. Lasciato prima
// dell'85% della corsa torna indietro da solo.

const KNOB = 48, PAD = 4, SOGLIA = 0.85;

function SlideToUse({ label, disabled, onComplete }: {
  label: string; disabled: boolean; onComplete: () => Promise<boolean>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ px: number; x: number } | null>(null);
  const xRef = useRef(0);
  const [x, setXState] = useState(0);
  const [trascina, setTrascina] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  const setX = (v: number) => { xRef.current = v; setXState(v); };
  const corsa = () => Math.max(1, (trackRef.current?.clientWidth ?? 0) - KNOB - PAD * 2);
  const bloccato = disabled || inCorso;

  async function completa() {
    setX(corsa());
    setInCorso(true);
    const ok = await onComplete();
    setInCorso(false);
    // Riuscito: il ticket diventa "usato" e questo slider sparisce col
    // prossimo load(). Fallito: torna all'inizio, si può riprovare.
    if (!ok) setX(0);
  }

  function giu(e: React.PointerEvent<HTMLDivElement>) {
    if (bloccato) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { px: e.clientX, x: xRef.current };
    setTrascina(true);
  }
  function muovi(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setX(Math.min(corsa(), Math.max(0, start.current.x + e.clientX - start.current.px)));
  }
  function su() {
    if (!start.current) return;
    start.current = null;
    setTrascina(false);
    if (xRef.current >= corsa() * SOGLIA) completa();
    else setX(0);
  }

  const progresso = Math.min(1, x / corsa());

  return (
    <div ref={trackRef} className="relative w-full rounded-full overflow-hidden select-none"
      style={{
        height: KNOB + PAD * 2,
        background: `color-mix(in srgb, ${RED} 12%, var(--secondary))`,
        opacity: disabled ? 0.55 : 1,
      }}>
      {/* La scia dietro la manopola: si riempie mentre si trascina. */}
      <div className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: x + KNOB + PAD * 2,
          background: `color-mix(in srgb, ${RED} 30%, transparent)`,
          transition: trascina ? "none" : "width .25s ease",
        }} />
      <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold pointer-events-none"
        style={{ color: fg, opacity: 1 - progresso * 1.4, paddingLeft: KNOB }}>
        {inCorso ? <Loader2 size={18} className="animate-spin-slow" /> : label}
      </p>
      <div role="button" tabIndex={bloccato ? -1 : 0} aria-label={label} aria-disabled={bloccato}
        onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={su}
        onKeyDown={(e) => { if (!bloccato && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); completa(); } }}
        className="absolute rounded-full flex items-center justify-center"
        style={{
          top: PAD, left: PAD, width: KNOB, height: KNOB,
          transform: `translateX(${x}px)`,
          transition: trascina ? "none" : "transform .25s ease",
          background: RED, color: RED_FG,
          boxShadow: "0 2px 8px rgba(0,0,0,.25)",
          touchAction: "none", cursor: bloccato ? "default" : "grab",
        }}>
        {disabled ? <Lock size={18} /> : <ChevronsRight size={22} />}
      </div>
    </div>
  );
}

/** Una carta-ticket: emoji e nome sopra, una linea tratteggiata con le due
 *  tacche laterali come un biglietto vero, sotto lo slider (o lo stato
 *  "usato" col suo numero). */
export function TicketCard({ tk, t, bloccatoFino, onUsa }: {
  tk: api.GrigliataTicket;
  t: (typeof T)[Lang];
  bloccatoFino: string | null;
  onUsa: () => Promise<boolean>;
}) {
  const tacca = (lato: "left" | "right") => (
    <span className="absolute rounded-full"
      style={{ width: 18, height: 18, top: -9, [lato]: -9, background: "var(--background)", border: `1px solid ${div}` }} />
  );
  return (
    <div className="rounded-2xl border overflow-hidden"
      style={{
        background: tk.usato ? `color-mix(in srgb, ${GREEN} 8%, ${surf})` : surf,
        borderColor: tk.usato ? `color-mix(in srgb, ${GREEN} 35%, ${div})` : div,
      }}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="shrink-0 flex items-center justify-center rounded-2xl"
          style={{
            width: 52, height: 52, fontSize: 30, lineHeight: 1,
            background: tk.usato ? `color-mix(in srgb, ${GREEN} 15%, transparent)` : `color-mix(in srgb, ${RED} 12%, transparent)`,
            filter: tk.usato ? "grayscale(0.6)" : "none",
          }}>
          {tk.emoji || EMOJI_TICKET_DEFAULT}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight" style={{ color: fg, overflowWrap: "anywhere" }}>{tk.nome}</p>
          {tk.usato && (
            <p className="text-xs font-semibold mt-0.5 flex items-center gap-1" style={{ color: GREEN }}>
              <Check size={13} />{t.ticketUsato(tk.numero ?? 0)}
            </p>
          )}
        </div>
        {tk.usato && tk.numero != null && (
          <span className="shrink-0 text-2xl font-extrabold tabular-nums" style={{ color: GREEN }}>#{tk.numero}</span>
        )}
      </div>

      {!tk.usato && (
        <div className="relative px-4 pt-3.5 pb-4" style={{ borderTop: `2px dashed ${div}` }}>
          {tacca("left")}{tacca("right")}
          <SlideToUse
            label={bloccatoFino ? t.ticketBloccato(bloccatoFino) : t.ticketScorriUsa}
            disabled={bloccatoFino != null}
            onComplete={onUsa} />
        </div>
      )}
    </div>
  );
}
