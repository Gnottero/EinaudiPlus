// Rooms.tsx — Sale a FASCE ORARIE LIBERE (Cinema e Musica).
//
// Come gestiamo le fasce libere:
//  • il tempo è in MINUTI dalla mezzanotte; ogni prenotazione è un blocco [start,end);
//  • una TIMELINE giornaliera mostra a colpo d'occhio i blocchi occupati nella finestra
//    oraria della sala (0–24 per entrambe);
//  • due SELETTORI "Inizio/Fine" (step 30') generano il blocco; un controllo di
//    sovrapposizione (client + server) impedisce i conflitti;
//  • si vede solo la settimana corrente: le vecchie le pota il database.

import { useState, useEffect, useCallback } from "react";
import {
  Film, Music, X, Plus, Trash2, Info, Loader2, AlertTriangle, Package,
} from "lucide-react";
import * as roomsApi from "../../roomsApi";
import type { RoomKind, RoomBooking, CinemaType } from "../../roomsApi";
import RuotaPicker from "../../RuotaPicker";
import { Toast } from "../../panels/Toast";
import { isValidRoom, completeRoom } from "../../modello";
import { call as adminCall } from "../admin-shared/adminApi";
import { T } from "./testi";
import { fmtMin, TODAY, DAYS_DATE, ROOM_CFG, timeOptions, endOptions, fmtEnd, payloadForUndo } from "./orari";
import { RulesModal } from "./RulesModal";
import { Timeline } from "./Timeline";
import type { Role as AdminRole } from "../../AdminPanel";

// Le stesse sei lingue dell'app: il tipo arriva da i18n, cosi' non si puo'
// aggiungere una lingua di la' e dimenticarla di qua.
//
// `T as T_APP`: il messaggio di conferma/cancellazione prenotazione non e'
// piu' un testo suo, tradotto qui una seconda volta — arriva dallo stesso
// dizionario che usa la lavanderia, cosi' il testo e' letteralmente lo
// stesso in ogni sala, non solo tradotto allo stesso modo per coincidenza.
import { T as T_APP, isFeatureOffError, type Lang } from "../../i18n";

const RED = "var(--primary)", RED_FG = "var(--primary-foreground)";
const OOS = "var(--destructive)";
const fg = "var(--foreground)", sub = "var(--muted-foreground)";
const surf = "var(--card)", div = "var(--border)", chip = "var(--secondary)";

