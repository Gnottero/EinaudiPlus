import { useState, useEffect } from "react";
import { useFeature } from "../hooks";
import { ChevronRight, Globe, Bell, BellRing, Download, Eye, ShieldCheck, FileText, SunMoon, Sun, Moon, Monitor, Bed } from "lucide-react";
import * as api from "../api";
import * as push from "../push";
import { T, LINGUE, type Lang } from "../i18n";
import { RED, type TemaPreferenza } from "../tema";
import type { Role as AdminRole } from "../AdminPanel";
import { RemindersSheet } from "./Reminders";
import { PrivacySheet } from "./PrivacySheet";

/** Come si chiama un ruolo quando lo si mostra a chi ha fatto l'accesso. */
const etichettaRuolo = (r: AdminRole | null) =>
  r === "superadmin" ? "superadmin" : r === "admin" ? "admin" : r === "delegato" ? "delegato" : "FDO";

// ─── Toast ───────────────────────────────────────────────────────────────────
//
// Condiviso fra lavanderia e sale (cinema, musica): prima ogni sala aveva la
// sua copia disegnata a mano, e la sala ne aveva una senza icona e senza il
// limite di larghezza che tiene il testo su una riga sola — bastava un nome
// un po' lungo per andare a capo, cosa che in lavanderia non succedeva mai
// perche' li' il messaggio arriva gia' spezzato dal componente giusto.

