// Azioni admin del dominio: notifications. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { adminListPushSubs, adminDeletePushSub, adminListTelegramSubs, adminDeleteTelegramSub, adminBroadcast } from "../../../src/modules/notifications/index.js";

export const actions = {
  pushSubs: ({ A }) => adminListPushSubs(A),
  deletePushSub: ({ body }) => adminDeletePushSub(body.id),
  telegramSubs: ({ A }) => adminListTelegramSubs(A),
  deleteTelegramSub: ({ body }) => adminDeleteTelegramSub(body.id),
  broadcastPush: ({ body, me, A }) => adminBroadcast({ actor: me.u, title: body.title, body: body.body, room: body.room, sectionId: A }),
};