// ─── Vista sala ────────────────────────────────────────────────────────────────
export default function RoomView({ room, lang, roomNumber, adminRole }: {
  room: RoomKind; lang: Lang; roomNumber?: string | null; adminRole?: AdminRole | null;
}) {
  const t = T[lang];
  const gt = T_APP[lang];   // testi condivisi con la lavanderia: conferma/cancellazione
  const cfg = ROOM_CFG[room];
  const opts = timeOptions(cfg.winStart, cfg.winEnd, cfg.step);

  // Le ore in cui si puo' COMINCIARE.
  //
  // Mai le 24:00: come istante sono gia' lo zero del giorno dopo, e per il
  // cinema comparirebbero due volte nella stessa tendina.
  //
  // Per una sala che non scavalca si toglie anche l'ultima ora utile, perche'
  // cominciare all'orario di chiusura non lascerebbe nessuna fine possibile.
  // Da quando la musica scavalca, invece, una fine c'e' sempre: tenere fuori
  // le 23:00 rendeva prenotabile 22:30->05:00 ma non 23:00->01:00, che e'
  // l'esempio tipico di serata a cavallo della mezzanotte.
  const startOpts = (cfg.overnight ? opts : opts.slice(0, -1)).filter((m) => m < 24 * 60);
  const myRoom = (roomNumber || "").trim();   // identità = numero camera (come lavanderia)

  // Chi amministra prenota come DIREZIONE, che non è una camera: qui il campo
  // diventa testo libero e chiede il nome dell'iniziativa invece del numero.
  // v1.10: chi amministra usando la propria camera sceglie al momento se
  // prenotare per sé o per la Direzione (vedi la scelta sopra al campo).
  const puoDirezione = !!adminRole && !!myRoom && myRoom !== "DIREZIONE";
  const [perDirezione, setPerDirezione] = useState(false);
  const direzione = myRoom === "DIREZIONE" || (puoDirezione && perDirezione);

  // Chiudere la sala (es. per il deposito dei pacchi) resta allo stesso
  // livello dello stato guasto/funzionante delle macchine: FDO e
  // sistemista, non lo staff — stessa policy lato server
  // (src/modules/common-spaces/domain/policy.js), qui serve solo a
  // decidere se mostrare il pulsante.
  const canLockSpace = adminRole === "fdo" || adminRole === "admin" || adminRole === "superadmin";

  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  // FDO/sistemista può chiudere la sala (es. per il deposito dei pacchi):
  // mentre lo è, niente forma di prenotazione — solo l'avviso. Il blocco
  // vero resta lato server (book_space() rifiuta comunque), questo è solo
  // per non mostrare un form che finirebbe respinto.
  const [chiuso, setChiuso]     = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [spenta, setSpenta]       = useState(false);   // 403: funzione spenta dalla sezione
  const [selDay, setSelDay]     = useState(TODAY);
  const [start, setStart]       = useState(room === "music" ? 16 * 60 : 18 * 60);
  const [end, setEnd]           = useState(room === "music" ? 18 * 60 : 20 * 60);
  const [name, setName]         = useState("");
  const [ctype, setCtype]       = useState<CinemaType>("private");
  const [toast, setToast]       = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy]         = useState(false);
  // Prenotazione per cui e' stata chiesta conferma prima di cancellarla,
  // perche' non e' la propria (vedi needsConfirm piu' sotto).
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Per la Direzione si parte vuoto, cosi' il segnaposto suggerisce cosa
  // scrivere; lasciandolo vuoto la prenotazione risulta comunque "DIREZIONE".
  const [bookingRoom, setBookingRoom] = useState(direzione ? "" : (myRoom || ""));

  // Gli strumenti non in cuffia si possono usare solo fra le 16 e le 20: la
  // fascia scelta ne esce se comincia prima delle 16 o finisce dopo le 20.
  const STRUMENTI_DA = 16 * 60, STRUMENTI_A = 20 * 60;
  const fuoriFasciaStrumenti = start < STRUMENTI_DA || end > STRUMENTI_A;

  // Spostando l'inizio oltre la fine, la fine lo segue di uno step invece di
  // restare su un valore che il selettore non offre più (il campo mostrava
  // ancora "20:00" con inizio alle 23:00, e si scopriva l'errore solo premendo
  // Prenota).
  useEffect(() => {
    setEnd((e) => (e > start ? e : Math.min(start + cfg.step, cfg.overnight ? start + 24 * 60 - cfg.step : cfg.winEnd)));
  }, [start, cfg.step, cfg.winEnd, cfg.overnight]);

  const refresh = useCallback(async () => {
    try {
      const s = await roomsApi.getRoomState(room);
      setBookings(s.bookings); setChiuso(s.chiuso); setError(false);
    }
    catch (e) { setError(true); setSpenta(isFeatureOffError(e)); }
    finally { setLoading(false); }
  }, [room]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // Passa dal pannello admin (/api/admin/data, sessione con cookie), non
  // dall'endpoint pubblico delle sale: è un'azione riservata, non una
  // prenotazione. Il server la respinge comunque a chi non è FDO/sistemista
  // (stessa policy di setMachineStatus) — canLockSpace qui sopra decide solo
  // se il pulsante compare, non se l'azione è permessa.
  async function toggleChiuso() {
    if (lockBusy) return;
    setLockBusy(true);
    try {
      await adminCall("spaceSetChiuso", { space: room, chiuso: !chiuso });
      await refresh();
    } catch {
      setToast(t.errorGeneric);
    } finally {
      setLockBusy(false);
    }
  }

  // Cambiando sala il modulo torna agli orari tipici di QUELLA sala.
  //
  // Ora che le due griglie sono identiche non serve piu' a evitare un orario
  // inesistente: serve a proporre l'ora giusta. Per la musica sono le 16–18,
  // dentro la fascia in cui gli strumenti non in cuffia sono ammessi; per il
  // cinema le 18–20, che e' quando si guarda un film. Sono suggerimenti, non
  // limiti: da entrambe le ruote si raggiunge qualunque ora del giorno.
  useEffect(() => {
    setStart(room === "music" ? 16 * 60 : 18 * 60);
    setEnd(room === "music" ? 18 * 60 : 20 * 60);
  }, [room]);
  // Cambiando giorno una conferma rimasta a mezz'aria non ha piu' senso: la
  // riga a cui si riferiva non e' nemmeno piu' in vista.
  useEffect(() => { setConfirmDelete(null); }, [selDay, room]);

  const dayBookings = bookings.filter((b) => b.day === selDay).sort((a, b) => a.start - b.start);

  // Le fasce di fine dipendono dall'inizio, quindi la lista cambia sotto i
  // piedi alla ruota: si calcola qui una volta sola, e serve anche per sapere
  // su quale riga posizionarla.
  const endOpts = endOptions(start, cfg);
  const iEnd = Math.max(0, endOpts.indexOf(end));
  const iStart = Math.max(0, startOpts.indexOf(start));

  async function submit() {
    // Chi ha una camera puo' scrivere solo le cifre di un'altra camera della
    // sua sezione: la lettera si rimette da sola (completeRoom).
    const who = direzione ? (bookingRoom.trim() || "DIREZIONE")
      : myRoom ? completeRoom(bookingRoom.trim() || myRoom, myRoom)
      : name.trim();
    if (!who) { setToast(t.needName); return; }

    // Il formato camera si controlla solo a chi UNA camera ce l'ha.
    //
    // La Direzione non è una camera: prenota per la struttura, e quello che
    // scrive è il nome dell'iniziativa — "Formazione PFP", "Assemblea", una
    // proiezione aperta. Prima passava di qui e si beccava "Formato camera non
    // valido" su "DIREZIONE" stesso, quindi non poteva prenotare le sale
    // affatto. Il database accetta già testo libero fino a 40 caratteri.
    //
    // `myRoom &&`: senza, lo stesso controllo scattava anche per chi non ha
    // NESSUNA camera (prenotazione anonima, "Continua senza accedere") — li'
    // `who` è il nome scritto a mano, non un numero, e il regex lo respingeva
    // sempre a meno che non fosse fatto di sole cifre.
    if (myRoom && !direzione) {
      if (!isValidRoom(who)) {
        setToast(t.formatoCamera); return;
      }
    }

    if (end <= start) { setToast(t.badRange); return; }

    // Una fascia che scavalca la mezzanotte occupa due giorni, e vanno
    // controllati entrambi: il server li divide comunque in due righe, ma
    // scoprirlo dopo il giro di rete è peggio che dirlo subito.
    //
    // Tranne la notte fra domenica e lunedì: quella coda cade sul lunedì della
    // settimana SEGUENTE, e `bookings` contiene solo la settimana corrente —
    // qui non c'è proprio niente contro cui confrontarla. Prima si controllava
    // `(selDay + 1) % 7`, che di domenica è il lunedì appena passato: una
    // prenotazione di lunedì mattina faceva rifiutare la serata di domenica
    // con "si sovrappone", parlando di ore che non c'entravano nulla. Meglio
    // nessun controllo che uno che guarda il giorno sbagliato — il vincolo del
    // database copre comunque il caso vero, e la risposta torna con "overlap".
    const sforo = end - 24 * 60;
    const codaControllabile = sforo > 0 && selDay < 6;
    const collide =
      roomsApi.hasOverlap(bookings, selDay, start, Math.min(end, 24 * 60)) ||
      (codaControllabile && roomsApi.hasOverlap(bookings, selDay + 1, 0, sforo));
    if (collide) { setToast(t.overlap); return; }
    setBusy(true);
    const prevIds = new Set(bookings.map((b) => b.id));
    try {
      const payload: Omit<RoomBooking, "id"> = room === "cinema"
        ? { day: selDay, start, end, name: who, type: ctype }
        : { day: selDay, start, end, name: who };
      const updated = await roomsApi.bookRoom(room, payload);
      setBookings(updated);
      if (direzione) setBookingRoom("");
      else if (myRoom) setBookingRoom(myRoom);
      else setName("");
      setToast(gt.slotConfirmed);
      // Una fascia che scavalca la mezzanotte crea due righe con lo stesso
      // group_id: basta l'id di una, remove() segue gia' il gruppo.
      const newId = updated.find((b) => !prevIds.has(b.id))?.id;
      setToastUndo(newId ? () => () => remove(newId) : null);
    } catch (e: any) {
      const msg = String(e?.message);
      // "chiusa": qui non dovrebbe arrivarci mai (il form sparisce quando
      // chiuso e' vero), ma una scheda rimasta aperta in un'altra tab può
      // ancora provarci — il server la rifiuta comunque, questo è solo il
      // messaggio giusto invece del generico.
      setToast(msg === "overlap" ? t.overlap : msg === "full" ? t.full : msg === "chiusa" ? t.closedNotice : t.errorGeneric);
      setToastUndo(null);
      if (msg === "chiusa") setChiuso(true);
    } finally { setBusy(false); }
  }

  // Cancellare, come prenotare, si puo' disfare: si tiene da parte il blocco
  // (i due mezzi, se scavalcava la mezzanotte) prima di toglierlo, cosi'
  // "Annulla" puo' ricrearlo esattamente com'era.
  async function remove(id: string) {
    const target = bookings.find((b) => b.id === id);
    try {
      setBookings(await roomsApi.clearRoomBooking(room, id));
      setToast(gt.slotDeleted);
      setToastUndo(target ? () => () => {
        roomsApi.bookRoom(room, payloadForUndo(target, bookings)).then(setBookings)
          .catch(() => setToast(t.errorGeneric));
      } : null);
    } catch { setToast(t.errorGeneric); setToastUndo(null); }
  }

  // Vero solo quando chi cancella ha una camera propria (non la Direzione, che
  // non ne ha una da confrontare) e la prenotazione e' di qualcun altro: e'
  // il caso in cui vale la pena fermarsi un istante in piu' prima di togliere
  // qualcosa che non si e' prenotato da soli.
  const needsConfirm = (b: RoomBooking) =>
    !!myRoom && !direzione && b.name.trim().toUpperCase() !== myRoom.trim().toUpperCase();

  const Icon = room === "cinema" ? Film : Music;

  if (loading) {
    return <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: sub }}>
      <Loader2 size={26} className="animate-spin-slow" style={{ color: RED }} /><p className="text-sm">{t.loading}</p>
    </div>;
  }
  if (error) {
    return <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ color: sub }}>
      <AlertTriangle size={26} style={{ color: OOS }} /><p className="text-sm">{spenta ? gt.funzioneNonAttiva : t.netError}</p>
      <button onClick={() => { setLoading(true); refresh(); }} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: RED, color: RED_FG }}>{t.retry}</button>
    </div>;
  }

  return (
    <div className="flex flex-col h-full md:max-w-4xl md:mx-auto md:w-full">
      {rulesOpen && <RulesModal room={room} lang={lang} onClose={() => setRulesOpen(false)} />}
      {toast && <Toast msg={toast} onClose={() => { setToast(null); setToastUndo(null); }}
        undo={toastUndo ? { label: t.cancel, onUndo: toastUndo } : undefined} />}

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
        {/* Intestazione sala: nome e icona solo sul desktop, dove non c'e' una
            topbar che li mostra gia'. Su telefono il nome della sala sta nella
            topbar (vedi App.tsx), e ripeterlo qui era la stessa informazione
            due volte nello stesso schermo. */}
        <div className="hidden md:flex items-center gap-2.5 mb-3">
          <div className="p-2 rounded-xl" style={{ background: `color-mix(in srgb, var(--primary) 15%, transparent)`, color: RED }}><Icon size={18} /></div>
          <h2 className="text-base font-bold" style={{ color: fg }}>{room === "cinema" ? t.cinema : t.music}</h2>
        </div>

        {/* Selettore giorni */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {t.days.map((d, i) => {
            const active = i === selDay;
            const isPast = i < TODAY;
            return (
              <button key={d} onClick={() => setSelDay(i)} className="flex flex-col items-center py-1.5 rounded-xl transition-colors"
                style={{ background: active ? RED : "transparent", color: active ? RED_FG : isPast ? "color-mix(in srgb, var(--muted-foreground) 40%, transparent)" : sub }}>
                <span className="text-[9px] font-mono uppercase leading-none mb-0.5">{d}</span>
                <span className="text-sm font-bold leading-none">{DAYS_DATE[i]}</span>
              </button>
            );
          })}
        </div>

        {/* Timeline occupazione */}
        <Timeline room={room} bookings={dayBookings} myRoom={myRoom} />

        {/* Form nuova prenotazione — sparisce del tutto quando la sala è
            chiusa (es. deposito pacchi): il blocco vero è lato server
            (book_space rifiuta comunque), qui si evita solo di mostrare un
            form che finirebbe respinto ad ogni tocco. */}
        {chiuso ? (
          <div className="rounded-2xl border p-4 mb-4 flex items-start gap-3"
            style={{ background: "color-mix(in srgb, var(--destructive) 8%, transparent)", borderColor: div }}>
            <Package size={18} style={{ color: OOS, flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm leading-relaxed flex-1" style={{ color: fg }}>{t.closedNotice}</p>
            {canLockSpace && (
              <button onClick={toggleChiuso} disabled={lockBusy} aria-label={t.reopenRoomBtn} title={t.reopenRoomBtn}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shrink-0 transition-all active:scale-95"
                style={{ background: RED, color: RED_FG, opacity: lockBusy ? 0.6 : 1 }}>
                <Package size={14} />{t.reopenShort}
              </button>
            )}
          </div>
        ) : (
        <div className="rounded-2xl border p-4 mb-4" style={{ background: surf, borderColor: div }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-mono tracking-widest uppercase" style={{ color: sub }}>{t.newBooking}</p>
            <div className="flex items-center gap-1.5">
              {/* Solo FDO/sistemista: stessa policy di setMachineStatus.
                  Stesso stile di "Regole" qui accanto (icona + parola) —
                  un'icona sola bastava a capirla solo a chi già sapeva cosa
                  significa. */}
              {canLockSpace && (
                <button onClick={toggleChiuso} disabled={lockBusy} aria-label={t.closeRoomBtn} title={t.closeRoomBtn}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all active:scale-95"
                  style={{ background: chip, borderColor: div, color: fg, opacity: lockBusy ? 0.6 : 1 }}>
                  <Package size={14} />{t.closeShort}
                </button>
              )}
              <button onClick={() => setRulesOpen(true)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold border transition-all active:scale-95"
                style={{ background: chip, borderColor: div, color: fg }}>
                <Info size={14} />{t.rules}
              </button>
            </div>
          </div>

          {/* Le stesse ruote del turno preferito, al posto di due tendine.
              Una tendina nativa, su parecchi telefoni, si apre come pannello di
              sistema ancorato al fondo dello schermo: dentro un foglio che
              scorre finisce sotto il bordo, ed e' il difetto che le ruote hanno
              gia' risolto in lavanderia e in sala polivalente. In piu' qui le
              voci sono tante — la fine, per una serata che scavalca, arriva a
              una quarantina — e scorrerle con lo snap e' piu' rapido che
              trascinare una tendina lunga quanto lo schermo.

              Le etichette restano corte ("00:30", non "00:30 (del giorno
              successivo)"): a 34px di riga non ci starebbero, e la frase per
              esteso si legge comunque due volte piu' sotto — nella riga qui
              sotto e sul pulsante di conferma. Dentro una stessa lista un
              orario non si ripete mai, quindi la forma breve non e' ambigua. */}
          <div className="flex gap-3 mb-1">
            <label className="flex-1 min-w-0">
              <span className="text-[11px]" style={{ color: sub }}>{t.start}</span>
              <div className="mt-1">
                <RuotaPicker
                  key={`inizio-${room}`}
                  valori={startOpts.map((m) => fmtMin(m))}
                  indice={iStart}
                  onCambia={(i) => setStart(startOpts[i])}
                  ariaLabel={t.start}
                />
              </div>
            </label>
            <label className="flex-1 min-w-0">
              <span className="text-[11px]" style={{ color: sub }}>{t.end}</span>
              <div className="mt-1">
                {/* `key` legata a sala e inizio: la ruota non si lascia
                    pilotare da fuori (vedi RuotaPicker, il ciclo
                    scorrimento->indice), e quando cambia l'uno o l'altro
                    cambiano sia la lista sia la riga scelta. Rimontarla e' il
                    modo previsto per riallinearla. */}
                <RuotaPicker
                  key={`fine-${room}-${start}`}
                  valori={endOpts.map((m) => (m === 24 * 60 ? "24:00" : fmtMin(m)))}
                  indice={iEnd}
                  onCambia={(i) => setEnd(endOpts[i])}
                  ariaLabel={t.end}
                />
              </div>
            </label>
          </div>

          {/* Detto a parole solo quando serve davvero. */}
          <p className="text-[11px] mb-3 h-4" style={{ color: sub }}>
            {end > 24 * 60 ? `${t.end}: ${fmtEnd(end, lang)}` : ""}
          </p>

          {puoDirezione && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-3" style={{ background: chip }}>
              {([[false, gt.forMe(myRoom)], [true, gt.forDirezione]] as [boolean, string][]).map(([v, label]) => (
                <button key={String(v)} aria-pressed={perDirezione === v}
                  onClick={() => { setPerDirezione(v); setBookingRoom(v ? "" : myRoom); }}
                  className="rounded-lg px-2 py-2 text-xs font-semibold"
                  style={perDirezione === v ? { background: "var(--card)", color: "var(--primary)", boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : { color: sub }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {direzione ? (
            /* Testo libero, non maiuscolo e non monospaziato: qui non si scrive
               un codice ma il nome di una cosa che succede — "Formazione PFP",
               "Assemblea di sezione". È quello che comparirà sulla timeline a
               chi guarda la sala. */
            <label className="block mb-3">
              <span className="text-[11px]" style={{ color: sub }}>{t.aNomeDi}</span>
              <input value={bookingRoom} maxLength={40}
                onChange={(e) => setBookingRoom(e.target.value)}
                placeholder={t.aNomeDiPlaceholder}
                className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: chip, color: fg, border: `1px solid ${div}` }} />
            </label>
          ) : myRoom ? (
            <label className="block mb-3">
              <span className="text-[11px]" style={{ color: sub }}>{t.roomLabel}</span>
              <input value={bookingRoom} onChange={(e) => setBookingRoom(e.target.value.toUpperCase())} placeholder={myRoom}
                className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm font-mono outline-none"
                style={{ background: chip, color: fg, border: `1px solid ${div}` }} />
              {bookingRoom !== myRoom && (
                <button onClick={() => setBookingRoom(myRoom)} className="text-[10px] mt-1" style={{ color: sub }}>
                  {t.resetToMyRoom}
                </button>
              )}
            </label>
          ) : (
            <label className="block mb-3">
              <span className="text-[11px]" style={{ color: sub }}>{t.name}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.yourName}
                className="w-full mt-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: chip, color: fg, border: `1px solid ${div}` }} />
            </label>
          )}

          {room === "cinema" && (
            <div className="mb-3">
              <span className="text-[11px]" style={{ color: sub }}>{t.type}</span>
              <div className="flex gap-2 mt-1">
                {([["private", t.priv], ["open", t.open]] as [CinemaType, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setCtype(val)}
                    className="flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all active:scale-95 border"
                    style={ctype === val
                      ? { background: RED, color: RED_FG, borderColor: RED }
                      : { background: chip, color: fg, borderColor: div }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* L'avviso compare solo se la fascia scelta esce davvero da
              16:00–20:00. Stampandolo sempre diventava arredamento: chi
              prenotava dentro la fascia lo leggeva per settimane senza che lo
              riguardasse, e chi ne usciva non lo notava piu'. */}
          {room === "music" && fuoriFasciaStrumenti && (
            <p className="text-[11px] mb-3 flex items-start gap-1.5" style={{ color: "var(--status-prev-text)" }}>
              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {t.musicNote}
            </p>
          )}

          <button onClick={submit} disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
            style={{ background: RED, color: RED_FG, opacity: busy ? 0.6 : 1 }}>
            <Plus size={15} />{t.book} · {fmtMin(start)}–{fmtEnd(end, lang)}
          </button>
        </div>
        )}

        {/* Prenotazioni del giorno */}
        <p className="text-[11px] font-mono tracking-widest uppercase mb-2" style={{ color: sub }}>
          {t.bookings} · {t.daysLong[selDay]}
        </p>
        <div className="rounded-2xl overflow-hidden border" style={{ background: surf, borderColor: div }}>
          {dayBookings.length === 0 ? (
            <div className="px-4 py-4 text-center"><p className="text-xs" style={{ color: sub }}>{t.none}</p></div>
          ) : (
            dayBookings.map((b, i) => {
              const pending = confirmDelete === b.id;
              return (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < dayBookings.length - 1 ? `1px solid ${div}` : "none" }}>
                  <div className="w-px h-8 rounded-full shrink-0" style={{ background: b.type === "open" ? RED : (room === "cinema" ? OOS : RED) }} />
                  {pending ? (
                    // Non e' la propria prenotazione: prima di cancellarla
                    // per davvero si chiede un secondo tocco, cosi' chi lo da'
                    // sa che sta togliendo qualcosa che ha prenotato un altro.
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="shrink-0" style={{ color: OOS }} />
                      <p className="text-[11px] leading-snug" style={{ color: fg }}>{t.confirmDeleteOther(b.name)}</p>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-bold" style={{ color: fg }}>{fmtMin(b.start)} – {fmtEnd(b.end, lang)}</p>
                      <p className="text-[11px] truncate" style={{ color: sub }}>
                        {b.name}{b.type ? ` · ${b.type === "open" ? t.open : t.priv}` : ""}
                        {/* Metà di una serata che scavalca la mezzanotte: senza
                            dirlo sembrerebbero due prenotazioni scollegate, e il
                            cestino su una cancella comunque tutte e due. */}
                        {b.group ? ` · ${t.overnightPart}` : ""}
                      </p>
                    </div>
                  )}
                  {pending ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setConfirmDelete(null)} aria-label={t.close}
                        className="p-2 rounded-lg transition-all active:scale-90" style={{ background: chip, color: sub }}>
                        <X size={14} />
                      </button>
                      <button onClick={() => { setConfirmDelete(null); remove(b.id); }} aria-label={t.cancel}
                        className="p-2 rounded-lg transition-all active:scale-90" style={{ background: OOS, color: "#fff" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => needsConfirm(b) ? setConfirmDelete(b.id) : remove(b.id)} aria-label={t.cancel}
                      className="p-2 rounded-lg shrink-0 transition-all active:scale-90"
                      style={{ background: `color-mix(in srgb, var(--destructive) 10%, transparent)`, color: OOS }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
