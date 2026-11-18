// Use-case: il tentativo di login ha superato l'antibot?
//
// `secret` assente = antibot non configurato: si lascia passare (un login
// bloccato finche' nessuno ha creato le chiavi Turnstile sarebbe peggio) ma lo
// si dice nel log a ogni tentativo, perche' "spento" non deve diventare
// "dimenticato". Con il segreto configurato, invece, tutto cio' che non e' un
// token verificato dal server e' un rifiuto.

export async function verifyAntibot({ token, ip }, { secret, verifier, logger }) {
  if (!secret) {
    logger?.warn("antibot non configurato (TURNSTILE_SECRET_KEY assente): login senza verifica");
    return { ok: true, enabled: false };
  }
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > 2048) {
    return { ok: false, enabled: true, error: "completa la verifica anti-bot" };
  }
  const esito = await verifier({ token: t, ip, secret });
  if (esito.ok) return { ok: true, enabled: true };
  logger?.warn("antibot respinto", { reason: esito.reason, codes: esito.codes });
  return {
    ok: false, enabled: true,
    error: esito.reason === "non_raggiungibile"
      ? "verifica anti-bot non disponibile, riprova fra poco"
      : "verifica anti-bot non superata, riprova",
  };
}
