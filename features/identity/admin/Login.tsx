import { useEffect, useState } from "react";
import { S } from "../../admin-shared/adminStyles";
import { Antibot } from "./Antibot";

// ─── Login ───────────────────────────────────────────────────────────────────

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Antibot: la chiave pubblica la dice il server (null = antibot spento).
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    fetch("/api/admin/auth").then((r) => r.json())
      .then((d) => setSiteKey(d?.antibot?.enabled ? d.antibot.siteKey : null))
      .catch(() => setSiteKey(null))
      .finally(() => setPronto(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (siteKey && !token) { setErr("Completa la verifica anti-bot."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", username, password, antibot_token: token }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "credenziali non valide");
      onDone();
    } catch (e: any) {
      setErr(e.message);
      // Un token Turnstile vale una sola verifica: dopo un rifiuto se ne chiede uno nuovo.
      setToken(null); setResetKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <form onSubmit={submit} style={{ ...S.card, padding: 24, width: "100%", maxWidth: 360 }}>
        <p style={{ fontSize: 13, ...S.sub, marginBottom: 18 }}>
          Dopo l'accesso le sezioni riservate compaiono accanto a Lavanderia,
          Cinema e Musica, e prenoti come Direzione.
        </p>

        <label style={{ fontSize: 12, ...S.sub }}>Utente</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={username} autoFocus
               onChange={(e) => setUsername(e.target.value)} autoComplete="username" />

        <label style={{ fontSize: 12, ...S.sub }}>Password</label>
        <input style={{ ...S.input, marginBottom: 18 }} type="password" value={password}
               onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        <Antibot siteKey={siteKey} onToken={setToken} onError={setErr} resetKey={resetKey} />

        {err && <p style={{ fontSize: 13, color: "var(--destructive-text)", marginBottom: 12 }}>{err}</p>}

        <button type="submit" disabled={busy || !pronto}
          style={{ ...S.btn, width: "100%", padding: 12, background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "transparent" }}>
          {busy ? "Accesso…" : "Entra"}
        </button>
      </form>
    </div>
  );
}
