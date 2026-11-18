import { Wrench, MessageSquare, LogOut, Settings } from "lucide-react";
import { WashingMachine } from "../icons";
import { type Section } from "../sectionsApi";
import { APP_VERSION } from "../modello";
import { T, type Lang } from "../i18n";
import { RED, RED_FG } from "../tema";
import type { Role as AdminRole } from "../AdminPanel";
import { type Facility, roomLabel, facilitiesFor, utilityPagesFor, adminSectionsFor } from "./navigazione";

// ─── Sidebar desktop ──────────────────────────────────────────────────────────

export function DesktopSidebar({ lang, roomNumber, showNav, facility, onFacility, adminRole, onChangeRoom, grigliataAttiva, section }: {
  lang: Lang;
  roomNumber: string | null; showNav: boolean;
  facility: Facility; onFacility: (f: Facility) => void;
  adminRole: AdminRole | null;
  onChangeRoom: () => void;
  grigliataAttiva: boolean; section: Section | null;
}) {
  const t   = T[lang];
  const fg  = "var(--foreground)";
  const sub = "var(--gray-accessible-text)";
  const div = "var(--border)";
  return (
    <aside className="w-60 shrink-0 h-dvh flex flex-col border-r" style={{ background:"var(--background)", borderColor:div }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b" style={{ borderColor:div }}>
        <div className="p-2 rounded-xl" style={{ background:"color-mix(in srgb, var(--primary) 15%, transparent)" }}>
          <WashingMachine size={20} style={{ color:RED }}/>
        </div>
        <span className="text-lg font-bold" style={{ color:fg }}>Sez. Valentino</span>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {/* Strutture: Lavanderia / Cinema / Musica / Polivalente.
            Le schede Dashboard/Giornaliero/Settimana non sono piu' annidate
            sotto Lavanderia: sul telefono sono sparite da un pezzo — si
            arriva al giornaliero e alla settimana dai pulsanti della
            dashboard, e si torna indietro dall'interruttore in cima a
            ciascuna vista — e tenerle qui faceva del desktop una navigazione
            diversa da quella del telefono, per le stesse tre schermate. */}
        {showNav && facilitiesFor(roomNumber, grigliataAttiva, section).map(({ id, icon: Icon, chiave }) => {
          const isActive = facility === id;
          return (
            <button key={id} onClick={()=>onFacility(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${isActive ? "" : "desk-nav"}`}
              style={isActive ? { background:RED, color:RED_FG } : { color:sub }}>
              <Icon size={18}/>{T[lang][chiave]}
            </button>
          );
        })}

        {/* Sezioni amministrative: stesso livello delle strutture, in coda e
            separate perché sono di natura diversa. Compaiono solo con una
            sessione attiva; l'uscita sta dentro la sezione stessa. */}
        {showNav && adminSectionsFor(adminRole).length > 0 && (
          <>
            <div className="h-px my-2 mx-2" style={{ background:div }}/>
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color:sub }}>
              {T[lang].amministrazione}
            </p>
            {adminSectionsFor(adminRole).map(({ id, icon: Icon, chiave }) => {
              const isActive = facility === id;
              return (
                <button key={id} onClick={()=>onFacility(id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors text-left ${isActive ? "" : "desk-nav"}`}
                  style={isActive ? { background:RED, color:RED_FG } : { color:sub }}>
                  <Icon size={18}/>{T[lang][chiave]}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Controlli */}
      <div className="px-3 py-4 border-t flex flex-col gap-2 shrink-0" style={{ borderColor:div }}>
        {roomNumber !== null && (
          <button onClick={onChangeRoom}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors desk-nav"
            style={{ color:fg }}>
            <span className="font-mono">{roomLabel(roomNumber, t)}</span>
            <LogOut size={13} style={{ color:sub }}/>
          </button>
        )}
        {/* Lingua, notifiche, installazione, accessibilità stanno tutte dentro
            Impostazioni. Il refresh manuale è sparito (tornare sull'app ricarica
            già i dati) e il tema segue sempre quello del sistema.

            Queste tre sono pagine come le altre — stesso `onFacility` delle
            strutture qui sopra — solo raggruppate qui perche' non sono
            strutture.

            Gate su showNav come le liste qui sopra: prima erano sempre
            visibili, anche a schermata di accesso ancora aperta (roomNumber
            null, prima di "Continua senza accedere"). Da li' si poteva
            aprire Impostazioni, che pero' non ha un pulsante indietro suo —
            l'unico modo di tornare era la pastiglia "Cambia camera" qui
            sotto, nascosta esattamente perche' non c'e' ancora una camera:
            un vicolo cieco raggiungibile solo da desktop, perche' sul
            telefono l'hamburger che apre queste stesse voci e' gia' dietro
            lo stesso showChrome. */}
        {showNav && utilityPagesFor(section).map(({ id, chiave }) => {
          const Icona = id === "guasto" ? Wrench : id === "impostazioni" ? Settings : MessageSquare;
          const attiva = facility === id;
          return (
            <button key={id} onClick={()=>onFacility(id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${attiva ? "" : "desk-nav"}`}
              style={attiva ? { background:RED, color:RED_FG } : { color:fg }}>
              <Icona size={16} style={attiva ? undefined : { color:sub }}/>{T[lang][chiave]}
            </button>
          );
        })}
        <p className="text-center text-[10px] font-mono pt-1" style={{ color:sub }}>v. {APP_VERSION}</p>
      </div>
    </aside>
  );
}
