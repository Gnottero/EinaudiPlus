import { useState } from "react";
import { X, BellRing, Send } from "lucide-react";
import * as api from "../api";
import * as push from "../push";
import { T, type Lang } from "../i18n";
import { RED, RED_FG } from "../tema";

/** Chiede il codice di collegamento Telegram e, se il bot è noto, apre il suo
 *  deep link (in una nuova scheda; se il popup è bloccato si va diretti).
 *  Torna il codice, da mostrare come riserva. Lancia se la richiesta fallisce. */
async function richiediCollegamentoTelegram(bot: string | null | undefined): Promise<string> {
  const c = await api.telegramCode();
  if (bot) {
    const link = `https://t.me/${bot}?start=${c}`;
    const w = window.open(link, "_blank", "noopener,noreferrer");
    if (!w) window.location.href = link;
  }
  return c;
}

// ─── Prompt "vuoi i promemoria?" dopo aver scelto la camera ────────────────────
//
// Compare una volta sola, subito dopo l'accesso (vedi chooseRoom in App.tsx):
// chi entra per la prima volta non sa nemmeno che i promemoria esistono se
// non gli capita di aprire le Impostazioni. Chiederlo qui, la volta che conta
// davvero, funziona molto meglio di aspettare che qualcuno vada a cercarli —
// e chi rifiuta puo' sempre attivarli piu' tardi da li'.
//
// Due strade, due tasti distinti: le notifiche della web app e Telegram.
// Telegram non e' un ripiego da cercare nelle Impostazioni — su iPhone le
// push funzionano solo se l'app e' stata installata dalla schermata Home e
// restano capricciose, quindi chi entra da li' deve poter scegliere subito
// l'unica delle due che gli funzionera' davvero. Chi non vuole nessuna delle
// due tocca "Non ora" e le ritrova comunque nelle Impostazioni.
export function WelcomeReminderPrompt({ lang, room, onClose }: {
  lang: Lang; room: string; onClose: () => void;
}) {
  const t = T[lang];
  const [busy, setBusy] = useState<"push" | "tg" | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [tgErr, setTgErr] = useState(false);
  const bot = import.meta.env.VITE_TELEGRAM_BOT as string | undefined;

  async function attivaPush() {
    setBusy("push");
    // Un rifiuto del permesso o del server non deve bloccare l'accesso: chi
    // rifiuta qui puo' comunque riprovare dalle Impostazioni, dove l'errore
    // si spiega per esteso (vedi RemindersSheet).
    try { await push.enableReminders(room); } catch { /* silenzioso, vedi sopra */ }
    finally { setBusy(null); onClose(); }
  }

  // Stesso collegamento in un tocco solo del pannello Impostazioni: si apre
  // gia' il link finale (una finestra vuota poi reindirizzata verrebbe
  // bloccata dai browser) e il codice resta visibile come riserva. Qui il
  // foglio NON si chiude: chi torna dall'app di Telegram deve ritrovare la
  // riserva se il primo tentativo non e' andato a buon fine.
  async function attivaTelegram() {
    setBusy("tg"); setTgErr(false);
    try {
      setCode(await richiediCollegamentoTelegram(bot));
    } catch {
      setTgErr(true);
    } finally { setBusy(null); }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background:"rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-6 pb-8 max-h-[92%] overflow-y-auto overscroll-contain" style={{ background:"var(--background)" }} onClick={(e)=>e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background:"color-mix(in srgb, var(--foreground) 15%, transparent)" }}/>
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-3.5 rounded-2xl mb-4" style={{ background:`color-mix(in srgb, ${RED} 14%, transparent)` }}>
            <BellRing size={26} style={{ color:RED }}/>
          </div>
          <p className="text-lg font-bold mb-1.5" style={{ color:"var(--foreground)" }}>{t.promemoriaTurni}</p>
          <p className="text-sm" style={{ color:"var(--gray-accessible-text)" }}>{t.promemoriaDesc}</p>
        </div>
        <div className="flex flex-col gap-2">
          {/* Il tasto della web app sparisce solo dove le push non esistono
              proprio (o sono state bloccate nel browser): mostrarlo li'
              sarebbe un tasto che non puo' funzionare. Telegram resta. */}
          {push.pushSupported() && Notification.permission !== "denied" && (
            <button onClick={attivaPush} disabled={busy !== null}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background:RED, color:RED_FG }}>
              <BellRing size={16}/>
              {busy === "push" ? "…" : t.attivaWebApp}
            </button>
          )}
          <button onClick={attivaTelegram} disabled={busy !== null || !room}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background:`color-mix(in srgb, ${RED} 12%, transparent)`, color:RED }}>
            <Send size={16}/>
            {busy === "tg" ? "…" : code ? t.riapri : t.attivaTelegram}
          </button>
          <button onClick={onClose} disabled={busy !== null}
            className="w-full py-3 rounded-2xl text-sm" style={{ color:"var(--gray-accessible-text)" }}>
            {t.nonOra}
          </button>
        </div>

        {tgErr && (
          <p className="text-xs mt-4 text-center" style={{ color:RED }}>{t.telegramErrore}</p>
        )}

        {code && (
          <div className="mt-4 pt-4" style={{ borderTop:"1px solid var(--border)" }}>
            <p className="text-xs" style={{ color:"var(--foreground)" }}>{t.telegramAperto}</p>
            {/* Riserva, non il percorso principale: serve solo se l'apertura
                automatica non e' andata a buon fine (popup bloccato, Telegram
                non installato al primo tocco, ecc.). */}
            <p className="text-[11px] mt-2 mb-1.5" style={{ color:"var(--gray-accessible-text)" }}>{t.nonSiApre}</p>
            {bot ? (
              <a href={`https://t.me/${bot}?start=${code}`} target="_blank" rel="noopener noreferrer"
                 className="block text-center text-xs font-semibold py-2.5 rounded-xl"
                 style={{ background:`color-mix(in srgb, ${RED} 12%, transparent)`, color:RED }}>
                {t.riprovaTelegram}
              </a>
            ) : (
              <p className="text-[11px]" style={{ color:"var(--gray-accessible-text)" }}>
                {t.scriviCodice}
                <span className="font-mono font-bold tracking-wider" style={{ color:"var(--foreground)" }}>{code}</span>
              </p>
            )}
            <p className="text-[11px] mt-2" style={{ color:"var(--gray-accessible-text)" }}>{t.codiceUsaEGetta}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pannello promemoria: push + Telegram ──────────────────────────────────────
//
// Telegram è l'alternativa che conta su iPhone, dove le notifiche push delle
// web app funzionano solo se l'app è stata installata dalla schermata Home e
// restano capricciose. Il collegamento passa da un codice usa-e-getta: senza,
// chiunque potrebbe scrivere al bot "sono la 112" e ricevere i promemoria altrui.
export function RemindersSheet({ lang, room, state, busy, err, onToggle, onClose }: {
  lang: Lang; room: string | null; state: push.ReminderState;
  busy: boolean; err: string | null; onToggle: () => void; onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgErr, setTgErr] = useState(false);
  const on = state === "on";
  const bot = import.meta.env.VITE_TELEGRAM_BOT as string | undefined;

  /**
   * Collega Telegram in un tocco solo.
   *
   * Il codice si genera e si passa al bot dentro il link `?start=<codice>`:
   * Telegram lo invia da solo (se l'utente ha già avviato il bot in passato)
   * o mostra il pulsante AVVIA da toccare una volta (la prima volta) — è
   * Telegram stesso a funzionare così, non c'è un modo per saltare quel tocco
   * al primissimo collegamento. Il codice resta visibile come riserva.
   *
   * Prima si apriva una finestra VUOTA e la si reindirizzava dopo la chiamata
   * di rete: molti browser bloccano proprio i popup vuoti-poi-reindirizzati
   * (è la firma di un pattern pubblicitario), quindi la finestra non si apriva
   * mai e il tentativo falliva in silenzio. Ora si apre già il link finale,
   * un solo passaggio, col fallback sulla stessa scheda se anche quello viene
   * bloccato.
   */
  async function linkTelegram() {
    setTgBusy(true); setTgErr(false);
    try {
      setCode(await richiediCollegamentoTelegram(bot));
    } catch {
      setTgErr(true);
    } finally { setTgBusy(false); }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background:"rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl pb-8 max-h-[92%] overflow-y-auto overscroll-contain" style={{ background:"var(--background)" }} onClick={(e)=>e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4">
          <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background:"color-mix(in srgb, var(--foreground) 15%, transparent)" }}/>
          <div className="flex items-center justify-between mb-1">
            <p className="text-lg font-bold" style={{ color:"var(--foreground)" }}>
              {T[lang].promemoriaTurni}
            </p>
            <button onClick={onClose} className="p-2 rounded-xl" style={{ color:"var(--gray-accessible-text)", background:"var(--secondary)" }}>
              <X size={16}/>
            </button>
          </div>
          <p className="text-xs" style={{ color:"var(--gray-accessible-text)" }}>
            {T[lang].promemoriaDesc}
          </p>
        </div>

        <div className="px-5 space-y-3">
          {/* Notifiche del browser */}
          <div className="rounded-2xl border p-4" style={{ background:"var(--card)", borderColor:"var(--border)" }}>
            <div className="flex items-center gap-3">
              <BellRing size={18} style={{ color: on ? RED : "var(--gray-accessible-text)" }}/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color:"var(--foreground)" }}>
                  {T[lang].notifichePhone}
                </p>
                <p className="text-xs" style={{ color:"var(--gray-accessible-text)" }}>
                  {state === "unsupported"
                    ? T[lang].nonDisponibili
                    : state === "denied"
                    ? T[lang].bloccateBrowser
                    : on ? T[lang].attive : T[lang].nonAttive}
                </p>
              </div>
              {state !== "denied" && state !== "unsupported" && (
                <button onClick={onToggle} disabled={busy}
                  className="rounded-xl px-3 py-2 text-xs font-semibold shrink-0"
                  style={on
                    ? { background:"var(--secondary)", color:"var(--gray-accessible-text)" }
                    : { background:`color-mix(in srgb, ${RED} 12%, transparent)`, color:RED }}>
                  {busy ? "…" : on ? T[lang].disattiva : T[lang].attiva}
                </button>
              )}
            </div>

            {err && (
              <p className="text-xs mt-3" style={{ color:RED }}>
                {err}
              </p>
            )}
          </div>

          {/* Telegram */}
          <div className="rounded-2xl border p-4" style={{ background:"var(--card)", borderColor:"var(--border)" }}>
            <div className="flex items-center gap-3">
              <Send size={18} style={{ color:"var(--gray-accessible-text)" }}/>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color:"var(--foreground)" }}>Telegram</p>
                <p className="text-xs" style={{ color:"var(--gray-accessible-text)" }}>
                  {T[lang].telegramDesc}
                </p>
              </div>
              <button onClick={linkTelegram} disabled={tgBusy || !room}
                className="rounded-xl px-3 py-2 text-xs font-semibold shrink-0"
                style={{ background:`color-mix(in srgb, ${RED} 12%, transparent)`, color:RED }}>
                {tgBusy ? "…" : code ? T[lang].riapri : T[lang].collega}
              </button>
            </div>

            {tgErr && (
              <p className="text-xs mt-3" style={{ color:RED }}>
                {T[lang].telegramErrore}
              </p>
            )}

            {code && (
              <div className="mt-3 pt-3" style={{ borderTop:"1px solid var(--border)" }}>
                <p className="text-xs" style={{ color:"var(--foreground)" }}>
                  {T[lang].telegramAperto}
                </p>
                {/* Riserva, non il percorso principale: serve solo se
                    l'apertura automatica non è andata a buon fine (popup
                    bloccato, Telegram non installato al primo tocco, ecc.).
                    Un link vero — non solo il nome del bot da cercare a mano — perché
                    ricopiare "@nome" e poi il codice a mano è l'esatto attrito
                    che il tocco automatico dovrebbe evitare. */}
                <p className="text-[11px] mt-2 mb-1.5" style={{ color:"var(--gray-accessible-text)" }}>
                  {T[lang].nonSiApre}
                </p>
                {bot ? (
                  <a href={`https://t.me/${bot}?start=${code}`} target="_blank" rel="noopener noreferrer"
                     className="block text-center text-xs font-semibold py-2.5 rounded-xl"
                     style={{ background:`color-mix(in srgb, ${RED} 12%, transparent)`, color:RED }}>
                    {T[lang].riprovaTelegram}
                  </a>
                ) : (
                  <p className="text-[11px]" style={{ color:"var(--gray-accessible-text)" }}>
                    {T[lang].scriviCodice}
                    <span className="font-mono font-bold tracking-wider" style={{ color:"var(--foreground)" }}>{code}</span>
                  </p>
                )}
                <p className="text-[11px] mt-2" style={{ color:"var(--gray-accessible-text)" }}>
                  {T[lang].codiceUsaEGetta}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
