import { useEffect, useState } from "react";
import { call } from "../../admin-shared/adminApi";
import { S } from "../../admin-shared/adminStyles";
import { OpzioneRadio } from "../../admin-shared/OpzioneRadio";

// ─── Tema stagionale ─────────────────────────────────────────────────────────
//
// Decorazione dell'app lato residenti (neve a Natale, pipistrelli a
// Halloween...), non una funzione: si accende e si spegne quando si vuole,
// senza conferme ne' audit particolare oltre al log normale delle azioni.
// Una sola scelta per tutta l'app — vive nel database (tabella app_theme),
// non nelle Impostazioni di ciascun residente.

type TemaAttivo = "nessuno" | "halloween" | "natale";

const TEMI: [TemaAttivo, string, string][] = [
  ["nessuno",   "Nessuno",   "Aspetto normale, tutto l'anno."],
  ["halloween", "Halloween", "Pipistrelli e una tinta scura sullo sfondo."],
  ["natale",    "Natale",    "Neve che cade sullo schermo."],
];

export function Tema() {
  const [attivo, setAttivo] = useState<TemaAttivo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    call<{ tema: TemaAttivo }>("temaGet")
      .then((r) => setAttivo(r.tema))
      .catch((e: any) => setMsg(e.message));
  }, []);

  async function scegli(tema: TemaAttivo) {
    if (tema === attivo || busy) return;
    setBusy(true); setMsg(null);
    try {
      await call("temaSet", { tema });
      setAttivo(tema);
    } catch (e: any) {
      setMsg("Non è riuscito: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p style={{ fontSize: 13, ...S.sub, marginBottom: 16, maxWidth: "70ch" }}>
        Si applica subito a tutta l'app di residenti, non solo al pannello. Chi la tiene
        aperta la vede al prossimo caricamento (torna in primo piano dopo un po', o ricarica).
      </p>

      {msg && <div style={{ ...S.card, padding: 12, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {TEMI.map(([id, label, desc]) => {
          const scelto = attivo === id;
          return (
            <OpzioneRadio key={id} scelto={scelto} busy={busy} disabled={busy || attivo === null} onClick={() => scegli(id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 12, ...S.sub }}>{desc}</p>
              </div>
            </OpzioneRadio>
          );
        })}
      </div>
    </>
  );
}
