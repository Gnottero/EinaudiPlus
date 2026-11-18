// Azioni admin del dominio: identity. Ogni azione riceve il contesto già autorizzato
// e risolto da api/admin/data.js ({ body, me, A, R, plan, config }) e torna il risultato.

import { ActionRefused } from "./refused.js";
import { listAccounts, createAccount, resetAccountPassword, setAccountActive, setAccountCamera, setAccountSection, deleteAccount, changeOwnPassword } from "../../../src/modules/identity/index.js";

export const actions = {
  accountList: () => listAccounts(),
  async accountCreate({ body, me, A }) {
    const password = String(body.password || "");
    if (password.length < 8) throw new ActionRefused("la password deve avere almeno 8 caratteri");
    const ruoloNuovo = String(body.ruolo || "");
    // Un admin crea sempre nella propria sezione; il superadmin sceglie
    // (section_id) — tranne per un altro superadmin, che non ne ha.
    const sezione = ruoloNuovo === "superadmin" ? null : (A ?? body.section_id ?? null);
    return await createAccount(String(body.username || "").trim(), password, ruoloNuovo, me.u, sezione);
  },
  async accountSetPassword({ body }) {
    const password = String(body.password || "");
    if (password.length < 8) throw new ActionRefused("la password deve avere almeno 8 caratteri");
    return await resetAccountPassword(Number(body.id), password);
  },
  accountSetActive: ({ body }) => setAccountActive(Number(body.id), body.attivo !== false),
  accountSetCamera: ({ body }) => setAccountCamera(Number(body.id), body.camera),
  accountSetSection: ({ body }) => setAccountSection(Number(body.id), body.section_id),
  accountDelete: ({ body }) => deleteAccount(Number(body.id)),
  // Il titolare cambia la propria password: nessun ruolo richiesto oltre
  // all'essere autenticato.
  async accountChangeOwnPassword({ body, me }) {
    const attuale = String(body.password_attuale || "");
    const nuova = String(body.password_nuova || "");
    return await changeOwnPassword(me.u, attuale, nuova);
  },
};
