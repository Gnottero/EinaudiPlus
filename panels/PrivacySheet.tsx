import { X } from "lucide-react";
import { T, type Lang } from "../i18n";

// ─── Informativa privacy ────────────────────────────────────────────────────
//
// Manca ancora il titolare del trattamento e un contatto per le richieste
// privacy (rimossi su richiesta, da aggiungere prima di andare in
// produzione). Elenca solo cosa il codice fa DAVVERO oggi (vedi schema.sql e
// reminders.sql): niente promesse che poi il database non mantiene.
export function PrivacySheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = T[lang];
  const fg  = "var(--foreground)";
  const sub = "var(--gray-accessible-text)";
  const Sezione = ({ titolo, children }: { titolo: string; children: React.ReactNode }) => (
    <div className="mb-4">
      <p className="text-sm font-semibold mb-1" style={{ color: fg }}>{titolo}</p>
      <p className="text-xs leading-relaxed" style={{ color: sub }}>{children}</p>
    </div>
  );
  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background:"rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl pb-8 max-h-[92%] overflow-y-auto overscroll-contain" style={{ background:"var(--background)" }} onClick={(e)=>e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4">
          <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background:"color-mix(in srgb, var(--foreground) 15%, transparent)" }}/>
          <div className="flex items-center justify-between mb-1">
            <p className="text-lg font-bold" style={{ color: fg }}>{t.privacy}</p>
            <button onClick={onClose} className="p-2 rounded-xl" style={{ color: sub, background:"var(--secondary)" }}>
              <X size={16}/>
            </button>
          </div>
        </div>

        <div className="px-6">
          <Sezione titolo={t.privacyDatiTitolo}>{t.privacyDatiBody}</Sezione>
          <Sezione titolo={t.privacyPercheTitolo}>{t.privacyPercheBody}</Sezione>
          <Sezione titolo={t.privacyConservazioneTitolo}>{t.privacyConservazioneBody}</Sezione>
          <Sezione titolo={t.privacyCondivisioneTitolo}>{t.privacyCondivisioneBody}</Sezione>
          <Sezione titolo={t.privacyDirittiTitolo}>{t.privacyDirittiBody}</Sezione>
        </div>
      </div>
    </div>
  );
}
