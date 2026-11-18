// Cancellazione totale — usata per il reset annuale. Distruttivo per
// design (come nell'originale): l'autorizzazione (solo sistemista) è
// compito di domain/policy.js, non di questo file.
import { sectionCodeOf } from "../../../shared/validation/room.js";

/**
 * Azzera le dichiarazioni bici. `sectionCode` = solo le camere di quella
 * sezione (il reset annuale di un admin di sezione); assente = tutte (solo
 * superadmin). bike_purge() in SQL non conosce le sezioni: per una sezione si
 * elencano le camere e si tolgono una a una, senza avvisare nessuno — e'
 * un reset collettivo, non una rimozione fatta dalla reception.
 */
export async function adminPurgeBikes({ sectionCode = null } = {}, { bikeRepository }) {
  if (!sectionCode) return bikeRepository.purge();
  const elenco = await bikeRepository.adminList();
  const camere = (elenco?.camere ?? []).map((c) => c.room).filter((r) => sectionCodeOf(r) === sectionCode);
  for (const room of camere) await bikeRepository.deleteRoom(room);
  return { ok: true, cancellate: camere.length };
}
