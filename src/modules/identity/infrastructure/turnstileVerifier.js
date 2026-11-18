// Verifica server-side di un token Cloudflare Turnstile.
//
// Il widget nel browser produce un token monouso; solo questa chiamata, col
// segreto, dice a Cloudflare "e' valido?". Un token verificato solo dal
// client non prova niente.
//
// Fail-closed: se Cloudflare non risponde (rete, timeout, 5xx) la verifica
// FALLISCE. Sul login amministrativo e' la scelta giusta — stessa logica di
// rateLimit con failOpen:false: un attaccante non deve poter spegnere la
// difesa provocando un guasto.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 4000;

/**
 * @returns {Promise<{ ok: boolean, reason?: "rifiutato" | "non_raggiungibile", codes?: string[] }>}
 */
export async function verifyTurnstile({ token, ip, secret, fetchImpl = fetch }) {
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") form.set("remoteip", ip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SITEVERIFY, { method: "POST", body: form, signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: "non_raggiungibile" };
    const data = await res.json();
    return data?.success === true
      ? { ok: true }
      : { ok: false, reason: "rifiutato", codes: data?.["error-codes"] ?? [] };
  } catch {
    return { ok: false, reason: "non_raggiungibile" };
  } finally {
    clearTimeout(timer);
  }
}
