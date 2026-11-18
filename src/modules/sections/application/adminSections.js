// Use-case amministrativi: sezioni e lavanderie. L'autorizzazione (chi puo'
// farlo, e dentro quale ambito) sta a monte; qui si validano i dati.

import { ValidationError } from "../../../shared/errors/AppError.js";
import { parseIntInRange } from "../../../shared/validation/number.js";
import { isFeature, isShareable } from "../domain/features.js";

const CODE = /^[A-Za-z]{1,2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/;

function parseName(v, what) {
  const s = String(v ?? "").trim();
  if (s.length < 1 || s.length > 60) throw new ValidationError(`${what}: da 1 a 60 caratteri`);
  return s;
}

/** Solo chiavi note, solo booleani: una chiave sbagliata e' un errore, non si ignora. */
export function parseFeatures(v) {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new ValidationError("funzionalita' non valide");
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isFeature(k)) throw new ValidationError(`funzionalita' sconosciuta: ${k}`);
    if (typeof val !== "boolean") throw new ValidationError(`funzionalita' ${k}: vero o falso`);
    out[k] = val;
  }
  return out;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
export function parseColor(v) {
  const s = String(v ?? "").trim();
  if (!COLOR.test(s)) throw new ValidationError("colore non valido (es. #22c55e)");
  return s.toLowerCase();
}

/**
 * Condivisioni: { risorsa: id sezione proprietaria | null }. null (o l'id
 * della sezione stessa) = risorsa propria. Le regole di fondo (niente catene,
 * sezione attiva) le applica la SQL: qui solo forma e chiavi.
 */
export function parseSharing(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new ValidationError("condivisioni non valide");
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (!isShareable(k)) throw new ValidationError(`risorsa non condivisibile: ${k}`);
    if (val === null || val === undefined || val === "") continue;
    const id = parseIntInRange(val, 1, 32767);
    if (id === null) throw new ValidationError(`condivisione ${k}: sezione non valida`);
    out[k] = id;
  }
  return out;
}

export function parseRanges(v) {
  if (!Array.isArray(v)) throw new ValidationError("intervalli non validi");
  if (v.length > 30) throw new ValidationError("troppi intervalli (massimo 30)");
  const out = v.map((r) => {
    const label = String(r?.label ?? "").trim();
    if (label.length < 1 || label.length > 40) throw new ValidationError("intervallo: nome da 1 a 40 caratteri");
    const from = parseIntInRange(r?.from, 1, 9999);
    const to = parseIntInRange(r?.to, 1, 9999);
    if (from === null || to === null) throw new ValidationError(`intervallo "${label}": numeri da 1 a 9999`);
    if (to < from) throw new ValidationError(`intervallo "${label}": la fine precede l'inizio`);
    const laundryRaw = r?.laundryId ?? r?.laundry_id ?? null;
    const laundryId = laundryRaw === null || laundryRaw === "" ? null : parseIntInRange(laundryRaw, 1, 32767);
    if (laundryRaw !== null && laundryRaw !== "" && laundryId === null) throw new ValidationError(`intervallo "${label}": lavanderia non valida`);
    const color = r?.color === undefined || r?.color === null || r?.color === "" ? null : parseColor(r.color);
    return { label, from, to, laundry_id: laundryId, color };
  });
  const sorted = [...out].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from <= sorted[i - 1].to) throw new ValidationError("intervalli sovrapposti");
  }
  return out;
}

export async function adminCreateSection({ code, number, name, features, ranges }, { sectionsRepository, invalidate }) {
  const c = String(code ?? "").trim();
  if (!CODE.test(c)) throw new ValidationError("la lettera della sezione: una o due lettere");
  const n = parseIntInRange(number, 1, 99);
  if (n === null) throw new ValidationError("numero di sezione: da 1 a 99");
  const res = await sectionsRepository.createSection({
    code: c.toUpperCase(), number: n, name: parseName(name, "nome"),
    features: parseFeatures(features), ranges: parseRanges(ranges ?? []),
  });
  invalidate();
  return res;
}

export async function adminSetSharing({ id, shared }, { sectionsRepository, invalidate }) {
  const sid = parseIntInRange(id, 1, 32767);
  if (sid === null) throw new ValidationError('campo "id" non valido');
  const res = await sectionsRepository.setSharing({ id: sid, shared: parseSharing(shared) });
  invalidate();
  return res;
}

export async function adminSetRangeStyle({ rangeId, label, color }, { sectionsRepository, invalidate }) {
  const rid = parseIntInRange(rangeId, 1, 2147483647);
  if (rid === null) throw new ValidationError('campo "range_id" non valido');
  const l = label === undefined || label === null ? null : String(label).trim();
  if (l !== null && (l.length < 1 || l.length > 40)) throw new ValidationError("nome: da 1 a 40 caratteri");
  const c = color === undefined || color === null ? null : color === "" ? "" : parseColor(color);
  const res = await sectionsRepository.setRangeStyle({ rangeId: rid, label: l, color: c });
  invalidate();
  return res;
}

export async function adminUpdateSection({ id, name, features, active }, { sectionsRepository, invalidate }) {
  const sid = parseIntInRange(id, 1, 32767);
  if (sid === null) throw new ValidationError('campo "id" non valido');
  const res = await sectionsRepository.updateSection({
    id: sid,
    name: name === undefined || name === null ? null : parseName(name, "nome"),
    features: features === undefined || features === null ? null : parseFeatures(features),
    active: active === undefined || active === null ? null : Boolean(active),
  });
  invalidate();
  return res;
}

export async function adminSetRanges({ id, ranges }, { sectionsRepository, invalidate }) {
  const sid = parseIntInRange(id, 1, 32767);
  if (sid === null) throw new ValidationError('campo "id" non valido');
  const res = await sectionsRepository.setRanges({ id: sid, ranges: parseRanges(ranges) });
  invalidate();
  return res;
}

function parsePairs(v) {
  const p = parseIntInRange(v, 1, 3);
  if (p === null) throw new ValidationError("coppie lavatrice/asciugatrice: da 1 a 3");
  return p;
}

export async function adminCreateLaundry({ slug, name, pairs }, { sectionsRepository, invalidate }) {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!SLUG.test(s)) throw new ValidationError("identificativo: lettere minuscole, numeri e trattini (2-31)");
  const res = await sectionsRepository.createLaundry({ slug: s, name: parseName(name, "nome"), pairs: parsePairs(pairs) });
  invalidate();
  return res;
}

export async function adminUpdateLaundry({ id, name, pairs }, { sectionsRepository, invalidate }) {
  const lid = parseIntInRange(id, 1, 32767);
  if (lid === null) throw new ValidationError('campo "id" non valido');
  const res = await sectionsRepository.updateLaundry({
    id: lid,
    name: name === undefined || name === null ? null : parseName(name, "nome"),
    pairs: pairs === undefined || pairs === null ? null : parsePairs(pairs),
  });
  invalidate();
  return res;
}
