import { X, Wrench, MessageSquare, Settings } from "lucide-react";
import { type Section } from "../sectionsApi";
import { APP_VERSION } from "../modello";
import { T, type Lang } from "../i18n";
import { RED, RED_FG } from "../tema";
import type { Role as AdminRole } from "../AdminPanel";
import { type Facility, facilitiesFor, utilityPagesFor, adminSectionsFor } from "./navigazione";

// Il menu laterale, su telefono.
//
// Le quattro strutture stavano in una griglia di pastiglie sotto l'orario, e
// con una sessione admin diventavano otto: mezza schermata di navigazione
// prima di arrivare al contenuto, ogni volta, anche per chi apre l'app solo
// per vedere se la lavatrice e' libera. Ora stanno dietro un pulsante, come la
// camera e le impostazioni: sono destinazioni, e una destinazione la si cerca
// quando serve.
//
// E' il gemello della sidebar del desktop — stesse voci, stesso ordine, stesse
// regole su chi vede cosa. Manca solo l'annidamento delle schede della
// lavanderia: quelle non ci sono piu' da nessuna parte, si arriva al
// giornaliero e alla settimana dai due pulsanti della dashboard.
export function MenuStrutture({ aperto, onClose, facility, onChange, lang, adminRole, roomNumber, grigliataAttiva, section }: {
  aperto: boolean; onClose: ()=>void;
  facility: Facility; onChange: (f: Facility)=>void;
  lang: Lang; adminRole: AdminRole | null; roomNumber: string | null;
  grigliataAttiva: boolean; section: Section | null;
}) {
  const sub      = "var(--gray-accessible-text)";
  const div      = "var(--border)";
  const sections = adminSectionsFor(adminRole);

  if (!aperto) return null;

  // py-2 e non py-3: con le sezioni admin al completo (sistemista) l'elenco
  // arrivava a superare l'altezza dello schermo e obbligava a scorrere il
  // pannello — qui basta stringere le righe perche' tutte le voci restino
  // visibili senza scorrere, sui telefoni normali.
  const Voce = ({ id, icon: Icon, label }: { id: Facility; icon: any; label: string }) => {
    const attiva = facility === id;
    return (
      <button onClick={()=>{ onChange(id); onClose(); }}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors text-left"
        style={attiva ? { background:RED, color:RED_FG } : { color:sub }}>
        <Icon size={18} className="shrink-0"/>{label}
      </button>
    );
  };

  return (
    <>
      {/* Il velo chiude il menu. Sta sotto al pannello e sopra a tutto il
          resto: senza, si poteva toccare la pagina dietro con il menu
          ancora aperto. */}
      <div className="absolute inset-0 z-40 menu-velo" onClick={onClose} aria-hidden="true"
        style={{ background:"rgba(0,0,0,.45)" }}/>

      <nav className="absolute inset-y-0 left-0 z-50 w-[80%] max-w-[300px] flex flex-col border-r menu-pannello"
        style={{ background:"var(--background)", borderColor:div }}
        aria-label={T[lang].navStrutture}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2.5 shrink-0" style={{ borderBottom:`1px solid ${div}` }}>
          <span className="text-base font-bold" style={{ color:"var(--foreground)" }}>Sez. Valentino</span>
          <button onClick={onClose} aria-label={T[lang].cancel}
            className="p-1.5 rounded-lg" style={{ color:sub }}>
            <X size={18}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 flex flex-col gap-0.5">
          {facilitiesFor(roomNumber, grigliataAttiva, section).map(({ id, icon, chiave }) => (
            <Voce key={id} id={id} icon={icon} label={T[lang][chiave]}/>
          ))}

          {/* Le sezioni amministrative in coda e separate: stesso livello
              delle strutture, natura diversa. Compaiono solo con una
              sessione attiva — ma il controllo vero resta sul server. */}
          {sections.length > 0 && (
            <>
              <div className="my-2 mx-3 border-t" style={{ borderColor:div }}/>
              {sections.map(({ id, icon, chiave }) => (
                <Voce key={id} id={id} icon={icon} label={T[lang][chiave]}/>
              ))}
            </>
          )}
        </div>

        {/* In fondo, dopo una riga: non sono strutture come le altre, ma
            destinazioni allo stesso modo — stesso `onChange`, stessa pagina
            a corpo intero. L'ingranaggio stava in alto a destra, accanto
            alla camera: due icone per due cose diverse, di cui una si usa
            una volta all'anno. Qui sta con le altre cose che non sono
            strutture. */}
        <div className="shrink-0 px-3 py-2 flex flex-col gap-0.5" style={{ borderTop:`1px solid ${div}` }}>
          {utilityPagesFor(section).map(({ id, chiave }) => {
            const Icona = id === "guasto" ? Wrench : id === "impostazioni" ? Settings : MessageSquare;
            const attiva = facility === id;
            return (
              <button key={id} onClick={()=>{ onChange(id); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-left"
                style={attiva ? { background:RED, color:RED_FG } : { color:sub }}>
                <Icona size={18} className="shrink-0"/>{T[lang][chiave]}
              </button>
            );
          })}
          <p className="text-center text-[10px] font-mono pt-1" style={{ color:sub }}>v. {APP_VERSION}</p>
        </div>
      </nav>
    </>
  );
}
