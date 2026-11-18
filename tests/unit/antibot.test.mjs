// Antibot del login amministrativo (Cloudflare Turnstile): nessuna rete,
// fetch e verifier finti.
import { verifyTurnstile } from "../../src/modules/identity/infrastructure/turnstileVerifier.js";
import { verifyAntibot } from "../../src/modules/identity/application/verifyAntibot.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok    " + name); }
  else { fail++; console.log("  FALLA " + name + " " + detail); }
};
const section = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 60 - s.length))}`);
const logs = [];
const logger = { warn: (m, x) => logs.push([m, x]) };

section("verifyTurnstile()");
{
  let seen;
  const fetchOk = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ success: true }) }; };
  const r = await verifyTurnstile({ token: "tok", ip: "1.2.3.4", secret: "sec", fetchImpl: fetchOk });
  check("successo -> ok", r.ok === true);
  check("chiama siteverify in POST", /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/.test(seen.url) && seen.init.method === "POST");
  const body = seen.init.body.toString();
  check("manda segreto, token e ip", body.includes("secret=sec") && body.includes("response=tok") && body.includes("remoteip=1.2.3.4"));
  await verifyTurnstile({ token: "t", ip: "unknown", secret: "s", fetchImpl: fetchOk });
  check("ip sconosciuto non viene inviato", !seen.init.body.toString().includes("remoteip"));

  const rifiuta = async () => ({ ok: true, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
  const r2 = await verifyTurnstile({ token: "t", secret: "s", fetchImpl: rifiuta });
  check("success:false -> rifiutato, con i codici", r2.ok === false && r2.reason === "rifiutato" && r2.codes[0] === "invalid-input-response");

  const http500 = async () => ({ ok: false, json: async () => ({}) });
  check("HTTP 500 -> fail-closed", (await verifyTurnstile({ token: "t", secret: "s", fetchImpl: http500 })).reason === "non_raggiungibile");
  const rete = async () => { throw new Error("ECONNRESET"); };
  check("errore di rete -> fail-closed", (await verifyTurnstile({ token: "t", secret: "s", fetchImpl: rete })).ok === false);
  const jsonRotto = async () => ({ ok: true, json: async () => { throw new Error("bad json"); } });
  check("risposta non JSON -> fail-closed", (await verifyTurnstile({ token: "t", secret: "s", fetchImpl: jsonRotto })).ok === false);
  const senzaSuccess = async () => ({ ok: true, json: async () => ({}) });
  check("risposta senza success -> rifiutato", (await verifyTurnstile({ token: "t", secret: "s", fetchImpl: senzaSuccess })).ok === false);
  const successStringa = async () => ({ ok: true, json: async () => ({ success: "true" }) });
  check("success non booleano true -> rifiutato", (await verifyTurnstile({ token: "t", secret: "s", fetchImpl: successStringa })).ok === false);
}

section("verifyAntibot()");
{
  const verifierOk = async () => ({ ok: true });
  const mai = async () => { throw new Error("non doveva essere chiamato"); };

  const spento = await verifyAntibot({ token: "", ip: "1" }, { secret: null, verifier: mai, logger });
  check("senza segreto: passa, ma enabled:false", spento.ok === true && spento.enabled === false);
  check("... e lo dice nel log", logs.some(([m]) => /antibot non configurato/.test(m)));

  const senzaToken = await verifyAntibot({ token: "", ip: "1" }, { secret: "s", verifier: mai, logger });
  check("con segreto, senza token: respinto senza chiamare Cloudflare", senzaToken.ok === false && /anti-bot/.test(senzaToken.error));
  check("token non stringa: respinto", (await verifyAntibot({ token: { a: 1 }, ip: "1" }, { secret: "s", verifier: mai, logger })).ok === false);
  check("token enorme: respinto", (await verifyAntibot({ token: "x".repeat(3000), ip: "1" }, { secret: "s", verifier: mai, logger })).ok === false);
  check("token valido: ok", (await verifyAntibot({ token: "abc", ip: "1" }, { secret: "s", verifier: verifierOk, logger })).ok === true);

  let args;
  await verifyAntibot({ token: " abc ", ip: "9.9.9.9" }, { secret: "s", verifier: async (a) => { args = a; return { ok: true }; }, logger });
  check("token ripulito, ip e segreto passati", args.token === "abc" && args.ip === "9.9.9.9" && args.secret === "s");

  const no = await verifyAntibot({ token: "abc", ip: "1" }, { secret: "s", verifier: async () => ({ ok: false, reason: "rifiutato", codes: ["x"] }), logger });
  check("token rifiutato: messaggio di verifica non superata", no.ok === false && /non superata/.test(no.error));
  const giu = await verifyAntibot({ token: "abc", ip: "1" }, { secret: "s", verifier: async () => ({ ok: false, reason: "non_raggiungibile" }), logger });
  check("Cloudflare non raggiungibile: respinto (fail-closed) con messaggio diverso", giu.ok === false && /non disponibile/.test(giu.error));
}

console.log(`\nPASSATI: ${pass}   FALLITI: ${fail}`);
process.exit(fail ? 1 : 0);
