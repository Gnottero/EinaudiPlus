import { X, Info } from "lucide-react";
import type { RoomKind } from "../../roomsApi";
import type { Lang } from "../../i18n";
import { T } from "./testi";

const RED = "var(--primary)";
const fg = "var(--foreground)", sub = "var(--muted-foreground)";
const surf = "var(--card)", div = "var(--border)", chip = "var(--secondary)";

// ─── Testi regolamenti ──────────────────────────────────────────────────────
//
// Queste non sono stringhe d'interfaccia: sono le REGOLE DELLA CASA. La
// versione che vale resta quella italiana; le altre sono traduzioni di
// cortesia, per chi l'italiano non lo legge bene. Se la direzione cambia una
// regola, si cambia l'italiano e poi le traduzioni — mai il contrario.
export type Regolamento = { rules: string[]; tips?: string[] };

const RULES: Record<RoomKind, Partial<Record<Lang, Regolamento>>> = {
  cinema: {
    it: {
      rules: [
        "La sala può essere prenotata in ogni momento.",
        "La sala è dotata di un proiettore (cavo HDMI già presente) e un impianto audio (collegabile via Bluetooth). Ricordatevi di portare il vostro PC.",
        "Chi prenota è responsabile di eventuali danni e della pulizia della sala.",
        "Per prenotare indicate l'orario in cui pensate di usarla, il vostro nome e se si tratta di uso personale o di una proiezione aperta a tutti (es. partite).",
        "Le prenotazioni si resettano ogni lunedì notte.",
      ],
      tips: [
        "Per connettere il PC al proiettore: accendete il proiettore con il telecomando, selezionate \"Source\" e scegliete HDMI 2 (dovrebbe connettersi automaticamente).",
        "Per connettere il PC all'impianto audio: attivate il bluetooth sul PC, accendete la soundbar, cliccate sul tasto del telecomando con il simbolo del Bluetooth (*). Sullo schermo della soundbar comparirà \"BT PAIRING\", a quel punto cercate la soundbar tra i dispositivi sul PC.",
      ],
    },
    en: {
      rules: [
        "You can reserve it when you want.",
        "In the TV room there is a projector (HDMI cable provided) and an audio system (Bluetooth connection). Remember to bring your PC.",
        "Whoever reserves the room is responsible for any damages and the cleaning of the room.",
        "To reserve, state the time, your name, and if it's for personal use or an open projection.",
        "The schedule resets every Monday night.",
      ],
      tips: [
        "To connect the PC to the projector: turn the projector on with the remote, select \"Source\" and choose HDMI 2 (it should connect automatically).",
        "To connect the PC to the audio system: enable Bluetooth on the PC, turn on the soundbar, press the remote button with the Bluetooth symbol (*). The soundbar shows \"BT PAIRING\", then look for the soundbar among the PC's devices.",
      ],
    },
    fr: {
      rules: [
        "La salle peut être réservée à tout moment.",
        "La salle dispose d'un vidéoprojecteur (câble HDMI déjà sur place) et d'une sono (connexion Bluetooth). Pensez à apporter votre ordinateur.",
        "La personne qui réserve est responsable des éventuels dégâts et du nettoyage de la salle.",
        "Pour réserver, indiquez l'horaire prévu, votre nom et s'il s'agit d'un usage personnel ou d'une projection ouverte à tous (ex. matchs).",
        "Les réservations sont remises à zéro chaque lundi dans la nuit.",
      ],
      tips: [
        "Pour connecter l'ordinateur au vidéoprojecteur : allumez-le avec la télécommande, appuyez sur « Source » et choisissez HDMI 2 (la connexion devrait se faire toute seule).",
        "Pour connecter l'ordinateur à la sono : activez le Bluetooth sur l'ordinateur, allumez la barre de son, appuyez sur la touche de la télécommande portant le symbole Bluetooth (*). L'écran affiche « BT PAIRING » : cherchez alors la barre de son parmi les appareils de l'ordinateur.",
      ],
    },
    de: {
      rules: [
        "Der Raum kann jederzeit gebucht werden.",
        "Der Raum ist mit einem Beamer (HDMI-Kabel liegt bereit) und einer Audioanlage (per Bluetooth) ausgestattet. Denkt daran, euren Laptop mitzubringen.",
        "Wer bucht, haftet für eventuelle Schäden und für die Sauberkeit des Raums.",
        "Gebt bei der Buchung die geplante Uhrzeit an, euren Namen und ob es sich um private Nutzung oder um eine für alle offene Vorführung handelt (z. B. Spiele).",
        "Die Buchungen werden jeden Montag in der Nacht zurückgesetzt.",
      ],
      tips: [
        "Laptop an den Beamer anschließen: Beamer mit der Fernbedienung einschalten, „Source“ wählen und HDMI 2 auswählen (die Verbindung sollte automatisch zustande kommen).",
        "Laptop an die Audioanlage anschließen: Bluetooth am Laptop einschalten, die Soundbar einschalten, auf der Fernbedienung die Taste mit dem Bluetooth-Symbol (*) drücken. Im Display erscheint „BT PAIRING“; sucht dann die Soundbar unter den Geräten des Laptops.",
      ],
    },
    es: {
      rules: [
        "La sala se puede reservar en cualquier momento.",
        "La sala cuenta con un proyector (cable HDMI ya disponible) y un equipo de audio (conexión por Bluetooth). Acordaos de traer vuestro ordenador.",
        "Quien reserva es responsable de los posibles daños y de la limpieza de la sala.",
        "Para reservar indicad la hora prevista, vuestro nombre y si es para uso personal o para una proyección abierta a todos (p. ej. partidos).",
        "Las reservas se reinician cada lunes por la noche.",
      ],
      tips: [
        "Para conectar el ordenador al proyector: encended el proyector con el mando, pulsad «Source» y elegid HDMI 2 (debería conectarse automáticamente).",
        "Para conectar el ordenador al equipo de audio: activad el Bluetooth en el ordenador, encended la barra de sonido y pulsad en el mando la tecla con el símbolo de Bluetooth (*). En la pantalla aparecerá «BT PAIRING»; buscad entonces la barra entre los dispositivos del ordenador.",
      ],
    },
  },
  music: {
    it: {
      rules: [
        "Potete prenotarla quando volete.",
        "Si può utilizzare a qualsiasi ora (ATTENZIONE: l'uso di strumenti NON in cuffia è consentito SOLO dalle 16:00 alle 20:00).",
        "Chi prenota è responsabile di eventuali danni e della pulizia della sala.",
        "Le prenotazioni si resettano ogni lunedì notte.",
      ],
    },
    en: {
      rules: [
        "You can reserve it whenever you want.",
        "It can be used at any hour (NOTE: using instruments NOT with headphones is allowed ONLY from 16:00 to 20:00).",
        "Whoever reserves the room is responsible for any damages and the cleaning of the room.",
        "The schedule resets every Monday night.",
      ],
    },
    fr: {
      rules: [
        "Vous pouvez la réserver quand vous voulez.",
        "Elle est utilisable à toute heure (ATTENTION : les instruments SANS casque ne sont autorisés QUE de 16h00 à 20h00).",
        "La personne qui réserve est responsable des éventuels dégâts et du nettoyage de la salle.",
        "Les réservations sont remises à zéro chaque lundi dans la nuit.",
      ],
    },
    de: {
      rules: [
        "Ihr könnt ihn buchen, wann ihr wollt.",
        "Zu jeder Uhrzeit nutzbar (ACHTUNG: Instrumente OHNE Kopfhörer sind NUR von 16:00 bis 20:00 Uhr erlaubt).",
        "Wer bucht, haftet für eventuelle Schäden und für die Sauberkeit des Raums.",
        "Die Buchungen werden jeden Montag in der Nacht zurückgesetzt.",
      ],
    },
    es: {
      rules: [
        "Podéis reservarla cuando queráis.",
        "Se puede usar a cualquier hora (ATENCIÓN: el uso de instrumentos SIN auriculares está permitido SOLO de 16:00 a 20:00).",
        "Quien reserva es responsable de los posibles daños y de la limpieza de la sala.",
        "Las reservas se reinician cada lunes por la noche.",
      ],
    },
  },
};

