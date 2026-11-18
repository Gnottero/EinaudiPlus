import { useEffect, useState } from "react";
import { T, errMsg, type Lang } from "../../i18n";
import type { WeekData } from "../../modello";

/**
 * Invio conferma.
 *
 * Da telefono non serve a niente, da PC e' il gesto naturale: si arriva alla
 * schermata di conferma, si legge, si preme Invio. Non succedeva niente, e il
 * pulsante rosso li' davanti sembrava rotto.
 *
 * `attivo` esiste perche' vada SOLO dove c'e' una cosa sola da confermare:
 * dove i pulsanti sono due o piu' (scegli la lavatrice, modifica o elimina)
 * Invio dovrebbe indovinare quale, e indovinare non e' un'opzione.
 *
 * Non intercetta l'Invio dentro un campo di testo lungo, dove va a capo.
 */
export function useInvio(attivo: boolean, azione: () => void) {
  useEffect(() => {
    if (!attivo) return;
    const onTasto = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      const dove = e.target as HTMLElement | null;
      if (dove && (dove.tagName === "TEXTAREA" || dove.isContentEditable)) return;
      e.preventDefault();
      azione();
    };
    window.addEventListener("keydown", onTasto);
    return () => window.removeEventListener("keydown", onTasto);
  }, [attivo, azione]);
}

/**
 * Prenota / elimina uno slot e racconta l'esito con un toast che offre
 * "annulla". Condiviso da Giorno e Settimana, che prima ne avevano una copia
 * ciascuno. `confirmBooking` sostituisce l'eventuale prenotazione già presente
 * (la libera, poi prenota); l'annulla di una conferma libera lo slot, quello di
 * un'eliminazione rimette la camera di prima.
 */
export function useSlotActions({ lang, week, onBook, onClear }: {
  lang: Lang; week: WeekData;
  onBook: (day: number, slot: number, machine: string, room: string) => Promise<void>;
  onClear: (day: number, slot: number, machine: string) => Promise<void>;
}) {
  const t = T[lang];
  const [toast, setToast] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | null>(null);

  const fail = (e: unknown) => { setToast(errMsg(e, lang)); setToastUndo(null); };
  const undoWith = (fn: () => Promise<void>) => () => { fn().catch((e) => setToast(errMsg(e, lang))); };

  async function confirmBooking(day: number, slot: number, machine: string, room: string) {
    try {
      if (week[day]?.[slot]?.[machine]) await onClear(day, slot, machine);
      await onBook(day, slot, machine, room);
      setToast(t.slotConfirmed);
      setToastUndo(() => undoWith(() => onClear(day, slot, machine)));
    } catch (e) { fail(e); }
  }

  /** `room`: la camera da rimettere se l'utente annulla (assente = niente annulla). */
  async function deleteBooking(day: number, slot: number, machine: string, room: string | undefined) {
    try {
      await onClear(day, slot, machine);
      setToast(t.slotDeleted);
      setToastUndo(room ? () => undoWith(() => onBook(day, slot, machine, room)) : null);
    } catch (e) { fail(e); }
  }

  const closeToast = () => { setToast(null); setToastUndo(null); };
  return { toast, toastUndo, confirmBooking, deleteBooking, closeToast };
}
