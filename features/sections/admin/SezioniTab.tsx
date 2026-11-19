import { useCallback, useEffect, useState } from "react";
import { call as callBase } from "../../admin-shared/adminApi";
import { S } from "../../admin-shared/adminStyles";
import { invalidateSectionConfig, loadSectionConfig, type SectionConfig, type SharedKey } from "../../../sectionsApi";
import type { Role } from "../../admin-shared/types";

// ─── Sezioni ─────────────────────────────────────────────────────────────────
//
// Cosa fa ogni ruolo qui (il server lo applica comunque, a prescindere da
// cosa questa scheda mostra — vedi src/modules/sections):
//   - admin (UNA sezione): nome e funzionalita' della propria sezione, quali
//     risorse sono sue e quali condivise con un'altra sezione, nome e colore dei
//     gruppi di camere, coppie lavatrice/asciugatrice delle lavanderie che usa;
//   - superadmin: in piu' crea sezioni, cambia gli intervalli di camere,
//     attiva/disattiva una sezione e crea lavanderie.
//
// Una lavanderia puo' servire piu' sezioni (es. Po e Mole): l'elenco
// "condivisa con" sotto ogni lavanderia lo dice, e chi ha ambito su una
// qualsiasi delle sezioni che la usano la puo' modificare.

// Il selettore di sezione del pannello (solo superadmin) manderebbe section_id
// su ogni chiamata e farebbe rifiutare le modifiche a una sezione DIVERSA da
// quella scelta: qui l'id della sezione e' nel payload, il selettore non conta.
const call = (action: string, payload: Record<string, unknown> = {}) => callBase(action, { ...payload, section_id: undefined });

type Range = { id?: number; label: string; from: number | ""; to: number | ""; laundry_id: number | null; color?: string | null };
type Sezione = {
  id: number; code: string; number: number; name: string; active: boolean;
  features: Record<string, boolean>; shared_with?: Partial<Record<SharedKey, number | null>>;
  ranges: { id: number; label: string; from: number; to: number; laundry_id: number | null; color?: string | null }[];
};

// Le risorse che una sezione puo' avere proprie o condivise. La lavanderia
// non c'e': si condivide dagli intervalli (ogni intervallo dice quale usa).
const RISORSE: { key: SharedKey; label: string }[] = [
  { key: "cinema", label: "Sala cinema" },
  { key: "music", label: "Sala musica" },
  { key: "conference", label: "Sala polivalente" },
  { key: "grigliata", label: "Grigliata" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
type Lavanderia = { id: number; slug: string; name: string; pairs: number };

const FUNZIONI: { key: string; label: string }[] = [
  { key: "laundry", label: "Lavanderia" },
  { key: "cinema", label: "Sala cinema" },
  { key: "music", label: "Sala musica" },
  { key: "conference", label: "Sala polivalente" },
  { key: "bikes", label: "Bici" },
  { key: "grigliata", label: "Grigliata" },
  { key: "feedback", label: "Segnalazioni" },
];

const PALETTE = ["#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#ef4444"];
const MAX_COPPIE = 8;

/** Contatore - / N / + (niente select a 3 voci: si sceglie qualunque numero). */
function Contatore({ valore, onChange, min = 1, max = MAX_COPPIE }: { valore: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const bt = { ...S.btn, width: 36, padding: 0 } as const;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" style={bt} aria-label="Meno" disabled={valore <= min} onClick={() => onChange(valore - 1)}>−</button>
      <input style={{ ...S.input, width: 56, textAlign: "center" }} inputMode="numeric" aria-label="Numero di coppie" value={valore}
             onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n >= min && n <= max) onChange(n); }} />
      <button type="button" style={bt} aria-label="Piu'" disabled={valore >= max} onClick={() => onChange(valore + 1)}>+</button>
    </span>
  );
}

const testoMacchine = (n: number) => `${n} ${n === 1 ? "lavatrice" : "lavatrici"} + ${n} ${n === 1 ? "asciugatrice" : "asciugatrici"}`;

