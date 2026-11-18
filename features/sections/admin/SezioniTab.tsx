import { useCallback, useEffect, useState } from "react";
import { call } from "../../admin-shared/adminApi";
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
  { key: "linen", label: "Cambio biancheria" },
  { key: "grigliata", label: "Grigliata" },
  { key: "theme", label: "Tema stagionale" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
type Lavanderia = { id: number; slug: string; name: string; pairs: number };

const FUNZIONI: { key: string; label: string }[] = [
  { key: "laundry", label: "Lavanderia" },
  { key: "cinema", label: "Sala cinema" },
  { key: "music", label: "Sala musica" },
  { key: "conference", label: "Sala polivalente" },
  { key: "bikes", label: "Bici" },
  { key: "linen", label: "Cambio biancheria" },
  { key: "grigliata", label: "Grigliata" },
  { key: "feedback", label: "Segnalazioni" },
  { key: "notifications", label: "Notifiche (push e Telegram)" },
  { key: "theme", label: "Tema stagionale" },
];

const acceso = (f: Record<string, boolean>, k: string) => f?.[k] !== false;
const primario = { ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)", borderColor: "transparent" } as const;

/** Editor di un elenco di intervalli di camere, ognuno con la sua lavanderia. */
function Intervalli({ valore, onChange, lavanderie, disabled }: {
  valore: Range[]; onChange: (r: Range[]) => void; lavanderie: Lavanderia[]; disabled?: boolean;
}) {
  const set = (i: number, patch: Partial<Range>) => onChange(valore.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string): number | "" => (v === "" ? "" : Number(v));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {valore.map((r, i) => (
        <div key={i} className="adm-form">
          <input style={S.input} placeholder="Nome (es. Manica)" value={r.label} maxLength={40} disabled={disabled}
                 onChange={(e) => set(i, { label: e.target.value })} />
          <input style={{ ...S.input, maxWidth: 90 }} inputMode="numeric" placeholder="Da" value={r.from} disabled={disabled}
                 onChange={(e) => set(i, { from: num(e.target.value) })} />
          <input style={{ ...S.input, maxWidth: 90 }} inputMode="numeric" placeholder="A" value={r.to} disabled={disabled}
                 onChange={(e) => set(i, { to: num(e.target.value) })} />
          <input type="color" aria-label="Colore" value={r.color && HEX.test(r.color) ? r.color : "#999999"} disabled={disabled}
                 style={{ width: 40, height: 38, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "var(--background)" }}
                 onChange={(e) => set(i, { color: e.target.value })} />
          <select style={S.input} value={r.laundry_id ?? ""} disabled={disabled}
                  onChange={(e) => set(i, { laundry_id: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Nessuna lavanderia</option>
            {lavanderie.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {!disabled && <button type="button" style={S.danger} onClick={() => onChange(valore.filter((_, j) => j !== i))}>Togli</button>}
        </div>
      ))}
      {!disabled && (
        <div><button type="button" style={S.btn}
          onClick={() => onChange([...valore, { label: "", from: "", to: "", laundry_id: lavanderie[0]?.id ?? null }])}>
          + Intervallo
        </button></div>
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
  const [nuova, setNuova] = useState<{ code: string; number: string; name: string; features: Record<string, boolean>; ranges: Range[] }>(
    { code: "", number: "", name: "", features: {}, ranges: [] });
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

  return (
    <>
      <p style={{ fontSize: 13, ...S.sub, marginBottom: 16 }}>
        Ogni sezione ha una lettera con cui i residenti entrano (V112, P21-b), delle funzioni accese o
        spente, e degli intervalli di camere ognuno con la sua lavanderia. Due sezioni possono usare
        la stessa lavanderia.
      </p>
      {msg && <div style={{ ...S.card, padding: 12, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      {sezioni.map((s) => {
        const f = funzioniDi(s);
        const sporca = bozzaFunzioni[s.id] !== undefined;
        return (
          <div key={s.id} style={{ ...S.card, padding: 18, marginBottom: 16, opacity: s.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>
                {s.code} · {s.name} <span style={{ ...S.sub, fontWeight: 400 }}>(sezione {s.number})</span>
                {!s.active && <span style={{ ...S.sub, fontWeight: 400 }}> — disattivata</span>}
              </h2>
              {superadmin && (
                <button style={S.btn} disabled={busy}
                  onClick={() => esegui(() => call("sectionUpdate", { id: s.id, active: !s.active }), s.active ? "Sezione disattivata." : "Sezione riattivata.")}>
                  {s.active ? "Disattiva" : "Riattiva"}
                </button>
              )}
            </div>

            <div className="adm-form" style={{ marginBottom: 12 }}>
              <input style={S.input} value={bozzaNome[s.id] ?? s.name} maxLength={60}
                     onChange={(e) => setBozzaNome({ ...bozzaNome, [s.id]: e.target.value })} />
              <button style={S.btn} disabled={busy || bozzaNome[s.id] === undefined || bozzaNome[s.id].trim() === s.name}
                onClick={() => esegui(() => call("sectionUpdate", { id: s.id, name: bozzaNome[s.id] }), "Nome salvato.")}>
                Salva nome
              </button>
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Funzioni</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, marginBottom: 10 }}>
              {FUNZIONI.map((fn) => (
                <label key={fn.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={acceso(f, fn.key)}
                         onChange={(e) => setBozzaFunzioni({ ...bozzaFunzioni, [s.id]: { ...f, [fn.key]: e.target.checked } })} />
                  {fn.label}
                </label>
              ))}
            </div>
            <button style={sporca ? primario : S.btn} disabled={busy || !sporca}
              onClick={() => esegui(() => call("sectionUpdate", { id: s.id, features: bozzaFunzioni[s.id] }), "Funzioni salvate.")}>
              Salva funzioni
            </button>
            <p style={{ fontSize: 12, ...S.sub, marginTop: 6 }}>
              Una funzione spenta sparisce per chi abita in questa sezione. Sale comuni, sala polivalente,
              cambio biancheria e grigliata sono risorse di tutto il collegio: qui si decide solo chi le vede.
            </p>

            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px" }}>Risorse: proprie o condivise</h3>
            <p style={{ fontSize: 12, ...S.sub, marginBottom: 8 }}>
              Ogni sezione ha le sue risorse, indipendenti dalle altre. Se ne condividi una, la sezione
              scelta ne e' la proprietaria: voi due usate la stessa e gli amministratori di entrambe la
              gestiscono insieme.
            </p>
            {(() => {
              const cond = bozzaCond[s.id] ?? s.shared_with ?? {};
              const sporcaC = bozzaCond[s.id] !== undefined;
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
                    {RISORSE.map((r) => {
                      const altre = tutteLeSezioni.filter((x) =>
                        x.id !== s.id && x.active && !(x.shared_with?.[r.key]));
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
                          {laUsanoAltri && <span style={{ fontSize: 11, ...S.sub }}>Altre sezioni usano gia' la tua: non puo' essere condivisa a sua volta.</span>}
                        </label>
                      );
                    })}
                  </div>
                  <button style={{ ...(sporcaC ? primario : S.btn), marginTop: 8 }} disabled={busy || !sporcaC}
                    onClick={() => esegui(() => call("sectionSetSharing", { id: s.id, shared: Object.fromEntries(RISORSE.map((r) => [r.key, cond[r.key] ?? null])) }), "Condivisioni salvate.")}>
                    Salva condivisioni
                  </button>
                </>
              );
            })()}

            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px" }}>Intervalli di camere</h3>
            {!superadmin && (
              <>
                <p style={{ fontSize: 12, ...S.sub, marginBottom: 8 }}>
                  Nome e colore di ogni gruppo di camere (un piano, un edificio): il colore e' quello
                  con cui compaiono le camere nelle griglie e negli elenchi.
                </p>
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
              </>
            )}
            {superadmin && <Intervalli valore={intervalliDi(s)} lavanderie={lavanderie}
                        onChange={(r) => setBozzaRanges({ ...bozzaRanges, [s.id]: r })} />}
            {superadmin && (
              <button style={bozzaRanges[s.id] ? { ...primario, marginTop: 8 } : { ...S.btn, marginTop: 8 }} disabled={busy || !bozzaRanges[s.id]}
                onClick={() => esegui(() => call("sectionSetRanges", { id: s.id, ranges: rangesPerServer(bozzaRanges[s.id]) }), "Intervalli salvati.")}>
                Salva intervalli
              </button>
            )}
            {!superadmin && <p style={{ fontSize: 12, ...S.sub, marginTop: 6 }}>I numeri degli intervalli li modifica un superadmin.</p>}
          </div>
        );
      })}
      {sezioni.length === 0 && <p style={{ fontSize: 13, ...S.sub }}>Nessuna sezione nel tuo ambito.</p>}

      <div style={{ ...S.card, padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Lavanderie</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {lavanderieVisibili.map((l) => {
            const b = bozzaLav[l.id] ?? { name: l.name, pairs: l.pairs };
            const condivisa = sezioniDiLavanderia(l.id);
            const sporca = b.name.trim() !== l.name || b.pairs !== l.pairs;
            return (
              <div key={l.id} className="adm-form">
                <input style={S.input} value={b.name} maxLength={60}
                       onChange={(e) => setBozzaLav({ ...bozzaLav, [l.id]: { ...b, name: e.target.value } })} />
                <select style={{ ...S.input, maxWidth: 150 }} value={b.pairs}
                        onChange={(e) => setBozzaLav({ ...bozzaLav, [l.id]: { ...b, pairs: Number(e.target.value) } })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? "coppia" : "coppie"}</option>)}
                </select>
                <button style={sporca ? primario : S.btn} disabled={busy || !sporca}
                  onClick={() => esegui(() => call("laundryUpdate", { id: l.id, name: b.name, pairs: b.pairs }), "Lavanderia salvata.")}>
                  Salva
                </button>
                <span style={{ fontSize: 12, ...S.sub, flexBasis: "100%" }}>
                  {condivisa.length === 0 ? "Non usata da nessuna sezione"
                    : condivisa.length === 1 ? `Usata da ${condivisa[0].code}`
                    : `Condivisa fra ${condivisa.map((x) => x.code).join(" e ")}`}
                  {" · "}ogni lavatrice prenota in automatico l'asciugatrice con la stessa lettera
                </span>
              </div>
            );
          })}
        </div>
        {superadmin && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px" }}>Nuova lavanderia</h3>
            <div className="adm-form">
              <input style={S.input} placeholder="Identificativo (es. po-mole)" value={nuovaLav.slug} maxLength={31}
                     onChange={(e) => setNuovaLav({ ...nuovaLav, slug: e.target.value })} />
              <input style={S.input} placeholder="Nome" value={nuovaLav.name} maxLength={60}
                     onChange={(e) => setNuovaLav({ ...nuovaLav, name: e.target.value })} />
              <select style={{ ...S.input, maxWidth: 150 }} value={nuovaLav.pairs}
                      onChange={(e) => setNuovaLav({ ...nuovaLav, pairs: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? "coppia" : "coppie"}</option>)}
              </select>
              <button style={primario} disabled={busy}
                onClick={() => esegui(async () => { await call("laundryCreate", nuovaLav); setNuovaLav({ slug: "", name: "", pairs: 2 }); }, "Lavanderia creata.")}>
                Crea
              </button>
            </div>
          </>
        )}
      </div>

      {superadmin && (
        <div style={{ ...S.card, padding: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Nuova sezione</h2>
          <div className="adm-form" style={{ marginBottom: 12 }}>
            <input style={{ ...S.input, maxWidth: 90 }} placeholder="Lettera" value={nuova.code} maxLength={2}
                   onChange={(e) => setNuova({ ...nuova, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
            <input style={{ ...S.input, maxWidth: 110 }} inputMode="numeric" placeholder="Numero" value={nuova.number}
                   onChange={(e) => setNuova({ ...nuova, number: e.target.value.replace(/\D/g, "") })} />
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
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Intervalli di camere</h3>
          <Intervalli valore={nuova.ranges} lavanderie={lavanderie} onChange={(r) => setNuova({ ...nuova, ranges: r })} />
          <button style={{ ...primario, marginTop: 12 }} disabled={busy || !nuova.code || !nuova.number || !nuova.name.trim()}
            onClick={() => esegui(async () => {
              await call("sectionCreate", {
                code: nuova.code, number: Number(nuova.number), name: nuova.name,
                features: nuova.features, ranges: rangesPerServer(nuova.ranges),
              });
              setNuova({ code: "", number: "", name: "", features: {}, ranges: [] });
            }, "Sezione creata.")}>
            Crea sezione
          </button>
        </div>
      )}
    </>
  );
}
