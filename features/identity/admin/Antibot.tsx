import { useEffect, useRef } from "react";

// ─── Verifica anti-bot (Cloudflare Turnstile) ────────────────────────────────
//
// Il widget produce un token monouso che il server verifica con Cloudflare
// (api/admin/auth.js, src/modules/identity). Qui non si decide niente: si
// mostra il widget e si riporta il token.
//
// La chiave pubblica non e' compilata nel bundle: la serve /api/admin/auth
// (campo `antibot`), cosi' cambiare chiave non richiede un nuovo build. Se
// l'antibot e' spento sul server, `siteKey` e' null e questo componente non
// disegna niente.
//
// Lo script arriva da challenges.cloudflare.com, ammesso dalla CSP in
// vercel.json (script-src e frame-src).

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error("verifica anti-bot non caricata")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * `resetKey`: cambiandolo (es. dopo un login rifiutato) il widget si
 * rigenera — un token Turnstile vale una sola verifica.
 */
export function Antibot({ siteKey, onToken, onError, resetKey }: {
  siteKey: string | null;
  onToken: (token: string | null) => void;
  onError?: (msg: string) => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let vivo = true;
    loadScript().then(() => {
      if (!vivo || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => { onToken(null); onError?.("verifica anti-bot non riuscita, ricarica la pagina"); },
      });
    }).catch((e) => onError?.(e.message));
    return () => {
      vivo = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // onToken/onError cambiano a ogni render del padre: il widget si monta una volta per chiave.
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === undefined || !widget.current || !window.turnstile) return;
    onToken(null);
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} style={{ minHeight: 65, marginBottom: 14 }} />;
}
