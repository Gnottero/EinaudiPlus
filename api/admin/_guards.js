// Regole che dipendono dal CONTENUTO della richiesta, dopo che ruolo e ambito
// per sezione sono già stati decisi (vedi data.js): chi può toccare quale
// account, dove può stare la camera di un account, chi attiva una sezione, dove
// può arrivare un broadcast. Torna null se la richiesta può proseguire,
// altrimenti { status, error } da rispondere al client.

import { sectionCodeOf } from "../../src/shared/validation/room.js";
import { listAccounts } from "../../src/modules/identity/index.js";
import { sectionIdOfCode } from "../../src/modules/sections/index.js";

export async function checkAccountRules({ action, body, superadmin, A, config }) {
  // Un admin gestisce SOLO gli account fdo e delegato della propria sezione:
  // mai un altro admin, mai un superadmin (altrimenti reimposterebbe la
  // password di chi sta sopra e lo diventerebbe). Il superadmin gestisce tutti.
  const TOCCA_ACCOUNT = new Set(["accountSetPassword", "accountSetActive", "accountDelete", "accountSetCamera", "accountSetSection"]);
  const RUOLI_GESTIBILI_DA_ADMIN = new Set(["fdo", "delegato"]);
  if (action === "accountSetSection" && !superadmin) {
    return { status: 403, error: "permesso negato: solo un superadmin sposta un account di sezione" };
  }
  if (action === "accountCreate" && !superadmin) {
    if (!RUOLI_GESTIBILI_DA_ADMIN.has(String(body.ruolo || ""))) {
      return { status: 403, error: "permesso negato: un admin crea solo account fdo e delegato" };
    }
  }
  let targetAccount = null;
  if (TOCCA_ACCOUNT.has(action)) {
    const elenco = await listAccounts();
    targetAccount = (elenco?.items ?? []).find((a) => a.id === Number(body.id)) ?? null;
    if (!targetAccount) return { status: 400, error: "account non trovato" };
    if (!superadmin && (targetAccount.section_id !== A || !RUOLI_GESTIBILI_DA_ADMIN.has(targetAccount.ruolo))) {
      return { status: 403, error: "permesso negato: account fuori dalla tua sezione o di un ruolo superiore" };
    }
  }
  // La camera associata a un account deve stare nella sezione dell'account.
  if (action === "accountSetCamera" && String(body.camera ?? "").trim() !== "") {
    const sidCamera = sectionIdOfCode(config, sectionCodeOf(body.camera));
    if (sidCamera === null || sidCamera !== targetAccount.section_id) {
      return { status: 400, error: "la camera deve essere della sezione dell'account" };
    }
  }
  // Attivare o disattivare una sezione intera e' del superadmin.
  if (action === "sectionUpdate" && body.active !== undefined && !superadmin) {
    return { status: 403, error: "permesso negato: solo un superadmin attiva o disattiva una sezione" };
  }
  // Un broadcast "a una camera" non puo' uscire dalla sezione dell'admin.
  if (action === "broadcastPush" && A !== null && String(body.room ?? "").trim() !== "" &&
      sectionIdOfCode(config, sectionCodeOf(body.room)) !== A) {
    return { status: 403, error: "permesso negato: camera di un'altra sezione" };
  }
  return null;
}