// ─── Rules modal ──────────────────────────────────────────────────────────────
/** Il regolamento nella lingua richiesta, o in italiano se non c'è. */
const regolamentoPer = (room: RoomKind, lang: Lang): Regolamento =>
  RULES[room][lang] ?? RULES[room].it!;

export function RulesModal({ room, lang, onClose }: { room: RoomKind; lang: Lang; onClose: () => void }) {
  const t = T[lang];
  const r = regolamentoPer(room, lang);
  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl pb-8 max-h-[85%] overflow-y-auto" style={{ background: "var(--background)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 sticky top-0" style={{ background: "var(--background)" }}>
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "color-mix(in srgb, var(--foreground) 15%, transparent)" }} />
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold" style={{ color: fg }}>{room === "cinema" ? t.cinema : t.music} · {t.rulesTitle}</p>
            <button onClick={onClose} className="p-2 rounded-xl" style={{ color: sub, background: chip }}><X size={16} /></button>
          </div>
        </div>
        <div className="px-6">
          <ol className="flex flex-col gap-2.5">
            {r.rules.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 size-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono"
                  style={{ background: `color-mix(in srgb, var(--primary) 15%, transparent)`, color: RED }}>{i + 1}</span>
                <p className="text-sm leading-relaxed" style={{ color: fg }}>{line}</p>
              </li>
            ))}
          </ol>
          {r.tips && (
            <>
              <p className="text-[11px] font-mono tracking-widest uppercase mt-6 mb-2" style={{ color: sub }}>{t.tipsTitle}</p>
              <div className="flex flex-col gap-2.5">
                {r.tips.map((line, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl p-3 border" style={{ background: surf, borderColor: div }}>
                    <Info size={15} className="shrink-0 mt-0.5" style={{ color: RED }} />
                    <p className="text-xs leading-relaxed" style={{ color: sub }}>{line}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