const Campo = ({ nome, children, stile }: { nome: string; children: React.ReactNode; stile?: React.CSSProperties }) => (
  <label style={{ display: "grid", gap: 2, fontSize: 11, ...S.sub, ...stile }}>{nome}{children}</label>
);

const acceso = (f: Record<string, boolean>, k: string) => f?.[k] !== false;
const primario = { ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "transparent" } as const;

/** Editor dei piani / gruppi di camere di una sezione, ognuno con la sua lavanderia. */
function Intervalli({ valore, onChange, lavanderie, disabled }: {
  valore: Range[]; onChange: (r: Range[]) => void; lavanderie: Lavanderia[]; disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<Range>) => onChange(valore.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string): number | "" => (v === "" ? "" : Number(v.replace(/\D/g, "")));
  // Il nuovo piano parte dove finisce l'ultimo: +100 se i piani sono a centinaia (101-136 -> 201-236), altrimenti subito dopo.
  const aggiungi = () => {
    const ult = valore[valore.length - 1];
    const f = Number(ult?.from), t = Number(ult?.to);
    const passo = f >= 100 && t >= f ? 100 : 0;
    const da = !ult || !f || !t ? "" : passo ? f + passo : t + 1;
    const a = !ult || !f || !t ? "" : passo ? t + passo : t + 1 + (t - f);
    onChange([...valore, {
      label: `Piano ${valore.length + 1}`, from: da, to: a,
      laundry_id: ult ? ult.laundry_id : lavanderie[0]?.id ?? null, color: PALETTE[valore.length % PALETTE.length],
    }]);
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {valore.length === 0 && <p style={{ fontSize: 12, ...S.sub }}>Nessun piano ancora: aggiungine uno per dire quali camere fanno parte della sezione.</p>}
      {valore.map((r, i) => (
        <div key={i} className="adm-form" style={{ alignItems: "end" }}>
          <Campo nome="Nome (piano, edificio)" stile={{ flex: 1, minWidth: 140 }}>
            <input style={S.input} placeholder="es. 1° piano" value={r.label} maxLength={40} disabled={disabled}
                   onChange={(e) => set(i, { label: e.target.value })} />
          </Campo>
          <Campo nome="Dalla camera" stile={{ maxWidth: 90 }}>
            <input style={S.input} inputMode="numeric" placeholder="101" value={r.from} disabled={disabled}
                   onChange={(e) => set(i, { from: num(e.target.value) })} />
          </Campo>
          <Campo nome="Alla camera" stile={{ maxWidth: 90 }}>
            <input style={S.input} inputMode="numeric" placeholder="136" value={r.to} disabled={disabled}
                   onChange={(e) => set(i, { to: num(e.target.value) })} />
          </Campo>
          <Campo nome="Colore">
            <input type="color" aria-label="Colore" value={r.color && HEX.test(r.color) ? r.color : "#999999"} disabled={disabled}
                   style={{ width: 40, height: 38, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--background)" }}
                   onChange={(e) => set(i, { color: e.target.value })} />
          </Campo>
          <Campo nome="Lavanderia" stile={{ minWidth: 150 }}>
            <select style={S.input} value={r.laundry_id ?? ""} disabled={disabled}
                    onChange={(e) => set(i, { laundry_id: e.target.value === "" ? null : Number(e.target.value) })}>
              <option value="">Nessuna lavanderia</option>
              {lavanderie.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Campo>
          {!disabled && <button type="button" style={S.danger} onClick={() => onChange(valore.filter((_, j) => j !== i))}>Togli</button>}
        </div>
      ))}
      {!disabled && (
        <div><button type="button" style={S.btn} onClick={aggiungi}>+ Aggiungi piano</button></div>
      )}
    </div>
  );
}

const rangesPerServer = (r: Range[]) => r.map((x) => ({ label: x.label, from: x.from, to: x.to, laundry_id: x.laundry_id, color: x.color || null }));

export function SezioniTab({ role }: { role: Role | null }) {
  const superadmin = role === "superadmin";
  const [sezioni, setSezioni] = useState<Sezione[]>([]);
  const [lavanderie, setLavanderie] = useState<Lavanderia[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Tutte le sezioni (anche quelle che l'admin non gestisce) servono solo per
  // scegliere con chi condividere una risorsa: vengono dalla configurazione
  // pubblica, non da sectionList (che per un admin torna la sua sola sezione).
  const [tutteLeSezioni, setTutteLeSezioni] = useState<SectionConfig["sections"]>([]);
  const [bozzaCond, setBozzaCond] = useState<Record<number, Partial<Record<SharedKey, number | null>>>>({});
  const [bozzaStile, setBozzaStile] = useState<Record<number, { label: string; color: string }>>({});

  // Bozze di modifica, per id: finche' non si salva non si manda niente.
  const [bozzaFunzioni, setBozzaFunzioni] = useState<Record<number, Record<string, boolean>>>({});
  const [bozzaNome, setBozzaNome] = useState<Record<number, string>>({});
  const [bozzaRanges, setBozzaRanges] = useState<Record<number, Range[]>>({});
  const [bozzaLav, setBozzaLav] = useState<Record<number, { name: string; pairs: number }>>({});

  // Nuova sezione / nuova lavanderia (solo superadmin).
  const [nuova, setNuova] = useState<{ code: string; name: string; features: Record<string, boolean>; ranges: Range[] }>(
    { code: "", name: "", features: {}, ranges: [] });
  // Vista mostrata: id sezione, "lav" (lavanderie) o "nuova" (solo superadmin).
  const [vista, setVista] = useState<number | "lav" | "nuova" | null>(null);
  const [nuovaLav, setNuovaLav] = useState({ slug: "", name: "", pairs: 2 });

  const load = useCallback(async () => {
    try {
      const d = await call("sectionList", { section_id: undefined });
      setSezioni(d.sections ?? []);
      setLavanderie(d.laundries ?? []);
      setBozzaFunzioni({}); setBozzaNome({}); setBozzaRanges({}); setBozzaLav({}); setBozzaCond({}); setBozzaStile({});
      // I colori e i nomi dei gruppi si leggono dalla configurazione condivisa: si ricarica.
      invalidateSectionConfig();
      const cfg = await loadSectionConfig();
      setTutteLeSezioni(cfg?.sections ?? []);
    } catch (e: any) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function esegui(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); await load(); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  const funzioniDi = (s: Sezione) => bozzaFunzioni[s.id] ?? s.features;
  const intervalliDi = (s: Sezione): Range[] => bozzaRanges[s.id] ?? s.ranges.map((r) => ({ ...r }));
  const sezioniDiLavanderia = (id: number) => sezioni.filter((s) => s.ranges.some((r) => r.laundry_id === id));
  // Chi ha un ambito limitato vede solo le lavanderie usate dalle sue sezioni.
  const lavanderieVisibili = superadmin ? lavanderie : lavanderie.filter((l) => sezioniDiLavanderia(l.id).length > 0);


  const corrente = typeof vista === "number" ? sezioni.find((s) => s.id === vista) ?? sezioni[0] : vista === null ? sezioni[0] : undefined;
  const vistaAttiva = corrente ? corrente.id : vista === "lav" || vista === "nuova" ? vista : null;
  const chip = (on: boolean) => (on ? { ...primario } : { ...S.btn });
  const titolo = (t: string, aiuto?: string) => (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t}</h2>
      {aiuto && <p style={{ fontSize: 12, ...S.sub, marginTop: 2 }}>{aiuto}</p>}
    </div>
  );
  const card = { ...S.card, padding: 18, marginBottom: 16 } as const;

  const modificheGenerali = (s: Sezione) => bozzaFunzioni[s.id] !== undefined || (bozzaNome[s.id] !== undefined && bozzaNome[s.id].trim() !== s.name);

  return (
    <>
      {msg && <div role="status" style={{ ...S.card, padding: 12, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {sezioni.map((s) => (
          <button key={s.id} style={{ ...chip(vistaAttiva === s.id), opacity: s.active ? 1 : 0.6 }} onClick={() => setVista(s.id)}>{s.code} · {s.name}</button>
        ))}
        <button style={chip(vistaAttiva === "lav")} onClick={() => setVista("lav")}>Lavanderie</button>
        {superadmin && <button style={chip(vistaAttiva === "nuova")} onClick={() => setVista("nuova")}>+ Nuova sezione</button>}
      </div>
      {sezioni.length === 0 && vistaAttiva === null && <p style={{ fontSize: 13, ...S.sub }}>Nessuna sezione nel tuo ambito.</p>}

      {corrente && vistaAttiva === corrente.id && (() => {
        const s = corrente;
        const f = funzioniDi(s);
        const cond = bozzaCond[s.id] ?? s.shared_with ?? {};
        const sporcaC = bozzaCond[s.id] !== undefined;
        const sporcaG = modificheGenerali(s);
        return (
          <>
            <div style={{ ...card, opacity: s.active ? 1 : 0.7 }}>
              {titolo(`Generale — sezione ${s.number}, lettera ${s.code}`, "Nome della sezione e funzioni attive. Una funzione spenta sparisce per chi abita qui. Notifiche, cambio biancheria e tema sono comuni a tutto il collegio e non si configurano.")}
              <Campo nome="Nome">
                <input style={S.input} value={bozzaNome[s.id] ?? s.name} maxLength={60}
                       onChange={(e) => setBozzaNome({ ...bozzaNome, [s.id]: e.target.value })} />
              </Campo>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, margin: "12px 0" }}>
                {FUNZIONI.map((fn) => (
                  <label key={fn.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={acceso(f, fn.key)}
                           onChange={(e) => setBozzaFunzioni({ ...bozzaFunzioni, [s.id]: { ...f, [fn.key]: e.target.checked } })} />
                    {fn.label}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={sporcaG ? primario : S.btn} disabled={busy || !sporcaG}
                  onClick={() => esegui(() => call("sectionUpdate", {
                    id: s.id,
                    ...(bozzaNome[s.id] !== undefined && bozzaNome[s.id].trim() !== s.name ? { name: bozzaNome[s.id] } : {}),
                    ...(bozzaFunzioni[s.id] !== undefined ? { features: bozzaFunzioni[s.id] } : {}),
                  }), "Salvato.")}>
                  Salva
                </button>
                {superadmin && (
                  <button style={S.btn} disabled={busy}
                    onClick={() => esegui(() => call("sectionUpdate", { id: s.id, active: !s.active }), s.active ? "Sezione disattivata." : "Sezione riattivata.")}>
                    {s.active ? "Disattiva sezione" : "Riattiva sezione"}
                  </button>
                )}
              </div>
            </div>

            <div style={card}>
              {titolo("Risorse proprie o condivise", "Di base ogni sezione ha le sue sale e la sua grigliata. Se ne condividi una, la sezione scelta ne è la proprietaria: usate la stessa e gli admin di entrambe la gestiscono.")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                {RISORSE.map((r) => {
                  const altre = tutteLeSezioni.filter((x) => x.id !== s.id && x.active && !(x.shared_with?.[r.key]));
                  // Se altre sezioni usano gia' la risorsa di questa, questa non puo' usare quella di un'altra.
                  const laUsanoAltri = tutteLeSezioni.some((x) => x.id !== s.id && x.shared_with?.[r.key] === s.id);
                  return (
                    <label key={r.key} style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      {r.label}
                      <select style={S.input} value={cond[r.key] ?? ""} disabled={laUsanoAltri}
                              onChange={(e) => setBozzaCond({ ...bozzaCond, [s.id]: { ...cond, [r.key]: e.target.value === "" ? null : Number(e.target.value) } })}>
                        <option value="">Propria (indipendente)</option>
                        {altre.map((x) => <option key={x.id} value={x.id}>Condivisa con {x.code} · {x.name}</option>)}
                      </select>
                      {laUsanoAltri && <span style={{ fontSize: 11, ...S.sub }}>Altre sezioni usano già la tua: non può essere condivisa a sua volta.</span>}
                    </label>
                  );
                })}
              </div>
              <button style={{ ...(sporcaC ? primario : S.btn), marginTop: 12 }} disabled={busy || !sporcaC}
                onClick={() => esegui(() => call("sectionSetSharing", { id: s.id, shared: Object.fromEntries(RISORSE.map((r) => [r.key, cond[r.key] ?? null])) }), "Condivisioni salvate.")}>
                Salva
              </button>
            </div>

            <div style={card}>
              {titolo("Piani e camere", superadmin
                ? "Quali camere fanno parte della sezione, il colore con cui compaiono e la lavanderia che usano."
                : "Nome e colore di ogni gruppo di camere. Cambiare i numeri dei piani lo fa un superadmin.")}
              {!superadmin ? (
                <div style={{ display: "grid", gap: 6 }}>
                  {s.ranges.map((r) => {
                    const st = bozzaStile[r.id] ?? { label: r.label, color: r.color ?? "#999999" };
                    const hexOk = HEX.test(st.color);
                    const sporca = st.label.trim() !== r.label || st.color !== (r.color ?? "#999999");
                    return (
                      <div key={r.id} className="adm-form">
                        <span style={{ fontSize: 12, ...S.sub, minWidth: 90 }}>{r.from}–{r.to}</span>
                        <input style={S.input} value={st.label} maxLength={40}
                               onChange={(e) => setBozzaStile({ ...bozzaStile, [r.id]: { ...st, label: e.target.value } })} />
                        <input type="color" aria-label="Colore" value={hexOk ? st.color : "#999999"}
                               style={{ width: 40, height: 38, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--background)" }}
                               onChange={(e) => setBozzaStile({ ...bozzaStile, [r.id]: { ...st, color: e.target.value } })} />
                        <input style={{ ...S.input, maxWidth: 100 }} value={st.color} maxLength={7} placeholder="#22c55e"
                               onChange={(e) => setBozzaStile({ ...bozzaStile, [r.id]: { ...st, color: e.target.value } })} />
                        <button style={sporca && hexOk ? primario : S.btn} disabled={busy || !sporca || !hexOk}
                          onClick={() => esegui(() => call("sectionSetRangeStyle", { range_id: r.id, label: st.label, color: st.color }), "Gruppo salvato.")}>
                          Salva
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <Intervalli valore={intervalliDi(s)} lavanderie={lavanderie}
                              onChange={(r) => setBozzaRanges({ ...bozzaRanges, [s.id]: r })} />
                  <button style={{ ...(bozzaRanges[s.id] ? primario : S.btn), marginTop: 12 }} disabled={busy || !bozzaRanges[s.id]}
                    onClick={() => esegui(() => call("sectionSetRanges", { id: s.id, ranges: rangesPerServer(bozzaRanges[s.id]) }), "Piani salvati.")}>
                    Salva
                  </button>
                </>
              )}
            </div>
          </>
        );
      })()}

      {vistaAttiva === "lav" && (
        <div style={card}>
          {titolo("Lavanderie", "Da 1 a 8 coppie lavatrice/asciugatrice: la lavatrice A prenota in automatico l'asciugatrice A, e così via. Una lavanderia può servire più sezioni.")}
          <div style={{ display: "grid", gap: 14 }}>
            {lavanderieVisibili.map((l) => {
              const b = bozzaLav[l.id] ?? { name: l.name, pairs: l.pairs };
              const condivisa = sezioniDiLavanderia(l.id);
              const sporca = b.name.trim() !== l.name || b.pairs !== l.pairs;
              return (
                <div key={l.id} className="adm-form" style={{ alignItems: "center" }}>
                  <input style={S.input} value={b.name} maxLength={60}
                         onChange={(e) => setBozzaLav({ ...bozzaLav, [l.id]: { ...b, name: e.target.value } })} />
                  <Contatore valore={b.pairs} onChange={(n) => setBozzaLav({ ...bozzaLav, [l.id]: { ...b, pairs: n } })} />
                  <span style={{ fontSize: 12, ...S.sub }}>{testoMacchine(b.pairs)}</span>
                  <button style={sporca ? primario : S.btn} disabled={busy || !sporca}
                    onClick={() => esegui(() => call("laundryUpdate", { id: l.id, name: b.name, pairs: b.pairs }), "Lavanderia salvata.")}>
                    Salva
                  </button>
                  <span style={{ fontSize: 12, ...S.sub, flexBasis: "100%" }}>
                    {condivisa.length === 0 ? "Non usata da nessuna sezione"
                      : condivisa.length === 1 ? `Usata da ${condivisa[0].code}`
                      : `Condivisa fra ${condivisa.map((x) => x.code).join(" e ")}`}
                  </span>
                </div>
              );
            })}
          </div>
          {superadmin && (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>Nuova lavanderia</h3>
              <div className="adm-form">
                <input style={S.input} placeholder="Identificativo (es. po-mole)" value={nuovaLav.slug} maxLength={31}
                       onChange={(e) => setNuovaLav({ ...nuovaLav, slug: e.target.value })} />
                <input style={S.input} placeholder="Nome" value={nuovaLav.name} maxLength={60}
                       onChange={(e) => setNuovaLav({ ...nuovaLav, name: e.target.value })} />
                <Contatore valore={nuovaLav.pairs} onChange={(n) => setNuovaLav({ ...nuovaLav, pairs: n })} />
                <span style={{ fontSize: 12, ...S.sub }}>{testoMacchine(nuovaLav.pairs)}</span>
                <button style={primario} disabled={busy}
                  onClick={() => esegui(async () => { await call("laundryCreate", nuovaLav); setNuovaLav({ slug: "", name: "", pairs: 2 }); }, "Lavanderia creata.")}>
                  Crea
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {superadmin && vistaAttiva === "nuova" && (
        <div style={card}>
          {titolo("Nuova sezione", "Il numero è automatico (il prossimo libero). Se la sezione ha una lavanderia nuova, creala prima nella scheda Lavanderie.")}
          <div className="adm-form" style={{ marginBottom: 12 }}>
            <input style={{ ...S.input, maxWidth: 130 }} placeholder="Lettera (es. P)" value={nuova.code} maxLength={2}
                   onChange={(e) => setNuova({ ...nuova, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
            <input style={S.input} placeholder="Nome (es. Po)" value={nuova.name} maxLength={60}
                   onChange={(e) => setNuova({ ...nuova, name: e.target.value })} />
          </div>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Funzioni</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, marginBottom: 12 }}>
            {FUNZIONI.map((fn) => (
              <label key={fn.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={acceso(nuova.features, fn.key)}
                       onChange={(e) => setNuova({ ...nuova, features: { ...nuova.features, [fn.key]: e.target.checked } })} />
                {fn.label}
              </label>
            ))}
          </div>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Piani e camere</h3>
          <Intervalli valore={nuova.ranges} lavanderie={lavanderie} onChange={(r) => setNuova({ ...nuova, ranges: r })} />
          <button style={{ ...primario, marginTop: 12 }} disabled={busy || !nuova.code || !nuova.name.trim()}
            onClick={() => esegui(async () => {
              await call("sectionCreate", {
                code: nuova.code, name: nuova.name,
                features: nuova.features, ranges: rangesPerServer(nuova.ranges),
              });
              setNuova({ code: "", name: "", features: {}, ranges: [] });
            }, "Sezione creata.")}>
            Crea sezione
          </button>
        </div>
      )}
    </>
  );
}
