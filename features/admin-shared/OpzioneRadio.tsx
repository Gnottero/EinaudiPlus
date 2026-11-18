import type { ReactNode } from "react";
import { S } from "./adminStyles";

// Una scelta esclusiva a "scheda radio": cerchio pieno se selezionata, bordo
// e fondo in tinta primaria. Usata dalle schede che chiedono una sola opzione
// fra poche (Tema, Cambio biancheria).
export function OpzioneRadio({ scelto, disabled, busy, onClick, children }: {
  scelto: boolean; disabled: boolean; busy: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        ...S.card, padding: 14, textAlign: "left", cursor: busy ? "default" : "pointer",
        display: "flex", alignItems: "center", gap: 12,
        borderColor: scelto ? "var(--primary)" : "var(--border)",
        background: scelto ? "color-mix(in srgb, var(--primary) 8%, var(--card))" : "var(--card)",
      }}>
      <div style={{
        width: 20, height: 20, borderRadius: 99, flexShrink: 0,
        border: `2px solid ${scelto ? "var(--primary)" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {scelto && <div style={{ width: 10, height: 10, borderRadius: 99, background: "var(--primary)" }} />}
      </div>
      {children}
    </button>
  );
}