// ─── Impostazioni ───────────────────────────────────────────────────────────
//
// Un solo pulsante al posto di quattro-cinque icone sparse nell'header: lingua,
// notifiche, installazione app, accessibilità. Il refresh manuale è sparito del
// tutto (riaprire l'app ricarica già i dati da sola) e così il selettore
// manuale del tema, che ora segue sempre quello del telefono — vedi l'effetto
// che ascolta prefers-color-scheme in cima al componente App.
export function SettingsSheet({ lang, room, adminRole, onLang, temaPref, onTema, onAccessibility, onClose }: {
  lang: Lang; room: string | null;
  adminRole: AdminRole | null;
  onLang: (l: Lang) => void;
  temaPref: TemaPreferenza; onTema: (t: TemaPreferenza) => void;
  onAccessibility: () => void; onClose: () => void;
}) {
  // Le lingue non sono più due: al posto dell'interruttore c'è un elenco che
  // si apre. Vive qui e non in un foglio a parte perché è una riga sola che
  // si espande — aprire un altro pannello sopra questo, per scegliere fra sei
  // voci, sarebbe stato un livello di troppo.
  const [lingueAperte, setLingueAperte] = useState(false);
  const [temaAperto, setTemaAperto] = useState(false);
  const linguaCorrente = LINGUE.find((l) => l.id === lang);
  const OPZIONI_TEMA: { id: TemaPreferenza; icon: React.ReactNode; chiave: "temaSistema" | "temaChiaro" | "temaScuro" }[] = [
    { id: "system", icon: <Monitor size={16}/>, chiave: "temaSistema" },
    { id: "light",  icon: <Sun size={16}/>,     chiave: "temaChiaro" },
    { id: "dark",   icon: <Moon size={16}/>,    chiave: "temaScuro" },
  ];
  const temaCorrente = OPZIONI_TEMA.find((o) => o.id === temaPref)!;
  const fg  = "var(--foreground)";
  const sub = "var(--gray-accessible-text)";
  const div = "var(--border)";

  const [reminderState, setReminderState] = useState<push.ReminderState>("unknown");
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Notifica del cambio biancheria (grande/piccolo/nessuno) — un interruttore
  // on/off e un orario, letti/scritti subito come lingua e tema: nessun
  // tasto "Salva" a parte, coerente col resto di questo pannello.
  const [linenAperto, setLinenAperto] = useState(false);
  // Parte dal default del server (attiva, alle 8:00) e si aggiorna appena
  // arriva la preferenza vera: la riga c'è SEMPRE, anche se la lettura non
  // riesce — prima spariva in silenzio, e non si poteva più cambiare niente.
  const [linenPref, setLinenPref] = useState<api.LinenNotifyPref>({ enabled: true, notifyTime: "08:00" });
  const [linenBusy, setLinenBusy] = useState(false);
  const [linenErr, setLinenErr] = useState(false);
  const [busy, setBusy] = useState(false);
  // Il motivo per cui l'attivazione non e' andata a buon fine, quando a dirlo e'
  // stato il server (oggi: troppi dispositivi sulla stessa camera). Arriva gia'
  // scritto per un residente, e si mostra com'e': tradurlo in sei lingue
  // vorrebbe dire tenere allineate sei stringhe per un caso che si vede una
  // volta ogni mai — e nel frattempo il silenzio sarebbe peggio.
  const [pushErr, setPushErr] = useState<string | null>(null);
  const standalone = typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);

  // Le funzionalita' che la sezione di questa camera ha spento spariscono
  // dalle Impostazioni (il server le rifiuterebbe comunque).
  const notifOn = useFeature("notifications");
  const linenOn = useFeature("linen");

  useEffect(() => { push.getReminderState().then(setReminderState); }, []);

  useEffect(() => {
    if (!room || !linenOn) return;
    api.getLinenNotifyPref(room).then(setLinenPref).catch(() => { /* resta il default: si può comunque cambiare */ });
  }, [room, linenOn]);

  async function cambiaLinenPref(parziale: Partial<api.LinenNotifyPref>) {
    if (!room || linenBusy) return;
    const nuovo = { ...linenPref, ...parziale };
    if (!nuovo.notifyTime) return; // campo orario svuotato a metà: si aspetta un orario intero
    setLinenPref(nuovo);
    setLinenBusy(true);
    setLinenErr(false);
    try {
      await api.setLinenNotifyPref(room, nuovo.enabled, nuovo.notifyTime);
    } catch {
      setLinenPref(linenPref); // com'era prima, il tentativo non è riuscito
      setLinenErr(true);
    } finally {
      setLinenBusy(false);
    }
  }

  async function toggleReminders() {
    if (busy || !room) return;
    setBusy(true);
    setPushErr(null);
    try {
      if (reminderState === "on") { await push.disableReminders(); setReminderState("off"); }
      else { await push.enableReminders(room); setReminderState(await push.getReminderState()); }
    } catch (e: any) {
      if (String(e?.message) === "denied") setReminderState("denied");
      // Un rifiuto del server: enableReminders ha gia' disfatto l'iscrizione del
      // browser, quindi lo stato riletto dice il vero ("non attive"). Qui resta
      // da dire PERCHE', altrimenti si tocca "attiva" e non succede nulla.
      else if (e?.rifiutato) {
        setPushErr(String(e.message));
        setReminderState(await push.getReminderState());
      }
    } finally { setBusy(false); }
  }

  const reminderSub = reminderState === "denied"
    ? T[lang].notificheBloccate
    : reminderState === "on" ? T[lang].attive : T[lang].nonAttive;

  const Row = ({ icon, label, sub: subtext, onClick }: {
    icon: React.ReactNode; label: string; sub?: string; onClick: () => void;
  }) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:scale-[0.99]">
      <span style={{ color: sub }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: fg }}>{label}</span>
        {subtext && <span className="block text-xs" style={{ color: sub }}>{subtext}</span>}
      </span>
      <ChevronRight size={16} style={{ color: sub, opacity: 0.5 }} />
    </button>
  );

  // Non e' piu' un foglio che sale dal basso: e' una pagina come "Lavanderia",
  // raggiunta dallo stesso menu e lasciata allo stesso modo — riaprendo il
  // menu e scegliendo altro. Niente X in alto: era il residuo del foglio, e su
  // una pagina prometteva una chiusura che non c'e' piu'.
  return (
    <>
      <div className="pb-6">
        <div className="px-6 pt-4 pb-3">
          <p className="text-lg font-bold" style={{ color:fg }}>{T[lang].impostazioni}</p>
        </div>

        <div className="rounded-2xl overflow-hidden border mx-5" style={{ borderColor:div }}>
          <div style={{ borderBottom:`1px solid ${div}` }}>
            <Row icon={<Globe size={18}/>} label={T[lang].navLingua}
              sub={`${linguaCorrente?.bandiera ?? ""} ${linguaCorrente?.etichetta ?? ""}`}
              onClick={() => setLingueAperte((v) => !v)}/>
            {lingueAperte && (
              <div className="grid grid-cols-2 gap-x-1 p-1" style={{ background:"var(--secondary)" }}>
                {LINGUE.map((l) => (
                  <button key={l.id}
                    onClick={() => { onLang(l.id); setLingueAperte(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg"
                    style={{
                      color: l.id === lang ? RED : fg,
                      fontWeight: l.id === lang ? 600 : 400,
                    }}>
                    <span className="text-base shrink-0">{l.bandiera}</span>
                    <span className="truncate">{l.etichetta}</span>
                    {l.id === lang && <span className="ml-auto shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ borderBottom:`1px solid ${div}` }}>
            <Row icon={<SunMoon size={18}/>} label={T[lang].tema}
              sub={T[lang][temaCorrente.chiave]}
              onClick={() => setTemaAperto((v) => !v)}/>
            {temaAperto && (
              <div className="grid grid-cols-3 gap-x-1 p-1" style={{ background:"var(--secondary)" }}>
                {OPZIONI_TEMA.map((o) => (
                  <button key={o.id}
                    onClick={() => { onTema(o.id); setTemaAperto(false); }}
                    className="w-full flex flex-col items-center gap-1 px-2 py-2.5 text-xs text-left rounded-lg"
                    style={{
                      color: o.id === temaPref ? RED : fg,
                      fontWeight: o.id === temaPref ? 600 : 400,
                    }}>
                    {o.icon}
                    <span className="truncate">{T[lang][o.chiave]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {room && notifOn && (
            <div style={{ borderBottom:`1px solid ${div}` }}>
              <Row icon={reminderState==="on" ? <BellRing size={18}/> : <Bell size={18}/>}
                label={T[lang].notificheTurni} sub={reminderSub}
                onClick={() => setRemindersOpen(true)}/>
            </div>
          )}
          {room && linenOn && (
            <div style={{ borderBottom:`1px solid ${div}` }}>
              <Row icon={<Bed size={18}/>} label={T[lang].notificheCambioBiancheria}
                sub={linenPref.enabled ? T[lang].attive : T[lang].nonAttive}
                onClick={() => setLinenAperto((v) => !v)}/>
              {linenAperto && (
                <div className="p-3 flex flex-col gap-3" style={{ background:"var(--secondary)" }}>
                  <p className="text-xs" style={{ color:"var(--muted-foreground)" }}>{T[lang].notificheCambioBiancheriaHint}</p>
                  <button onClick={() => cambiaLinenPref({ enabled: !linenPref.enabled })} disabled={linenBusy}
                    className="w-full flex items-center justify-between gap-3 text-left">
                    <span className="text-xs font-semibold" style={{ color:fg }}>{T[lang].notificheCambioBiancheriaAttiva}</span>
                    <span className="shrink-0 flex items-center rounded-full p-[3px] transition-colors"
                      style={{ width:40, height:24, background: linenPref.enabled ? RED : "var(--border)", justifyContent: linenPref.enabled ? "flex-end" : "flex-start" }}>
                      <span className="rounded-full" style={{ width:18, height:18, background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,.3)" }} />
                    </span>
                  </button>
                  {linenPref.enabled && (
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold" style={{ color:fg }}>{T[lang].notificheCambioBiancheriaOrario}</span>
                      <input type="time" value={linenPref.notifyTime} disabled={linenBusy}
                        onChange={(e) => cambiaLinenPref({ notifyTime: e.target.value })}
                        className="text-sm rounded-lg px-2 py-1 border"
                        style={{ background:"var(--card)", borderColor:div, color:fg }}/>
                    </label>
                  )}
                  {linenErr && (
                    <p className="text-xs font-semibold" style={{ color:"var(--destructive-text)" }}>{T[lang].genericError}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!standalone && (
            <div style={{ borderBottom:`1px solid ${div}` }}>
              <Row icon={<Download size={18}/>} label={T[lang].installaApp}
                onClick={() => { window.dispatchEvent(new Event("open-install")); onClose(); }}/>
            </div>
          )}
          <Row icon={<Eye size={18}/>} label={T[lang].accessibilita}
            onClick={() => { onAccessibility(); onClose(); }}/>
          <div style={{ borderTop:`1px solid ${div}` }}>
            <Row icon={<FileText size={18}/>} label={T[lang].privacy} sub={T[lang].privacySub}
              onClick={() => setPrivacyOpen(true)}/>
          </div>
        </div>

        {/* Né l'accesso né l'uscita stanno qui.
            L'accesso sta all'indirizzo /admin: una voce di
            menu che il 99% di chi lo apre non può usare sarebbe solo rumore.
            L'uscita è il pulsante della camera in alto — toccarlo chiude la
            sessione e riporta alla scelta della stanza. Un solo posto, quello
            che si tocca comunque per cambiare identità, invece di tre sparsi
            fra menu e barre sopra ogni sezione. Qui resta solo la riga che
            dice a nome di chi si sta prenotando, che è l'informazione facile
            da perdere di vista. */}
        {adminRole !== null && (
          <p className="text-[11px] mx-5 mt-3 leading-snug flex items-start gap-2" style={{ color:sub }}>
            <ShieldCheck size={14} style={{ marginTop:1, flexShrink:0 }}/>
            <span>
              {/* Il ruolo per esteso, non "sistemista oppure FDO": da quando
                  esiste anche `staff`, quel ternario avrebbe etichettato lo
                  staff come portineria.

                  Prima un ternario it/en: chi guardava l'app in francese,
                  tedesco o spagnolo vedeva comunque questa frase in inglese,
                  perche' il ternario copriva solo due lingue su sei. */}
              {T[lang].sessioneAttiva(etichettaRuolo(adminRole))}
            </span>
          </p>
        )}
      </div>

      {remindersOpen && (
        <RemindersSheet lang={lang} room={room} state={reminderState} busy={busy}
          err={pushErr}
          onToggle={toggleReminders} onClose={() => setRemindersOpen(false)} />
      )}
      {privacyOpen && <PrivacySheet lang={lang} onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
