// Stili condivisi da ogni scheda del pannello amministrativo.
// Linee guida Apple HIG: bersagli da 44px, pulsanti pieni o "tinted" senza
// contorno, campi con riempimento invece del bordo, angoli 12.

export const S = {
  page: { minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" } as const,
  card: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 } as const,
  sub: { color: "var(--gray-accessible-text)" } as const,
  btn: {
    minHeight: 44, padding: "0 16px", borderRadius: 12, fontSize: 15, fontWeight: 600,
    border: "none", background: "color-mix(in srgb, var(--primary) 12%, transparent)",
    color: "var(--primary)", cursor: "pointer",
  } as const,
  primary: {
    minHeight: 44, padding: "0 16px", borderRadius: 12, fontSize: 15, fontWeight: 600,
    border: "none", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer",
  } as const,
  danger: {
    minHeight: 44, padding: "0 16px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
    border: "none", background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
    color: "var(--destructive-text)",
  } as const,
  input: {
    minHeight: 44, padding: "0 12px", borderRadius: 10, fontSize: 16, width: "100%",
    border: "none", background: "var(--input-background)",
    color: "var(--foreground)",
  } as const,
};
