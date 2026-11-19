// Grigliata.tsx — sezione Grigliata: il residente aderisce, sceglie il
// menu, e dichiara di aver pagato la quota.
//
// Compare in navigazione SOLO quando una grigliata è attiva (vedi
// shell/navigazione.ts, facilitiesFor/grigliataAttiva) — se non c'è nessuna grigliata la
// scheda sparisce del tutto, non resta lì vuota. Il lato del delegato (fa
// partire l'evento, vede chi ha aderito, conferma i pagamenti) vive in
// features/grigliata/admin/GrigliataAdmin.tsx.
//
// Stesso modello di fiducia di Bici.tsx: la camera è autodichiarata, non
// verificata — chi dice di essere la 214 aderisce per la 214.

import { useState, useEffect, useCallback } from "react";
import { Flame, Check, ExternalLink, Ticket } from "lucide-react";
import * as api from "../../api";
import { StatoSoloCamere, StatoCaricamento, StatoErrore } from "../resident-shared/StatoSezione";
import { T as T_APP, isFeatureOffError, type Lang } from "../../i18n";
import { EMOJI_TICKET_DEFAULT } from "./emojiTicket";
import { T } from "./testi";
import { TicketCard } from "./TicketCard";
import { oggiISO, fmtGiornoLocale } from "./date";
import { useAvvisiInTempoReale } from "../../realtime";

const RED = "var(--primary)", RED_FG = "var(--primary-foreground)";
const GREEN = "#22c55e";
const fg = "var(--foreground)", sub = "var(--muted-foreground)";
const surf = "var(--card)", div = "var(--border)";


/**
 * Un link "paypal.me/mario", senza schema, è un URL RELATIVO per un
 * `<a href>`: il browser lo risolve contro la pagina corrente invece di
 * aprire PayPal — il bug per cui i link di pagamento non funzionavano.
 * grigliata_admin_crea() in SQL ora normalizza già quel che salva, ma
 * questo resta comunque: un dato salvato prima di quella correzione, o
 * scritto da un altro punto in futuro, deve aprirsi correttamente lo
 * stesso — costa una riga, non vale lasciarlo alla disciplina di chi scrive.
 */
