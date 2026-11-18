import type { RoomKind, RoomBooking } from "../../roomsApi";
import { pianoDi, colorePiano } from "../../piani";
import { fmtMin, ROOM_CFG } from "./orari";

const RED = "var(--primary)";
const OOS = "var(--destructive)";
const sub = "var(--muted-foreground)";
const chip = "var(--secondary)";

// ─── Timeline giornaliera ──────────────────────────────────────────────────────
export function Timeline({ room, bookings, myRoom }: { room: RoomKind; bookings: RoomBooking[]; myRoom: string }) {
  const { winStart, winEnd } = ROOM_CFG[room];
  // Fine "normalizzata": una fascia che termina a 00:00 (o oltre la mezzanotte)
  // arriva con end ≤ start → la trattiamo come +24h (00:00 = 24:00 = 1440).
  const endOf = (b: RoomBooking) => (b.end <= b.start ? b.end + 24 * 60 : b.end);
  // La timeline si estende fino a includere la prenotazione più "tarda",
  // così le fasce 23–00 (e oltre mezzanotte) restano sempre visibili.
  const spanEnd = bookings.reduce((mx, b) => Math.max(mx, endOf(b)), winEnd);
  const span = spanEnd - winStart;
  const pct = (m: number) => `${((m - winStart) / span) * 100}%`;
  // Un tick ogni 3 ore. Prima la musica ne aveva uno ogni 2, perché la sua
  // griglia copriva 14 ore invece di 24; ora che copre la giornata intera come
  // il cinema, lo stesso passo darebbe tredici etichette appiccicate.
  const stepH = 3;
  const ticks: number[] = [];
  for (let m = winStart; m <= spanEnd; m += stepH * 60) ticks.push(m);
  // 1440 = mezzanotte di fine giornata → mostrala come "24:00" sull'asse.
  const tickLabel = (m: number) => (m === 24 * 60 ? "24:00" : fmtMin(m));

  return (
    <div className="px-1 pt-1 pb-6">
      <div className="relative h-16 rounded-xl overflow-hidden" style={{ background: chip }}>
        {/* linee guida orarie */}
        {ticks.map((m) => (
          <div key={"g" + m} className="absolute top-0 bottom-0 w-px"
            style={{ left: pct(m), background: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
        ))}
        {bookings.map((b) => {
          const left = Math.max(b.start, winStart);
          const right = Math.min(endOf(b), spanEnd);
          // Stessa logica della lavanderia (vedi DayView.tsx): la camera dice
          // il piano, e il piano dice il colore — cosi' una camera si
          // riconosce a colpo d'occhio nello stesso modo in ogni sala, non
          // solo in lavanderia. Mescolato col bianco, non con lo sfondo
          // scuro/chiaro del tema: resta un pastello leggibile con testo
          // scuro qualunque sia il tema, invece di restare scuro anch'esso in
          // tema scuro. Chi non ha un piano riconoscibile (DIREZIONE, un nome
          // libero) resta sul colore pieno di prima — aperto/privato per il
          // cinema, che qui e' l'unica informazione che resta da distinguere.
          const piano = pianoDi(b.name);
          const isMe = !!myRoom && b.name.trim().toUpperCase() === myRoom.trim().toUpperCase();
          const open = b.type === "open";
          const pieno = open ? `color-mix(in srgb, ${RED} 82%, transparent)` : `color-mix(in srgb, ${OOS} 72%, transparent)`;
          return (
            <div key={b.id} className="absolute top-0 bottom-0 flex flex-col items-center justify-center overflow-hidden px-1 gap-0.5"
              title={`${b.name} · ${fmtMin(b.start)}–${fmtMin(b.end)}`}
              style={{
                left: pct(left), width: `${((right - left) / span) * 100}%`, minWidth: "10px",
                background: piano ? `color-mix(in srgb, ${colorePiano(piano)} ${isMe ? 72 : 32}%, white)` : pieno,
                borderLeft: "1px solid var(--background)",
              }}>
              <span className="text-[11px] font-semibold leading-none truncate w-full text-center" style={{ color: piano ? "#111" : "#fff" }}>{b.name}</span>
              <span className="text-[9px] font-mono leading-none truncate w-full text-center" style={{ color: piano ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.85)" }}>{fmtMin(b.start)}–{fmtMin(b.end)}</span>
            </div>
          );
        })}
      </div>
      <div className="relative h-5 mt-1.5">
        {ticks.map((m) => (
          <span key={m} className="absolute text-[10px] font-mono -translate-x-1/2" style={{ left: pct(m), color: sub }}>{tickLabel(m)}</span>
        ))}
      </div>
    </div>
  );
}
