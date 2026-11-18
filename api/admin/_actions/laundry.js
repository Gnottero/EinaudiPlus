// Azioni admin del dominio: laundry. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminWeek, adminSetMachineStatus, adminDeleteBooking, adminForceBook, adminBookAsDirezione, adminClearAsDirezione } from "../../../src/modules/laundry/index.js";
import { sampleRoomForLaundry } from "../../../src/modules/sections/index.js";

export const actions = {
  week: ({ body }) => adminWeek({ laundryId: body.laundry_id, offset: body.offset }),
  setMachineStatus: ({ body }) =>
    // Il fuori servizio rende lo stato visibile a tutti, ma NON blocca le
    // prenotazioni: chi prenota vede un avviso e decide.
    adminSetMachineStatus({ room: body.room, machine: body.machine, oos: body.oos }),
  deleteBooking: ({ body, plan }) => adminDeleteBooking({ id: body.id, sectionIds: plan.scopeIds }),
  forceBook: ({ body }) =>
    adminForceBook({
      laundryId: body.laundry_id, day: body.day, slot: body.slot,
      machine: body.machine, room: body.room,
    }),
  bookDirezione: ({ body }) => adminBookAsDirezione({ laundryId: body.laundry_id, day: body.day, slot: body.slot, machine: body.machine }),
  // Liberare un turno, compresi quelli della DIREZIONE che dal percorso
  // pubblico sono protetti. `p_as_admin: true` si può scrivere qui e solo
  // qui: currentAdmin() ha già verificato il cookie in cima all'handler.
  //
  // Se chi agisce e' la Direzione (room = "DIREZIONE") la SQL non saprebbe
  // di quale lavanderia si parla (ricadrebbe sul Valentino): il client manda
  // `laundry_id`, e qui si passa una camera qualsiasi di quella lavanderia.
  async clearDirezione({ body, A, plan, config }) {
    const room = String(body.room ?? "") === "DIREZIONE"
      ? sampleRoomForLaundry(config, plan.laundryId, A)
      : body.room;
    return await adminClearAsDirezione({ room, day: body.day, slot: body.slot, machine: body.machine });
  },
};
