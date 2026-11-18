// Use-case: tick dei promemoria del cambio biancheria, invocato dal cron
// (agganciato allo stesso tick dei promemoria lavanderia — vedi api/cron.js
// e sendDueReminders.js nel modulo Notifications).
//
// Nessuna logica di scheduling qui dentro: "quali camere avvisare adesso"
// lo decide linen_change_claim_due_notifications() in SQL (solo di
// martedì, solo se il cambio c'è, una volta sola a settimana per camera —
// "nessuno" qui resta solo per difesa, la SQL non lo restituisce più dalla
// v1.9). Questo use-case compone
// il messaggio e lo spedisce, nient'altro — stesso principio di
// sendDueReminders.js.

const TESTO = {
  grande: "Oggi c'è cambio GRANDE",
  piccolo: "Oggi c'è cambio PICCOLO",
  nessuno: "Questa settimana non c'è cambio biancheria",
};

export async function sendDueLinenChangeNotifications(_input, { linenChangeRepository, notifyRoom }) {
  const esito = await linenChangeRepository.claimDueNotifications();
  const righe = Array.isArray(esito?.righe) ? esito.righe : [];

  if (righe.length === 0) {
    return { ok: true, inviati: 0 };
  }

  // Ogni riga e' { room, tipo }: il tipo del martedi' dipende dalla sezione
  // (dalla risorsa "cambio biancheria" che la camera usa), non e' uguale per tutti.
  await Promise.all(
    righe.map(({ room, tipo }) => notifyRoom(room, "Cambio biancheria", TESTO[tipo] ?? TESTO.nessuno, "cambio-biancheria")),
  );

  return { ok: true, inviati: righe.length };
}
