// Use-case: operazioni del sistemista sugli account (creazione, reset
// password, attivazione/disattivazione, cancellazione, elenco).
//
// Stessa validazione minima già presente nell'originale (password >= 8
// caratteri prima di toccare il database), ma come eccezione tipizzata
// invece di un `return fail(...)` che l'adapter doveva ricordarsi di gestire
// caso per caso.

import { ValidationError } from "../../../shared/errors/AppError.js";
import { parseIntInRange } from "../../../shared/validation/number.js";
import { parseRoomNumber } from "../../../shared/validation/room.js";
import { isValidRole } from "../domain/roles.js";

const MIN_LEN = 8;
const ID_MIN = 1, ID_MAX = Number.MAX_SAFE_INTEGER;

// L'id veniva validato solo dal dizionario LIMITI condiviso nell'adapter
// admin/data.js — un controllo esterno al modulo, di cui questo modulo non
// poteva sapere nulla. Ora lo possiede da sé, come già fa Laundry.
function requireId(id) {
  const parsed = parseIntInRange(id, ID_MIN, ID_MAX);
  if (parsed === null) throw new ValidationError('campo "id" non valido');
  return parsed;
}

/**
 * La sezione di un account: obbligatoria per ogni ruolo tranne `superadmin`,
 * che e' di piattaforma e non ne ha. Il ruolo lo valida anche la SQL; qui
 * l'errore e' chiaro e prima di un giro di rete.
 */
export function parseAccountSection(ruolo, sectionId) {
  if (!isValidRole(ruolo)) throw new ValidationError("ruolo non valido");
  if (ruolo === "superadmin") {
    if (sectionId != null) throw new ValidationError("il superadmin non appartiene a una sezione");
    return null;
  }
  const id = parseIntInRange(sectionId, 1, 32767);
  if (id === null) throw new ValidationError("indica la sezione");
  return id;
}

export async function createAccount({ username, password, ruolo, attore, sectionId }, { accountRepository, hasher }) {
  if (password.length < MIN_LEN) throw new ValidationError(`la password deve avere almeno ${MIN_LEN} caratteri`);
  const sezione = parseAccountSection(ruolo, sectionId);
  return accountRepository.create({
    username: username.trim(), passwordHash: hasher.hashPassword(password), ruolo, attore, sectionId: sezione,
  });
}

/** Sposta un account in un'altra sezione (solo superadmin: lo decide data.js). */
export async function setAccountSection({ id, sectionId }, { accountRepository }) {
  const sid = parseIntInRange(sectionId, 1, 32767);
  if (sid === null) throw new ValidationError("indica la sezione");
  return accountRepository.setSection({ id: requireId(id), sectionId: sid });
}

export async function resetAccountPassword({ id, password }, { accountRepository, hasher }) {
  const parsedId = requireId(id);
  if (password.length < MIN_LEN) throw new ValidationError(`la password deve avere almeno ${MIN_LEN} caratteri`);
  return accountRepository.setPassword({ id: parsedId, passwordHash: hasher.hashPassword(password) });
}

export async function setAccountActive({ id, attivo }, { accountRepository }) {
  return accountRepository.setActive({ id: requireId(id), attivo });
}

/** v1.10: la camera di un delegato/sistemista — vuota la toglie. Che il
 *  ruolo possa averne una lo decide la SQL (account_set_camera). */
export async function setAccountCamera({ id, camera }, { accountRepository }) {
  const parsedId = requireId(id);
  const testo = String(camera ?? "").trim();
  if (!testo) return accountRepository.setCamera({ id: parsedId, camera: null });
  const parsed = parseRoomNumber(testo);
  if (!parsed) throw new ValidationError("numero di camera non valido");
  return accountRepository.setCamera({ id: parsedId, camera: parsed });
}

export async function deleteAccount({ id }, { accountRepository }) {
  return accountRepository.delete({ id: requireId(id) });
}

export async function listAccounts(_input, { accountRepository }) {
  return accountRepository.list();
}
