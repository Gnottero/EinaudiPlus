// Schermate amministrative — si aprono dal menu Impostazioni dell'app.
//
// Tengono solo cio' che nell'app normale non esiste: lo stato delle macchine,
// le segnalazioni dei residenti e, per il sistemista, regole ricorrenti e
// pulizia.
//
// Prenotare e cancellare NON si fa da qui: si fa nell'app principale, dove chi
// ha una sessione admin puo' agire a nome della DIREZIONE su qualsiasi turno.
//
// Caricato in lazy da App.tsx: non pesa sul bundle dei residenti.
//
// Ogni dominio (account, macchine, sale, bici, notifiche, ricorrenti,
// manutenzione, tema) vive nella sua feature-folder, in un sottodominio
// admin/ accanto alle viste dei residenti — speculare ai moduli backend.
// Qui resta solo il guscio: la sessione, il routing fra schede (AdminScreens)
// e le poche cose che App.tsx e Conferenze.tsx importano ancora da qui.

import { useCallback, useEffect, useState } from "react";
import { call, getAdminSection, setAdminSection } from "./features/admin-shared/adminApi";
import { invalidateSectionConfig, loadSectionConfig } from "./sectionsApi";
import { S } from "./features/admin-shared/adminStyles";
import type { Laundry } from "./features/laundry/admin/types";
import { Login } from "./features/identity/admin/Login";
import { Macchine } from "./features/laundry/admin/MacchineTab";
import { CambioBiancheria } from "./features/laundry/admin/CambioBiancheriaTab";
import { Segnalazioni } from "./features/feedback/admin/Segnalazioni";
import { Bici } from "./features/bikes/admin/BiciTab";
import { Accounts } from "./features/identity/admin/Accounts";
import { Ricorrenti } from "./features/ops/admin/Ricorrenti";
import { Notifiche } from "./features/notifications/admin/NotificheTab";
import { Manutenzione } from "./features/ops/admin/Manutenzione";
import { Tema } from "./features/theme/admin/Tema";
import { GrigliataAdmin } from "./features/grigliata/admin/GrigliataAdmin";
import { SezioniTab } from "./features/sections/admin/SezioniTab";
import { CambiaPasswordObbligata } from "./features/identity/admin/Session";

export type { Role, Tab } from "./features/admin-shared/types";
import type { Role, Tab } from "./features/admin-shared/types";

export { adminLogout, CambiaPasswordObbligata, AdminLoginSheet } from "./features/identity/admin/Session";
export { GiornoSheetAdmin } from "./features/conference-room/admin/GiornoSheetAdmin";

// ─── Sezione amministrativa ──────────────────────────────────────────────────
//
// Non e' piu' una pagina a se' ne' un pannello sovrapposto: e' una destinazione
// della navigazione, allo stesso livello di Lavanderia, Cinema e Musica. Un
// amministratore usa esattamente la stessa app di tutti gli altri e trova
// qualche voce in piu' nella lista di sinistra.
//
// La barra del ruolo con "Esci" sta qui dentro, su ogni sezione: chi deve
// passare da FDO ad admin lo fa da dove sta gia' lavorando, senza andare a
// cercare il menu.

// Le schede che agiscono su UNA sezione: un superadmin (che non ne ha una sua)
// le apre solo dopo aver scelto la sezione dal selettore in cima.
const SCHEDE_DI_SEZIONE: Tab[] = [
  "macchine", "cambiobiancheria", "segnalazioni", "bici", "grigliataAdmin",
  "ricorrenti", "notifiche", "manutenzione", "tema",
];

type SezioneBreve = { id: number; code: string; name: string };

