import { useCallback, useEffect, useState } from "react";
import { call } from "../../admin-shared/adminApi";
import { S } from "../../admin-shared/adminStyles";
import type { Role } from "../../admin-shared/types";

// Un account amministrativo. La password non compare mai qui: il pannello la
// invia una volta, in creazione o in reset, e da li' in poi esiste solo come
// hash nel database.
type Account = {
  id: number; username: string; ruolo: Role; attivo: boolean;
  created_at: string; password_at: string; deve_cambiare_password: boolean;
  /** v1.10 — solo delegato/sistemista; assente se il server non ha la migrazione 060. */
  camera?: string | null;
  /** La sezione dell'account (null solo per il superadmin). */
  section_id?: number | null;
};
type SezioneBreve = { id: number; code: string; name: string };

// Chi può avere una camera sua (è anche un residente): vedi account_set_camera.
const RUOLI_CON_CAMERA: Role[] = ["delegato", "admin"];

// ─── Account amministrativi ─────────────────────────────────────────────────
//
// Prima fdo, staff e sistemista erano tre righe fisse nelle variabili
// d'ambiente di Vercel: un account per ruolo, e cambiarne la password voleva
// dire chiedere a chi ha accesso a Vercel di rigenerare l'hash e ridistribuire.
// Da qui il sistemista crea, disattiva e reimposta gli account da solo.

/** Lettere maiuscole/minuscole/cifre/simboli leggibili: niente 0/O/1/l/I. */
function generaPassword(lunghezza = 16) {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#%&*";
  const casuali = crypto.getRandomValues(new Uint32Array(lunghezza));
  return Array.from(casuali, (n) => alfabeto[n % alfabeto.length]).join("");
}

const RUOLI_CREABILI: { value: Role; label: string }[] = [
  { value: "superadmin", label: "Superadmin (piattaforma)" },
  { value: "admin", label: "Admin (una sezione)" },
  { value: "fdo", label: "FDO (portineria)" },
  { value: "delegato", label: "Delegato (Grigliata)" },
];

