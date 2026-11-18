// Il registro delle azioni admin: nome azione -> funzione che la esegue.
// Un file per dominio (specchio di src/modules/); data.js non sa quali azioni
// esistano, le cerca qui. Un'azione nuova va aggiunta nel file del suo dominio,
// nella policy del suo modulo (authorize) e, se modifica qualcosa, in MUTATIONS.

import { actions as laundry } from "./laundry.js";
import { actions as commonSpaces } from "./commonSpaces.js";
import { actions as feedback } from "./feedback.js";
import { actions as conferenceRoom } from "./conferenceRoom.js";
import { actions as identity } from "./identity.js";
import { actions as ops } from "./ops.js";
import { actions as notifications } from "./notifications.js";
import { actions as theme } from "./theme.js";
import { actions as linenChange } from "./linenChange.js";
import { actions as grigliata } from "./grigliata.js";
import { actions as bikes } from "./bikes.js";
import { actions as sections } from "./sections.js";

export { ActionRefused } from "./refused.js";

export const ACTIONS = Object.freeze({
  ...laundry,
  ...commonSpaces,
  ...feedback,
  ...conferenceRoom,
  ...identity,
  ...ops,
  ...notifications,
  ...theme,
  ...linenChange,
  ...grigliata,
  ...bikes,
  ...sections,
});

// Le azioni che modificano qualcosa finiscono nell'audit log. Le letture no,
// sarebbero solo rumore.
export const MUTATIONS = new Set([
  "setMachineStatus", "deleteBooking", "forceBook",
  "markFeedback", "deleteSpaceBooking", "spaceSetChiuso",
  "recurringAddLaundry", "recurringAddSpace", "recurringSetActive",
  "recurringDelete", "applyRecurring", "purge",
  "deletePushSub", "deleteTelegramSub", "broadcastPush",
  "bookDirezione", "bookSpaceDirezione", "clearDirezione",
  "conferenzaAdd", "conferenzaUpdate", "conferenzaDelete",
  "conferenzaSkip", "conferenzaMove", "conferenzaResetOccorrenza",
  "accountCreate", "accountSetPassword", "accountSetActive", "accountDelete", "accountSetCamera", "accountSetSection",
  "sectionCreate", "sectionUpdate", "sectionSetRanges", "sectionSetSharing", "sectionSetRangeStyle", "laundryCreate", "laundryUpdate",
  "accountChangeOwnPassword", "biciPurge", "biciDeleteRoom", "biciAddRoom", "temaSet",
  "cambioBiancheriaSet", "cambioBiancheriaSkip",
  "grigliataCrea", "grigliataConfermaPagamento", "grigliataAnnullaConfermaPagamento", "grigliataChiudi", "grigliataModifica",
  "grigliataAggiungiAdesione", "grigliataRimuoviAdesione", "grigliataRiapri", "grigliataElimina",
  "grigliataPagamenti", "grigliataQuota", "grigliataRipristinaTicket",
]);
