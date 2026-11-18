import { useState, useEffect } from "react";
import { Download, Share, Menu } from "lucide-react";
import { T, type Lang } from "../i18n";
import { RED, RED_FG } from "../tema";

// ─── Prompt installazione PWA ───────────────────────────────────────────────────
// Se l'app è già installata (standalone) o è già stata chiesta una volta → non
// mostra nulla. Altrimenti propone l'installazione: su Android usa il prompt
// nativo, su iPhone mostra le istruzioni (Condividi → Aggiungi a Home).
export function InstallPrompt({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone) return;
    let asked = false;
    try { asked = localStorage.getItem("einaudiplus.installAsked") === "1"; } catch {}
    if (asked) return;

    if (isIOS) {
      const id = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(id);
    }
    const onReady = () => { setDeferred((window as any).deferredPWAPrompt); setShow(true); };
    if ((window as any).deferredPWAPrompt) onReady();
    window.addEventListener("pwa-installable", onReady);
    return () => window.removeEventListener("pwa-installable", onReady);
  }, [isIOS]);

  // Apertura manuale dal pulsante in alto (ignora il flag "già chiesto").
  useEffect(() => {
    const open = () => { setDeferred((window as any).deferredPWAPrompt); setShow(true); };
    window.addEventListener("open-install", open);
    return () => window.removeEventListener("open-install", open);
  }, []);

  function close() {
    try { localStorage.setItem("einaudiplus.installAsked", "1"); } catch {}
    setShow(false);
  }
  async function install() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
    }
    close();
  }

  if (!show) return null;
  // Modalità: iOS (istruzioni Condividi), nativa (prompt del browser),
  // manuale (Android/Samsung senza prompt → istruzioni dal menu).
  const mode: "ios" | "native" | "manual" = isIOS ? "ios" : deferred ? "native" : "manual";
  const bodyText = mode === "ios" ? t.installIosBody : mode === "manual" ? t.installAndroidBody : t.installBody;
  return (
    <div className="absolute inset-0 z-50 flex items-end animate-toast-in" style={{ background: "rgba(0,0,0,0.55)" }} onClick={close}>
      <div className="w-full rounded-t-3xl pt-5 pb-7 px-6 max-h-[92%] overflow-y-auto overscroll-contain" style={{ background: "var(--background)" }} onClick={(e)=>e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "color-mix(in srgb, var(--foreground) 15%, transparent)" }}/>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-2xl" style={{ background: `color-mix(in srgb, var(--primary) 15%, transparent)`, color: RED }}>
            <Download size={20}/>
          </div>
          <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{t.installTitle}</p>
        </div>
        <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--gray-accessible-text)" }}>{bodyText}</p>
        {mode === "native" ? (
          <button onClick={install}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold mb-2 transition-all active:scale-[0.98]"
            style={{ background: RED, color: RED_FG }}>
            <Download size={16}/>{t.installCta}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 mb-2 border text-center"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}>
            {mode === "ios" ? <Share size={16} style={{ color: RED }}/> : <Menu size={16} style={{ color: RED }}/>}
            <span className="text-sm font-medium">{mode === "ios" ? t.installIosStep : t.installAndroidStep}</span>
          </div>
        )}
        <button onClick={close} className="w-full py-3 rounded-2xl text-sm font-medium" style={{ color: "var(--gray-accessible-text)" }}>
          {mode === "native" ? t.installLater : t.installIosDone}
        </button>
      </div>
    </div>
  );
}