const etichettaData = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export function Accounts({ me, myRole }: { me: string | null; myRole: Role | null }) {
  const [items, setItems] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ruolo, setRuolo] = useState<Role>("fdo");
  const [mostraPassword, setMostraPassword] = useState(false);
  // Ogni account non superadmin ha UNA sezione. Un admin crea solo FDO e
  // delegati della propria (il server la ricava dall'account); il superadmin
  // sceglie la sezione e puo' creare anche admin e altri superadmin.
  const superadmin = myRole === "superadmin";
  const [sezioni, setSezioni] = useState<SezioneBreve[]>([]);
  const [sezioneNuova, setSezioneNuova] = useState<number | "">("");
  const [sezioneEdit, setSezioneEdit] = useState<{ id: number; valore: number | "" } | null>(null);
  const ruoliCreabili = RUOLI_CREABILI.filter((r) => superadmin || r.value === "fdo" || r.value === "delegato");
  const nomeSezione = (id: number | null | undefined) => {
    const x = sezioni.find((z) => z.id === id);
    return x ? `${x.code} · ${x.name}` : id ? `#${id}` : "—";
  };

  // L'account per cui si sta scrivendo una nuova password, se ce n'e' uno.
  const [reset, setReset] = useState<{ id: number; password: string } | null>(null);
  // L'account di cui si sta scrivendo la camera, se ce n'è uno.
  const [cameraEdit, setCameraEdit] = useState<{ id: number; valore: string } | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { setItems((await call("accountList")).items); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Il superadmin le vede tutte (nessun section_id); gli altri solo la propria.
    call("sectionList", { section_id: undefined })
      .then((d) => {
        const lista = (d.sections ?? []).map((x: any) => ({ id: x.id, code: x.code, name: x.name }));
        setSezioni(lista);
        setSezioneNuova((cur) => (cur === "" && lista.length > 0 ? lista[0].id : cur));
      })
      .catch(() => setSezioni([]));
  }, []);

  async function salvaSezione() {
    if (!sezioneEdit || sezioneEdit.valore === "") return;
    setBusy(true); setMsg(null);
    try {
      await call("accountSetSection", { id: sezioneEdit.id, section_id: sezioneEdit.valore });
      setMsg("Sezione aggiornata.");
      setSezioneEdit(null);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function crea() {
    if (!username.trim()) { setMsg("Indica un nome utente."); return; }
    if (password.length < 8) { setMsg("La password deve avere almeno 8 caratteri."); return; }
    if (superadmin && ruolo !== "superadmin" && sezioneNuova === "") { setMsg("Scegli la sezione dell'account."); return; }
    setBusy(true); setMsg(null);
    try {
      await call("accountCreate", {
        username: username.trim(), password, ruolo,
        // Un admin non manda la sezione: e' la sua, la decide il server.
        section_id: !superadmin || ruolo === "superadmin" ? undefined : sezioneNuova,
      });
      setMsg(`Account "${username.trim()}" creato.`);
      setUsername(""); setPassword(""); setMostraPassword(false);
      load();
    } catch (e: any) {
      setMsg(e.message === "nome utente gia' in uso" ? "Quel nome utente esiste gia'." : e.message);
    } finally { setBusy(false); }
  }

  async function confermaReset() {
    if (!reset || reset.password.length < 8) { setMsg("La password deve avere almeno 8 caratteri."); return; }
    setBusy(true); setMsg(null);
    try {
      await call("accountSetPassword", { id: reset.id, password: reset.password });
      setMsg("Password reimpostata.");
      setReset(null);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function salvaCamera() {
    if (!cameraEdit) return;
    setBusy(true); setMsg(null);
    try {
      await call("accountSetCamera", { id: cameraEdit.id, camera: cameraEdit.valore });
      setMsg(cameraEdit.valore.trim() ? `Camera ${cameraEdit.valore.trim()} associata.` : "Camera tolta.");
      setCameraEdit(null);
      load();
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function toggle(a: Account) {
    try { await call("accountSetActive", { id: a.id, attivo: !a.attivo }); load(); }
    catch (e: any) { setMsg(e.message); }
  }

  async function elimina(a: Account) {
    if (!confirm(`Eliminare l'account "${a.username}"? Resta traccia nel registro azioni di cio' che ha gia' fatto.`)) return;
    setBusy(true);
    try { await call("accountDelete", { id: a.id }); load(); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <p style={{ fontSize: 13, ...S.sub, marginBottom: 16 }}>
        Ogni account appartiene a una sezione. Qui puoi creare un account per persona, disattivarlo quando non serve piu' e
        reimpostarne la password senza toccare la configurazione del server.
      </p>

      {msg && <div role="status" style={{ ...S.card, padding: 12, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      <div className="riepilogo">
        <div className="riepilogo__voce"><div className="riepilogo__n">{items.length}</div><div className="riepilogo__l">Account</div></div>
        <div className="riepilogo__voce"><div className="riepilogo__n">{items.filter((a) => a.attivo).length}</div><div className="riepilogo__l">Attivi</div></div>
        <div className="riepilogo__voce"><div className="riepilogo__n">{items.filter((a) => a.deve_cambiare_password).length}</div><div className="riepilogo__l">In attesa del primo accesso</div></div>
      </div>

      <div style={{ ...S.card, padding: 18, marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>Nuovo account</h2>
        <div className="adm-form">
          <input style={S.input} placeholder="Nome utente" value={username}
                 maxLength={24} onChange={(e) => setUsername(e.target.value)} />
          <select style={S.input} value={ruolo} onChange={(e) => setRuolo(e.target.value as Role)}>
            {ruoliCreabili.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input style={S.input} type={mostraPassword ? "text" : "password"} placeholder="Password (min. 8 caratteri)"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" style={S.btn} onClick={() => { setPassword(generaPassword()); setMostraPassword(true); }}>
            Genera
          </button>
          <button style={{ ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)" }}
                  disabled={busy} onClick={crea}>Crea account</button>
        </div>
        {superadmin && ruolo !== "superadmin" && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <label style={{ fontSize: 12, ...S.sub, display: "block", marginBottom: 4 }}>Sezione</label>
            <select style={{ ...S.input, width: "auto", minWidth: 200 }} value={sezioneNuova}
                    onChange={(e) => setSezioneNuova(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Scegli una sezione…</option>
              {sezioni.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
            </select>
          </div>
        )}
        {!superadmin && sezioni.length > 0 && (
          <p style={{ fontSize: 12, ...S.sub, marginTop: 10 }}>
            L'account sara' della tua sezione ({nomeSezione(sezioni[0].id)}): FDO o delegato.
          </p>
        )}
        {mostraPassword && password && (
          <p style={{ fontSize: 12, ...S.sub, marginTop: 10 }}>
            Copiala ora: non verra' piu' mostrata dopo la creazione. <strong style={{ color: "var(--foreground)" }}>{password}</strong>
          </p>
        )}
      </div>

      <div style={{ ...S.card, padding: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 12 }}>Account ({items.length})</h2>
        {items.length === 0 && <p style={{ fontSize: 13, ...S.sub }}>Nessun account creato dal pannello.</p>}
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((a) => (
            <div key={a.id}>
              <div className="adm-rule" style={{ opacity: a.attivo ? 1 : 0.5 }}>
                {/* Larghezza fissa: "SISTEMISTA" e "FDO" hanno lunghezze
                    molto diverse, e senza un minimo comune ogni riga faceva
                    iniziare il nome utente a un punto diverso — la colonna
                    non era una colonna. */}
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, flexShrink: 0, textTransform: "capitalize",
                  background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)",
                }}>
                  {a.ruolo}
                </span>
                <span className="adm-rule__what">
                  {a.username}{a.username === me && <span style={{ ...S.sub }}> (tu)</span>}
                  {/* Chi non ha ancora fatto il primo accesso non ha ancora
                      scelto una password sua: sta ancora usando quella data
                      dal sistemista alla creazione (o all'ultimo reset). */}
                  {a.deve_cambiare_password && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 99,
                      background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
                      color: "var(--destructive-text)",
                    }}>In attesa del primo accesso</span>
                  )}
                  <span style={{ display: "block", fontSize: 12, ...S.sub }}>
                    creato il {etichettaData(a.created_at)} · password aggiornata il {etichettaData(a.password_at)}
                  </span>
                  <span style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                    Sezione: <strong>{a.ruolo === "superadmin" ? "tutte" : nomeSezione(a.section_id)}</strong>
                    {superadmin && a.ruolo !== "superadmin" && (<>
                      {" · "}
                      <button disabled={busy}
                        onClick={() => setSezioneEdit(sezioneEdit?.id === a.id ? null : { id: a.id, valore: a.section_id ?? "" })}
                        style={{ fontSize: 12, fontWeight: 700, color: "var(--gray-accessible-text)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                        sposta
                      </button>
                    </>)}
                  </span>
                  {/* Delegato e sistemista spesso sono anche residenti: con la
                      camera associata, dall'app passano fra la propria camera
                      e la Direzione senza uscire dall'account. */}
                  {RUOLI_CON_CAMERA.includes(a.ruolo) && (
                    <span style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                      {a.camera ? <>Camera <strong>{a.camera}</strong></> : <span style={{ ...S.sub }}>Nessuna camera</span>}
                      {" · "}
                      <button disabled={busy}
                        onClick={() => setCameraEdit(cameraEdit?.id === a.id ? null : { id: a.id, valore: a.camera ?? "" })}
                        style={{ fontSize: 12, fontWeight: 700, color: "var(--gray-accessible-text)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                        {a.camera ? "cambia" : "associa"}
                      </button>
                    </span>
                  )}
                </span>
                <span className="adm-rule__act">
                  <button style={S.btn} disabled={busy}
                          onClick={() => setReset(reset?.id === a.id ? null : { id: a.id, password: "" })}>
                    Reimposta password
                  </button>
                  {/* Disattivare o eliminare il proprio account da qui non blocca fuori
                      nessuno (le tre variabili d'ambiente restano una via d'accesso),
                      ma resta un modo facile di spararsi in un piede per sbaglio. */}
                  <button style={S.btn} disabled={busy || a.username === me} onClick={() => toggle(a)}>
                    {a.attivo ? "Disattiva" : "Riattiva"}
                  </button>
                  <button style={S.danger} disabled={busy || a.username === me} onClick={() => elimina(a)}>Elimina</button>
                </span>
              </div>
              {sezioneEdit?.id === a.id && (
                <div className="adm-form" style={{ marginTop: 6 }}>
                  <select style={S.input} value={sezioneEdit.valore}
                          onChange={(e) => setSezioneEdit({ id: a.id, valore: e.target.value === "" ? "" : Number(e.target.value) })}>
                    <option value="">Scegli una sezione…</option>
                    {sezioni.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                  </select>
                  <button style={{ ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)" }}
                          disabled={busy} onClick={salvaSezione}>Salva</button>
                  <button style={S.btn} disabled={busy} onClick={() => setSezioneEdit(null)}>Annulla</button>
                </div>
              )}
              {cameraEdit?.id === a.id && (
                <div className="adm-form" style={{ marginTop: 6 }}>
                  <input style={S.input} placeholder="Camera con lettera, es. V112 (vuoto = nessuna)"
                         value={cameraEdit.valore} maxLength={6}
                         onChange={(e) => setCameraEdit({ id: a.id, valore: e.target.value })} />
                  <button style={{ ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)" }}
                          disabled={busy} onClick={salvaCamera}>Salva</button>
                  <button style={S.btn} disabled={busy} onClick={() => setCameraEdit(null)}>Annulla</button>
                </div>
              )}
              {reset?.id === a.id && (
                <div className="adm-form" style={{ marginTop: 6 }}>
                  <input style={S.input} type="text" placeholder="Nuova password (min. 8 caratteri)"
                         value={reset.password} onChange={(e) => setReset({ id: a.id, password: e.target.value })} />
                  <button type="button" style={S.btn} onClick={() => setReset({ id: a.id, password: generaPassword() })}>
                    Genera
                  </button>
                  <button style={{ ...S.btn, background: "var(--primary)", color: "var(--primary-foreground)" }}
                          disabled={busy} onClick={confermaReset}>Conferma</button>
                  <button style={S.btn} disabled={busy} onClick={() => setReset(null)}>Annulla</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
