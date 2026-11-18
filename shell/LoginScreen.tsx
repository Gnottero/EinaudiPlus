import { Delete } from "lucide-react";
import { useState } from "react";
import { WashingMachine } from "../icons";
import { useTastieraFisica, TASTI_CAMERA } from "../hooks";
import { type SectionConfig } from "../sectionsApi";
import { APP_VERSION, isValidRoom, normalizeRoom } from "../modello";
import { T, type Lang } from "../i18n";
import { RED, RED_FG, type Theme } from "../tema";

// ─── Login screen ─────────────────────────────────────────────────────────────

export function LoginScreen({ lang, config, onLogin }: {
  theme?: Theme; lang: Lang; config: SectionConfig | null; onLogin: (room: string) => void;
}) {
  const t = T[lang];
  const [room, setRoom] = useState("");
  const fg   = "var(--foreground)";
  const sub  = "var(--gray-accessible-text)";
  const chip = "var(--secondary)";
  const surf = "var(--card)";

  function submit() {
    if (room.length === 0) return;
    const r = normalizeRoom(room);
    if (!isValidRoom(r, config)) {
      alert(t.roomFormatError);
      return;
    }
    onLogin(r);
  }

  // La tastiera fisica: vale sempre in questa schermata. Vedi useTastieraFisica.
  useTastieraFisica(true, setRoom, submit, 8, TASTI_CAMERA);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      <div className="flex flex-col items-center mb-10">
        <div className="p-4 rounded-3xl mb-5" style={{ background:`color-mix(in srgb, var(--primary) 18%, transparent)` }}>
          <WashingMachine size={36} style={{ color:RED }}/>
        </div>
        <h1 className="text-2xl font-bold mb-1 text-center" style={{ color:fg }}>{t.welcome}</h1>
        <p className="text-sm text-center leading-relaxed" style={{ color:sub }}>
          {t.enterRoom}
        </p>
        {/* Dalla v2.0 la camera comincia con la lettera della sezione: chi
            aveva salvato solo le cifre se lo ritrova qui, spiegato. */}
        <p className="text-xs text-center leading-relaxed mt-1.5" style={{ color:sub }}>
          {t.roomHint}
        </p>
      </div>

      <div className="w-full rounded-2xl px-5 py-4 mb-5 flex items-center justify-between border" style={{ background:surf, borderColor:"var(--border)" }}>
        <span className="text-sm font-mono" style={{ color:sub }}>{t.room}</span>
        <span className="text-4xl font-mono font-bold tabular-nums" style={{ color:room?fg:`color-mix(in srgb, var(--foreground) 15%, transparent)` }}>
          {normalizeRoom(room) || "—"}
        </span>
      </div>

      {/* Le lettere delle sezioni, se la configurazione e' arrivata: un tocco
          mette (o cambia) il prefisso senza dover aprire la tastiera. Senza
          configurazione la lettera si scrive da tastiera, come prima. */}
      {(config?.sections ?? []).some((x) => x.active) && (
        <div className="flex flex-wrap justify-center gap-2 w-full mb-3">
          {(config?.sections ?? []).filter((x) => x.active).map((x) => {
            const attiva = /^[A-Za-z]+/.exec(normalizeRoom(room))?.[0] === x.code;
            return (
              <button key={x.id}
                onClick={()=>setRoom((r) => x.code + r.replace(/^[A-Za-z]+/, ""))}
                className="rounded-xl px-3 h-9 text-sm font-bold transition-all active:scale-95"
                style={attiva ? { background:RED, color:RED_FG } : { background:chip, color:fg }}>
                {x.code}<span className="ml-1.5 text-[11px] font-medium opacity-70">{x.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2.5 w-full mb-4">
        {/* setRoom(r => …) e non setRoom(room + k): due tocchi nello stesso
            istante leggerebbero entrambi lo stesso valore vecchio e la prima
            cifra andrebbe persa. Con la forma funzionale si accodano. */}
        {["1","2","3","A", "4","5","6","B", "7","8","9","-"].map((k)=>(
          <button key={k} onClick={()=>setRoom(r=>r.length<8?r+k:r)}
            className="rounded-2xl h-14 text-xl font-bold transition-all active:scale-95"
            style={{ background:chip, color:fg }}>{k}</button>
        ))}
        <button onClick={()=>setRoom(r=>r.slice(0,-1))}
          className="rounded-2xl h-14 flex items-center justify-center transition-all active:scale-95 col-span-1"
          style={{ background:chip, color:sub }}><Delete size={20}/></button>
        <button onClick={()=>setRoom(r=>r.length<8?r+"0":r)}
          className="rounded-2xl h-14 text-xl font-bold transition-all active:scale-95 col-span-1"
          style={{ background:chip, color:fg }}>0</button>
        <button onClick={submit}
          className="rounded-2xl h-14 text-xl font-bold transition-all active:scale-95 text-white col-span-2"
          style={{ background:room.length>0?RED:chip, color:room.length>0?RED_FG:sub }}>→</button>
      </div>

      <button
        onClick={()=>onLogin("")}
        className="w-full py-3.5 rounded-2xl text-sm font-medium transition-all active:scale-[0.98] border"
        style={{ borderColor:"var(--border)", color:sub, background:"transparent" }}>
        {t.skip}
      </button>

      {/* Solo da schermo grande: su un telefono la tastiera fisica non c'è e
          la riga sarebbe un'istruzione impossibile da seguire. */}
      <p className="text-[10px] mt-4 hidden md:block" style={{ color:sub }}>
        {t.usaTastiera}
      </p>

      <p className="text-[10px] font-mono mt-6" style={{ color:sub }}>v. {APP_VERSION}</p>
    </div>
  );
}

// La barra fissa in fondo — Dashboard/Giornaliero/Settimana — non c'e' piu'.
// Le sue tre voci valevano solo dentro la lavanderia, e un banner sempre
// visibile per tre destinazioni non giustificava piu' lo spazio che
// occupava: si prenota dal "+" accanto alle proprie prenotazioni, e le due
// schermate che restano — Giornaliero e Settimana — si scambiano fra loro
// con l'interruttore in cima a ciascuna (vedi IntestazioneVista) invece che
// da un banner sempre in vista. Su desktop restano nella sidebar.
