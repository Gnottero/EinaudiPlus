import * as api from "../api";

// ─── Tema stagionale ─────────────────────────────────────────────────────────
//
// Livello puramente decorativo sopra il resto dell'app, acceso/spento dal
// sistemista (AdminPanel → Tema): neve a Natale, pipistrelli a Halloween.
// `pointer-events-none` su tutto il layer, cosi' non intercetta mai un
// tocco, qualunque sia il suo z-index rispetto al resto — non deve MAI
// impedire di prenotare un turno solo perche' e' Natale.
//
// Elementi generati con una posizione/ritardo derivati dall'indice (non
// Math.random): stabili fra un render e l'altro, non "saltano" ogni volta
// che qualcos'altro nell'app fa ridisegnare il componente.
const FIOCCHI_NEVE = Array.from({ length: 34 }, (_, i) => i);
const PIPISTRELLI = Array.from({ length: 8 }, (_, i) => i);
const ZUCCHE = Array.from({ length: 6 }, (_, i) => i);

export function TemaEffetto({ tema }: { tema: api.TemaStagionale }) {
  if (tema === "natale") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 30 }} aria-hidden="true">
        {FIOCCHI_NEVE.map((i) => {
          // Tre "strati" di profondita': un fiocco vicino e' piu' grande, piu'
          // veloce e piu' opaco di uno lontano — senza, la nevicata sembrava
          // tutta sullo stesso piano invece di avere uno spessore vero.
          const strato = i % 3;
          return (
            <span key={i} className="tema-fiocco" style={{
              left: `${(i * 37) % 100}%`,
              fontSize: 9 + strato * 8,
              animationDuration: `${11.5 - strato * 2.8 + (i % 5) * 0.5}s`,
              animationDelay: `${-(i % 13) * 1.1}s`,
              ["--op" as any]: 0.4 + strato * 0.22,
            }}>❄</span>
          );
        })}
      </div>
    );
  }

  if (tema === "halloween") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 30 }} aria-hidden="true">
        <div className="tema-halloween-tinta" />
        {/* Ferme in basso, non attraversano lo schermo come i pipistrelli:
            sono zucche appoggiate, non cose che volano. */}
        {ZUCCHE.map((i) => (
          <span key={i} className="tema-zucca" style={{
            left: `${6 + (i * 83) % 88}%`,
            bottom: `${2 + (i % 3) * 5}%`,
            fontSize: 20 + (i % 3) * 7,
            animationDuration: `${3 + (i % 4) * 0.6}s`,
            animationDelay: `${-(i % 5) * 0.8}s`,
          }}>🎃</span>
        ))}
        {PIPISTRELLI.map((i) => (
          <span key={i} className="tema-pipistrello" style={{
            top: `${(i * 17) % 65}%`,
            animationDuration: `${7 + (i % 5) * 1.3}s`,
            animationDelay: `${-(i % 8) * 1.6}s`,
          }}>🦇</span>
        ))}
      </div>
    );
  }

  return null;
}