export function AdminScreens({ tab, onSession }: {
  tab: Tab;
  onSession: (role: Role | null) => void;   // per riallineare l'app dopo logout o scadenza
}) {
  const [logged, setLogged] = useState<boolean | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [deveCambiare, setDeveCambiare] = useState(false);
  const [laundries, setLaundries] = useState<Laundry[]>([]);
  // Selettore di sezione del superadmin (gli altri ruoli hanno la loro).
  const [sezioni, setSezioni] = useState<SezioneBreve[]>([]);
  const [sezioneSel, setSezioneSel] = useState<number | null>(getAdminSection());

  const loadOverview = useCallback(async () => {
    try { setLaundries((await call("overview")).laundries); }
    catch (e: any) { if (e.message === "SESSIONE_SCADUTA") { setLogged(false); onSession(null); } }
  }, [onSession]);

  const refreshSession = useCallback(() => {
    fetch("/api/admin/auth")
      .then((r) => r.json())
      .then((d) => {
        setLogged(Boolean(d.logged));
        setRole(d.role || null);
        setUsername(d.user || null);
        setDeveCambiare(Boolean(d.deve_cambiare_password));
        onSession(d.logged ? (d.role as Role) : null);
      })
      .catch(() => { setLogged(false); onSession(null); });
  }, [onSession]);

  useEffect(() => { refreshSession(); }, [refreshSession]);

  // Le schede leggono i gruppi di camere (colori) dalla configurazione.
  useEffect(() => { if (logged) loadSectionConfig(); }, [logged]);

  const superadmin = role === "superadmin";

  // L'elenco delle sezioni per il selettore: "tutte" (nessun section_id) cosi'
  // il superadmin le vede tutte.
  useEffect(() => {
    if (!logged || !superadmin) return;
    call("sectionList", { section_id: undefined })
      .then((d) => {
        const lista: SezioneBreve[] = (d.sections ?? []).map((x: any) => ({ id: x.id, code: x.code, name: x.name }));
        setSezioni(lista);
        // Una sezione scelta non e' mai "nessuna": se quella salvata non esiste piu', la prima.
        setSezioneSel((cur) => {
          const valida = cur !== null && lista.some((x) => x.id === cur) ? cur : (lista[0]?.id ?? null);
          setAdminSection(valida);
          return valida;
        });
      })
      .catch(() => setSezioni([]));
  }, [logged, superadmin]);

  function scegliSezione(id: number | null) {
    setAdminSection(id);
    setSezioneSel(id);
    invalidateSectionConfig();
    loadSectionConfig();
  }

  // Il delegato non vede nient'altro che Grigliata — l'unica scheda che non usa
  // `laundries` — quindi per lui la chiamata fallirebbe soltanto (il server la
  // rifiuta: il delegato ha un solo permesso, la grigliata). Per il
  // superadmin si rifa' a ogni cambio di sezione.
  useEffect(() => {
    if (logged && role !== "delegato" && (!superadmin || sezioneSel !== null)) loadOverview();
  }, [logged, role, superadmin, sezioneSel, loadOverview]);

  // L'uscita non sta piu' qui: la fa il pulsante della camera nell'app, che
  // chiude la sessione e riporta al selettore della stanza. `adminLogout()`
  // resta esportato ed e' quello che App.tsx chiama.

  // `admin` ha tutti i permessi di una sezione; `superadmin` gli stessi su
  // tutte le sezioni (e in piu' crea sezioni e lavanderie). Per le schede
  // sono la stessa cosa. E' solo cosa mostrare: il permesso vero lo decide il
  // server (identity/domain/permissions.js).
  const admin = role === "admin" || superadmin;
  const delegato = role === "delegato";
  const portineria = role === "fdo" || admin;   // chi vede macchine, segnalazioni, bici, biancheria

  if (logged === null) {
    return <p style={{ fontSize: 13, ...S.sub, padding: "20px 4px" }}>Caricamento…</p>;
  }

  // Sessione assente o scaduta mentre si stava lavorando: il login compare qui,
  // dove si era, invece di rimbalzare l'utente altrove senza spiegazioni.
  if (!logged) {
    return (
      <div style={{ padding: "20px 0 40px" }}>
        <p style={{ fontSize: 13, ...S.sub, marginBottom: 14, textAlign: "center" }}>
          La sessione amministrativa non è attiva.
        </p>
        <Login onDone={refreshSession} />
      </div>
    );
  }

  // Un account appena creato (o con la password appena reimpostata) non puo'
  // fare nient'altro finche' non sceglie una password sua: qui la sala
  // d'attesa sostituisce QUALUNQUE scheda, a prescindere da quale sia stata
  // scelta in navigazione — altrimenti bastava restare su Macchine per
  // rimandare la scelta all'infinito.
  if (deveCambiare) {
    return (
      <div style={{ paddingBottom: 40, color: "var(--foreground)" }}>
        <CambiaPasswordObbligata onFatto={refreshSession} />
      </div>
    );
  }

  const senzaSezione = superadmin && sezioneSel === null && SCHEDE_DI_SEZIONE.includes(tab);
  const riservata = (chi: string) => <p style={{ fontSize: 13, ...S.sub }}>Sezione riservata a {chi}.</p>;

  return (
    <div style={{ paddingBottom: 40, color: "var(--foreground)" }}>
      {/* Il superadmin non ha una sezione sua: sceglie qui su quale lavora, e
          la scelta viaggia con ogni chiamata (adminApi.ts). Gli altri ruoli non
          vedono il selettore: hanno UNA sezione, decisa dal loro account. */}
      {superadmin && tab !== "sezioni" && tab !== "account" && (
        <div style={{ ...S.card, padding: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 700, ...S.sub }}>Sezione</label>
          <select style={{ ...S.input, width: "auto", minWidth: 160 }} value={sezioneSel ?? ""}
                  onChange={(e) => scegliSezione(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">Scegli una sezione…</option>
            {sezioni.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
          </select>
        </div>
      )}

      {senzaSezione ? (
        <p style={{ fontSize: 13, ...S.sub }}>Scegli una sezione per continuare.</p>
      ) : (<>
      {/* Le schede non permesse al ruolo non compaiono nemmeno nella
          navigazione, ma se ci si arriva lo stesso il controllo vero resta sul
          server: nascondere una voce non e' un'autorizzazione. */}
      {tab === "macchine" && (portineria
        ? <Macchine laundries={laundries} reload={loadOverview} />
        : riservata("FDO e admin"))}
      {tab === "cambiobiancheria" && (portineria
        ? <CambioBiancheria />
        : riservata("FDO e admin"))}
      {tab === "segnalazioni" && (portineria
        ? <Segnalazioni laundries={laundries} reload={loadOverview} />
        : riservata("FDO e admin"))}
      {tab === "bici" && (portineria
        ? <Bici sistemista={admin} />
        : riservata("FDO e admin"))}
      {tab === "grigliataAdmin" && (delegato || admin
        ? <GrigliataAdmin />
        : riservata("delegato e admin"))}
      {tab === "account" && (admin
        ? <Accounts me={username} myRole={role} />
        : riservata("admin"))}
      {tab === "ricorrenti" && (admin
        ? laundries.length > 0 && <Ricorrenti laundries={laundries} />
        : riservata("admin"))}
      {tab === "notifiche" && (admin
        ? <Notifiche />
        : riservata("admin"))}
      {tab === "manutenzione" && (admin
        ? <Manutenzione />
        : riservata("admin"))}
      {tab === "sezioni" && (admin
        ? <SezioniTab role={role} />
        : riservata("admin"))}
      {tab === "tema" && (admin
        ? <Tema />
        : riservata("admin"))}
      </>)}
    </div>
  );
}
