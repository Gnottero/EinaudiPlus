// Use-case: il delegato (o il sistemista) fa partire una nuova grigliata.
//
// Un'unica azione: la funzione SQL chiude da sola qualunque grigliata ancora
// attiva prima di crearne una nuova (vedi grigliata_admin_crea) — la scheda
// residenti non deve mai scegliere fra due grigliate, quindi qui non serve
// nemmeno decidere "e se ce n'è già una aperta?", ci pensa il database in
// una sola transazione.
//
// v1.3: con l'elenco dei menu fra cui i residenti sceglieranno — li decide
// il delegato, il primo è quello "di base". v1.4: i pagamenti si possono
// lasciare spenti (grigliata offerta, contanti sul posto) — solo allora i
// link non sono obbligatori. Assente = attivi, il comportamento di sempre.

import { requireSectionId } from "../../../shared/validation/section.js";
import { ValidationError, fromRpcError } from "../../../shared/errors/AppError.js";
import { isValidDate, controllaMenu, controllaQuota, TIPI_EVENTO as TIPI, MENU_TOMBOLATA } from "../domain/validazione.js";

export async function adminCreaEvento(
  { titolo, scadenza, giornoEvento, paypalLink, satispayLink, menu, pagamentiAttivi, quota, attore, sectionId, tipo },
  { grigliataRepository },
) {
  const tipoEvento = tipo === undefined || tipo === null || tipo === "" ? "grigliata" : tipo;
  if (!TIPI.includes(tipoEvento)) throw new ValidationError("tipo di evento non valido");

  // Può essere anche già passata: iscrizioni chiuse alla partenza, scheda
  // comunque visibile fino al giorno dopo la grigliata.
  if (!isValidDate(scadenza)) {
    throw new ValidationError("indica la scadenza delle iscrizioni");
  }

  if (!isValidDate(giornoEvento)) {
    throw new ValidationError("indica il giorno della grigliata");
  }

  const paypal = String(paypalLink || "").trim();
  const satispay = String(satispayLink || "").trim();
  const pagamenti = pagamentiAttivi !== false;
  if (pagamenti && !paypal && !satispay) {
    throw new ValidationError("inserisci almeno un link per il pagamento (PayPal o Satispay)");
  }

  // shortcut: la tombolata non ha menu né ticket, ma il flusso SQL li pretende: ne ha uno
  // interno che l'app non mostra. Da rimuovere se un tipo avra' un menu proprio.
  const esito = controllaMenu(tipoEvento === "tombolata" ? MENU_TOMBOLATA : menu);
  if (esito.errore) throw new ValidationError(esito.errore);

  // v1.4.1: facoltativa — vuota = nessuna quota indicata.
  const esitoQuota = controllaQuota(quota);
  if (esitoQuota.errore) throw new ValidationError(esitoQuota.errore);

  try {
    return await grigliataRepository.adminCrea({
      titolo: String(titolo || "").trim() || (tipoEvento === "tombolata" ? "Tombolata" : "Grigliata"),
      scadenza: new Date(scadenza).toISOString(),
      // Un `date` puro (da <input type="date">, "AAAA-MM-GG"): nessuna
      // conversione, a differenza della scadenza non porta un orario.
      giornoEvento: String(giornoEvento).trim(),
      paypal: paypal || null,
      satispay: satispay || null,
      // Un evento nuovo non ha menu (né voci-ticket) esistenti: gli id, se
      // arrivassero, non significano niente — si tengono solo i nomi.
      menu: esito.menu.map(({ nome, ticket }) => ({ nome, ticket: ticket.map(({ nome, emoji }) => ({ nome, emoji })) })),
      pagamentiAttivi: pagamenti,
      quota: esitoQuota.quota,
      attore, sectionId: requireSectionId(sectionId), tipo: tipoEvento,
    });
  } catch (err) {
    // Vedi la stessa nota in linen-change/application/*.js: fromRpcError()
    // fa vedere al delegato/sistemista già autenticato il messaggio vero di
    // un fallimento della RPC, non il generico di wrapHandler.
    throw fromRpcError(err, { exposeToClient: true });
  }
}
