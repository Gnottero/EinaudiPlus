// Use-case: la configurazione pubblica (sezioni, intervalli, lavanderie).
// Letta dal client all'avvio per sapere cosa e' valido e cosa e' acceso.
export async function getSectionConfig(_input, { sectionsRepository }) {
  const cfg = await sectionsRepository.config();
  return cfg?.ok ? cfg : { ok: true, sections: [], laundries: [] };
}