function href(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

const LOCALE: Record<Lang, string> = { it: "it-IT", en: "en-GB", fr: "fr-FR", de: "de-DE", es: "es-ES" };
const fmtGiorno = (dataIso: string, lang: Lang): string => fmtGiornoLocale(dataIso, LOCALE[lang]);

export default function GrigliataView({ lang, roomNumber }: { lang: Lang; roomNumber: string | null }) {
  const t = T[lang];
  // Come Bici: e' una scelta di camera, non della Direzione.
  const camera = roomNumber && roomNumber !== api.DIREZIONE ? roomNumber : null;

  const [stato, setStato] = useState<api.GrigliataStato | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [spenta, setSpenta] = useState(false);   // 403: funzione spenta dalla sezione
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Lo slider portato in fondo apre una schermata a tutto schermo con
  // emoji, nome e numero in grande — la "prova" che il ticket è stato speso
  // proprio ora, non solo una riga in più nella lista (vedi usaTicket()).
  const [ticketAppenaUsato, setTicketAppenaUsato] = useState<{
    nome: string; emoji: string; numero: number; quando: Date;
  } | null>(null);

  // Form di adesione: menu, senza glutine, note. Non c'è più una scelta sì/no
  // da ricordare: aderire è l'unica azione, dichiarare un interesse attivo —
  // vedi la nota gemella in src/modules/grigliata/application/iscriviti.js.
  //
  // Si precompila da mia_adesione quando lo si APRE ("Modifica"), non a ogni
  // load(): load() gira ogni 10 secondi, e riscrivere i campi lì cancellava
  // una nota mentre la si stava ancora scrivendo.
  const [modificaScelta, setModificaScelta] = useState(false);
  // null = nessuna scelta ancora: vale il primo menu dell'evento (vedi
  // menuEffettivo più sotto) — gli id li conosciamo solo dopo il load().
  const [menuScelta, setMenuScelta] = useState<number | null>(null);
  // Indipendente dal menu: si può scegliere "Carne" (uno dei menu del
  // delegato) e dichiararsi comunque vegani — non è una quarta scelta di
  // menu, è un'informazione a parte (vedi la nota gemella in
  // src/modules/grigliata/domain/validazione.js).
  const [dieta, setDieta] = useState<api.GrigliataDieta>("classico");
  const [senzaGlutine, setSenzaGlutine] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!camera) { setLoading(false); return; }
    setError(false);
    try {
      setStato(await api.getGrigliataStato());
    } catch (e) { setError(true); setSpenta(isFeatureOffError(e)); }
    finally { setLoading(false); }
  }, [camera]);

  function apriModifica() {
    const a = stato?.miaAdesione;
    if (a) { setMenuScelta(a.menuId); setDieta(a.dieta); setSenzaGlutine(a.senzaGlutine); setNote(a.note ?? ""); }
    setModificaScelta(true);
  }

  // v1.3: i menu li decide il delegato per ogni grigliata, nell'ordine in
  // cui compaiono qui — il primo è quello "di base", preselezionato. I nomi
  // si mostrano come li ha scritti lui: non c'è una traduzione da fare.
  const menuDisponibili = stato?.evento?.menu ?? [];
  const menuEffettivo = menuDisponibili.some((m) => m.id === menuScelta)
    ? menuScelta
    : (menuDisponibili[0]?.id ?? null);
  const nomeMenu = (id: number) => menuDisponibili.find((m) => m.id === id)?.nome ?? "";
  const nomeDieta = (d: api.GrigliataDieta) => (d === "vegano" ? t.dietaVegano : d === "vegetariano" ? t.dietaVegetariano : null);

  useEffect(() => { load(); }, [load]);

  // Il delegato conferma un pagamento in un momento che il residente non
  // controlla. v1.9: lo si sa SUBITO dagli avvisi in tempo reale (vedi
  // realtime.ts) — solo quelli di QUESTA camera (conferma, ticket) e quelli
  // dell'evento (menu, orari, chiusura), non i ticket degli altri: il giorno
  // della grigliata siamo ~90 connessi, e ogni ticket usato non deve far
  // ricaricare tutti. Il canale di tutti aspetta un po' a caso prima di
  // ricaricare, così 90 telefoni non chiedono nello stesso istante.
  const inTempoReale = useAvvisiInTempoReale(
    camera
      ? [{ topic: "grigliata:tutti", jitterMs: 4000, minimoMs: 15_000 }, { topic: `grigliata:camera:${camera}`, jitterMs: 300, minimoMs: 2000 }]
      : [],
    load,
    Boolean(camera),
  );

  // Rete di sicurezza: un ricontrollo periodico — ogni minuto se gli avvisi
  // arrivano, ogni 10 secondi (come prima) se non sono disponibili. Si ferma
  // quando la scheda non è visibile (telefono in tasca).
  useEffect(() => {
    if (!camera) return;
    const id = setInterval(() => { if (!document.hidden) load(); }, inTempoReale ? 60_000 : 10_000);
    return () => clearInterval(id);
  }, [camera, load, inTempoReale]);

  async function salvaAdesione() {
    if (busy || menuEffettivo == null) return;
    setBusy(true); setMsg(null);
    try {
      await api.grigliataIscriviti(menuEffettivo, dieta, senzaGlutine, note);
      setModificaScelta(false);
      await load();
    } catch {
      setMsg(t.erroreAzione);
    } finally {
      setBusy(false);
    }
  }

  async function dichiaraPagato() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      await api.grigliataDichiaraPagamento();
      await load();
    } catch {
      setMsg(t.erroreAzione);
    } finally {
      setBusy(false);
    }
  }

  // Va fatto DAVANTI a chi serve il cibo, non prima: il numero progressivo
  // (unico per tutta la grigliata, vedi grigliata_usa_ticket in SQL) esiste
  // solo a partire da questo gesto — uno screenshot fatto in anticipo non
  // mostra niente. Torna true se è andato, così lo slider sa se tornare
  // indietro.
  async function usaTicket(tk: api.GrigliataTicket): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setMsg(null);
    try {
      const res = await api.grigliataUsaTicket(tk.id);
      setTicketAppenaUsato({
        nome: res.ticket_nome || tk.nome,
        emoji: res.ticket_emoji || tk.emoji || EMOJI_TICKET_DEFAULT,
        numero: res.ticket_numero,
        quando: new Date(),
      });
      await load();
      return true;
    } catch {
      setMsg(t.erroreAzione);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!camera) return <StatoSoloCamere icona={<Flame size={40} style={{ color: sub }} />} testo={t.soloCamere} colore={sub} />;

  if (loading) return <StatoCaricamento testo={t.loading} colore={sub} />;

  if (error) {
    return <StatoErrore testo={spenta ? T_APP[lang].funzioneNonAttiva : t.netError} retry={t.retry} onRetry={load} colore={sub} />;
  }

  if (!stato?.attiva || !stato.evento) {
    // Difensivo: App.tsx nasconde la scheda quando non c'e' una grigliata
    // attiva, ma una finestra fra "l'ho aperta" e "e' appena scaduta" resta
    // possibile — meglio un messaggio chiaro che una pagina vuota.
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
        <Flame size={40} style={{ color: sub }} />
        <p className="text-sm" style={{ color: sub }}>{t.nessunaAttiva}</p>
      </div>
    );
  }

  const { evento, miaAdesione } = stato;
  const tomb = evento.tipo === "tombolata";
  // v1.4.1: la quota a persona, se il delegato l'ha indicata — vale anche
  // con i pagamenti spenti (quanto portare sul posto).
  const quota = evento.quota == null ? null
    : evento.quota.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const scadenza = new Date(evento.scadenza).toLocaleString("it-IT", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

  // Il form di adesione compare se non si e' ancora deciso, o se si e'
  // chiesto esplicitamente di cambiare scelta — ma solo finche' le iscrizioni
  // sono aperte: la scheda resta visibile fino al giorno dopo la grigliata,
  // e dopo la scadenza non si aderisce ne' si cambia piu' (vedi
  // grigliata_iscrivi in SQL).
  const iscrizioniAperte = evento.iscrizioniAperte;
  const mostraForm = iscrizioniAperte && (!miaAdesione || modificaScelta);

  // Dal giorno VERO dell'evento in poi (non dalla scadenza delle adesioni):
  // solo da qui gli slider dei ticket si sbloccano (prima si vedono, ma col
  // lucchetto). "In poi" e non "esattamente quel giorno" perche' la scheda
  // resta visibile anche il giorno dopo, e il server accetta l'uso dei
  // ticket fino ad allora — confronto per data di calendario del
  // dispositivo, stesso formato "AAAA-MM-GG" che il server salva.
  const eGiornoEvento = evento.giornoEvento <= oggiISO();
  const ticket = miaAdesione?.pagamentoConfermato ? miaAdesione.ticket : [];

  return (
    <>
    <div className="flex flex-col h-full md:max-w-lg md:mx-auto md:w-full px-5 pt-3 pb-6 overflow-y-auto">
      {/* Nome della SEZIONE ("Grigliata", generico), non dell'evento: quello
          compare subito sotto, nella card. Ripetere qui evento.titolo lo
          mostrava due volte sullo stesso schermo su desktop. */}
      <div className="hidden md:flex items-center gap-2.5 mb-3">
        <div className="p-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--primary) 15%, transparent)", color: RED }}>
          <Flame size={18} />
        </div>
        <h2 className="text-base font-bold" style={{ color: fg }}>{t.titolo}</h2>
      </div>

      <div className="rounded-2xl border p-4 mb-4" style={{ background: surf, borderColor: div }}>
        <p className="text-sm font-bold mb-1" style={{ color: fg }}>{evento.titolo}</p>
        <p className="text-xs" style={{ color: sub }}>{t.siMangiaIl(fmtGiorno(evento.giornoEvento, lang))}</p>
        <p className="text-xs" style={{ color: sub }}>
          {iscrizioniAperte ? t.scadeIl(scadenza) : t.scadeIlChiuse(scadenza)}
        </p>
        {quota && <p className="text-xs font-semibold mt-1" style={{ color: fg }}>{t.quota(quota)}</p>}
      </div>

      {msg && (
        <div className="rounded-xl px-4 py-2.5 mb-4 text-sm" style={{ background: "color-mix(in srgb, var(--destructive) 12%, transparent)", color: "var(--destructive-text)" }}>
          {msg}
        </div>
      )}

      {/* Iscrizioni chiuse e nessuna adesione: la scheda resta visibile ma non
          c'è niente da fare — niente form, niente pagamento. */}
      {!iscrizioniAperte && !miaAdesione && (
        <div className="rounded-2xl border p-4 text-sm" style={{ background: surf, borderColor: div, color: sub }}>
          {t.adesioniChiuse}
        </div>
      )}

      {/* v1.4: il form è diviso in due blocchi — COSA si mangia (il menu del
          delegato) e CHI sei (dieta, glutine, note) — invece di un'unica
          card: sono due domande diverse, e la seconda vale qualunque menu
          si scelga. Il pulsante sta sotto entrambi: salva tutto insieme,
          i dati viaggiano come prima (stessa grigliata_iscrivi). */}
      {!iscrizioniAperte && !miaAdesione ? null : mostraForm ? (
        <div className="flex flex-col gap-4">
          {!tomb && <div className="rounded-2xl border p-4" style={{ background: surf, borderColor: div }}>
            <div>
              <p className="text-sm font-bold mb-3" style={{ color: fg }}>{t.menuLabel}</p>
              {/* Da uno a dieci menu, con nomi lunghi fino a 40 caratteri: una
                  griglia che va a capo da sola, non tre colonne fisse. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
                {evento.menu.map((m) => {
                  const scelto = menuEffettivo === m.id;
                  return (
                    <button key={m.id} onClick={() => setMenuScelta(m.id)} aria-pressed={scelto}
                      className="rounded-xl py-2.5 px-1 text-sm font-semibold leading-tight transition-all"
                      lang="it"
                      style={{
                        // Un nome lungo va a capo fra le parole, o sillabato —
                        // non spezzato a caso ("Vegetarian|o").
                        hyphens: "auto", overflowWrap: "break-word",
                        ...(scelto ? { background: RED, color: RED_FG } : { background: "var(--secondary)", color: fg }),
                      }}>
                      {m.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>}

          <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ background: surf, borderColor: div }}>
            {!tomb && <div>
              <p className="text-sm font-bold" style={{ color: fg }}>{t.infoTitolo}</p>
              <p className="text-xs mt-0.5" style={{ color: sub }}>{t.infoDesc}</p>
            </div>}

            {!tomb && <div>
              <p className="text-sm font-semibold mb-2" style={{ color: fg }}>{t.dietaLabel}</p>
              {/* Tre pulsanti fissi, non legati ai menu del delegato: si può
                  scegliere QUALUNQUE menu e dichiararsi comunque vegani — è
                  un'informazione a parte, non una quarta scelta di menu. */}
              <div className="grid grid-cols-3 gap-2">
                {([["classico", t.dietaClassico], ["vegetariano", t.dietaVegetariano], ["vegano", t.dietaVegano]] as [api.GrigliataDieta, string][]).map(([val, label]) => {
                  const scelto = dieta === val;
                  return (
                    <button key={val} onClick={() => setDieta(val)} aria-pressed={scelto}
                      className="rounded-xl py-2.5 px-1 text-sm font-semibold leading-tight transition-all"
                      style={scelto
                        ? { background: RED, color: RED_FG }
                        : { background: "var(--secondary)", color: fg }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>}

            {/* Un interruttore e non una quarta scelta di menu: si può essere
                vegani E senza glutine, sono due cose indipendenti. */}
            {!tomb && <button onClick={() => setSenzaGlutine((v) => !v)} role="switch" aria-checked={senzaGlutine}
              className="flex items-center justify-between gap-3 text-left">
              <span>
                <span className="block text-sm font-semibold" style={{ color: fg }}>{t.senzaGlutine}</span>
                <span className="block text-xs" style={{ color: sub }}>{t.senzaGlutineHint}</span>
              </span>
              <span className="shrink-0 flex items-center rounded-full p-[3px] transition-colors"
                style={{ width: 44, height: 26, background: senzaGlutine ? RED : "var(--secondary)", justifyContent: senzaGlutine ? "flex-end" : "flex-start" }}>
                <span className="rounded-full" style={{ width: 20, height: 20, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
              </span>
            </button>}

            <label className="block">
              <span className="block text-sm font-semibold mb-2" style={{ color: fg }}>{t.noteLabel}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2}
                placeholder={t.notePlaceholder}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                style={{ background: "var(--secondary)", color: fg, border: `1px solid ${div}` }} />
            </label>
          </div>

          <button onClick={salvaAdesione} disabled={busy || menuEffettivo == null}
            className="w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
            style={{ background: RED, color: RED_FG, opacity: busy || menuEffettivo == null ? 0.6 : 1 }}>
            {t.partecipaBtn}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: surf, borderColor: div }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Check size={16} style={{ color: RED }} />
              <p className="text-sm font-semibold" style={{ color: RED }}>{t.partecipi}</p>
            </div>
            {iscrizioniAperte && (
              <button onClick={apriModifica} className="text-xs font-semibold underline" style={{ color: sub }}>
                {t.cambiaScelta}
              </button>
            )}
          </div>
          {!tomb && <p className="text-xs" style={{ color: sub }}>
            {t.menuScelto(nomeMenu(miaAdesione!.menuId))}
            {nomeDieta(miaAdesione!.dieta) && ` · ${nomeDieta(miaAdesione!.dieta)}`}
            {miaAdesione!.senzaGlutine && ` · ${t.senzaGlutine}`}
          </p>}
          {miaAdesione!.note && (
            <p className="text-xs whitespace-pre-wrap" style={{ color: sub, overflowWrap: "anywhere" }}>
              {t.note}: {miaAdesione!.note}
            </p>
          )}
        </div>
      )}

      {/* Il pagamento compare solo per chi ha già aderito (non mentre si sta
          ancora scegliendo il menu). Con i pagamenti spenti dal delegato
          (v1.4) la card resta, ma dice solo che per ora non si paga — niente
          link né "Ho pagato". */}
      {miaAdesione && !modificaScelta && (
        <div className="rounded-2xl border p-4 mt-4 flex flex-col gap-3" style={{ background: surf, borderColor: div }}>
          <div>
            <p className="text-sm font-bold" style={{ color: fg }}>{t.pagamentoTitolo}</p>
            {quota && <p className="text-xs mt-0.5" style={{ color: sub }}>{t.quota(quota)}</p>}
          </div>

          {!evento.pagamentiAttivi ? (
            <p className="text-xs leading-relaxed rounded-xl px-3 py-2 font-medium"
              style={{ background: "var(--secondary)", color: fg }}>
              {t.pagamentiDisattivati}
            </p>
          ) : miaAdesione.pagamentoConfermato ? (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: `color-mix(in srgb, ${GREEN} 15%, transparent)`, color: GREEN }}>
              <Check size={16} />
              <p className="text-sm font-semibold">{t.pagamentoConfermato}</p>
            </div>
          ) : (
            <>
              <p className="text-xs leading-relaxed" style={{ color: sub }}>{t.pagamentoDesc}</p>

              <p className="text-xs leading-relaxed rounded-xl px-3 py-2 font-medium"
                style={{ background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: fg }}>
                {t.causalePagamento}
              </p>

              <div className="flex flex-col gap-2">
                {evento.paypalLink && (
                  <a href={href(evento.paypalLink)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                    style={{ background: "var(--secondary)", color: fg }}>
                    {t.paypalBtn}<ExternalLink size={14} />
                  </a>
                )}
                {evento.satispayLink && (
                  <a href={href(evento.satispayLink)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                    style={{ background: "var(--secondary)", color: fg }}>
                    {t.satispayBtn}<ExternalLink size={14} />
                  </a>
                )}
              </div>

              {miaAdesione.pagamentoDichiarato ? (
                <p className="text-xs text-center font-semibold" style={{ color: sub }}>{t.inAttesaConferma}</p>
              ) : (
                <button onClick={dichiaraPagato} disabled={busy}
                  className="w-full py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: RED, color: RED_FG, opacity: busy ? 0.6 : 1 }}>
                  {t.dichiaraPagamento}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* I ticket: una sezione a sé, uno per ogni voce del menu scelto (es.
          "Carne" = 🌭 Salsiccia + 🥤 Bibita). Compaiono appena il pagamento
          è confermato — prima del giorno della grigliata si vedono ma con
          lo slider bloccato. */}
      {!tomb && ticket.length > 0 && !modificaScelta && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <Ticket size={18} style={{ color: RED }} />
              <p className="text-base font-bold" style={{ color: fg }}>{t.ticketTitolo}</p>
            </div>
            <p className="text-xs truncate" style={{ color: sub }}>{t.menuScelto(nomeMenu(miaAdesione!.menuId))}</p>
          </div>

          {ticket.map((tk) => (
            <TicketCard key={tk.id} tk={tk} t={t}
              bloccatoFino={eGiornoEvento ? null : fmtGiorno(evento.giornoEvento, lang)}
              onUsa={() => usaTicket(tk)} />
          ))}

          {eGiornoEvento && ticket.some((tk) => !tk.usato) && (
            <p className="text-xs leading-relaxed px-1" style={{ color: sub }}>{t.ticketUsaHint}</p>
          )}
        </div>
      )}
    </div>

    {/* Schermata a tutto schermo subito dopo lo slider: emoji, nome e numero
        in grande, la prova che il ticket è stato speso proprio ora — da
        mostrare a chi serve, non una riga da cercare nella lista. */}
    {ticketAppenaUsato && (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-8 text-center"
        style={{ background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${RED} 70%, #fff) 0%, ${RED} 65%)` }}
        onClick={() => setTicketAppenaUsato(null)}>
        <div className="flex items-center justify-center rounded-full"
          style={{ width: 132, height: 132, fontSize: 76, lineHeight: 1, background: "rgba(255,255,255,0.2)" }}>
          {ticketAppenaUsato.emoji}
        </div>
        <p className="text-3xl font-extrabold mt-2" style={{ color: RED_FG, overflowWrap: "anywhere" }}>{ticketAppenaUsato.nome}</p>
        <div className="mt-2 rounded-3xl px-8 py-4" style={{ background: "rgba(0,0,0,0.18)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: RED_FG, opacity: 0.8 }}>{t.ticketNumero}</p>
          <p className="font-extrabold tabular-nums leading-none" style={{ color: RED_FG, fontSize: 88 }}>{ticketAppenaUsato.numero}</p>
        </div>
        {/* L'ora (coi secondi) in grande: identifica QUESTO uso del ticket —
            chi serve la confronta a colpo d'occhio, uno screenshot di un
            altro momento non torna. Il giorno no: è quello della grigliata,
            lo sanno tutti. */}
        <div className="flex flex-col items-center" style={{ color: RED_FG }}>
          <p className="text-sm font-semibold flex items-center gap-1.5 uppercase tracking-widest" style={{ opacity: 0.85 }}>
            <Check size={16} />{t.ticketUsatoAlle}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-tight mt-1">
            {ticketAppenaUsato.quando.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
        <button onClick={() => setTicketAppenaUsato(null)}
          className="mt-5 px-10 py-3 rounded-2xl text-sm font-bold"
          style={{ background: RED_FG, color: RED }}>
          {t.ticketUsatoChiudi}
        </button>
      </div>
    )}
    </>
  );
}
