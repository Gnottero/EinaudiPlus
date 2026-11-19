import { S } from "./adminStyles";

/** Interruttore on/off (stile iOS) con titolo e sottotitolo: tutta la riga è il bersaglio del tocco. */
export function Interruttore({ acceso, onClick, titolo, sottotitolo, disabilitato }: {
  acceso: boolean; onClick: () => void; titolo: string; sottotitolo?: string; disabilitato?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} role="switch" aria-checked={acceso} disabled={disabilitato}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
        minHeight: 44, background: "none", border: "none", padding: 0, textAlign: "left", color: "var(--foreground)",
        opacity: disabilitato ? 0.5 : 1,
      }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15 }}>{titolo}</span>
        {sottotitolo && <span style={{ display: "block", fontSize: 13, ...S.sub }}>{sottotitolo}</span>}
      </span>
      <span className="ios-switch" data-on={acceso} />
    </button>
  );
}
