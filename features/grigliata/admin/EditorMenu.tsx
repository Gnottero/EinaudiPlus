import { useState } from "react";
import { Plus, X } from "lucide-react";
import { EMOJI_TICKET, EMOJI_TICKET_DEFAULT, suggerisciEmoji } from "../emojiTicket";
import { S } from "../../admin-shared/adminStyles";

export { Interruttore } from "../../admin-shared/Interruttore";

// ─── Editor dell'elenco dei menu ──────────────────────────────────────────────
//
// Lo stesso per "fai partire" e "modifica". Una voce porta l'id solo se il
// menu esiste già: è così che la SQL distingue "rinominato" (le scelte già
// fatte restano) da "tolto e aggiunto". `chiave` serve solo a React per
// tenere il fuoco nel campo giusto mentre si aggiungono/tolgono righe.
//
// Fuori da GrigliataAdmin di proposito: un componente dichiarato DENTRO un
// altro viene ricreato a ogni render, e un <input> ricreato perde il fuoco
// a ogni lettera digitata.

// `emojiScelta`: il delegato l'ha scelta lui (o arriva dal server) — da lì
// in poi rinominare il ticket non la cambia più. Finché è false, segue il
// nome ("Salsiccia" → 🌭, vedi suggerisciEmoji).
type VoceTicketEditor = { chiave: number; id?: number; nome: string; emoji: string | null; emojiScelta: boolean };
export type VoceEditor = { chiave: number; id?: number; nome: string; ticket: VoceTicketEditor[] };

export const MENU_MAX = 10;
export const TICKET_MAX = 10;
const MENU_DI_DEFAULT = ["Carne", "Pesce"];
let prossimaChiave = 1;

export const voceTicketNuova = (nome: string, id?: number, emoji?: string | null): VoceTicketEditor =>
  id
    ? { chiave: prossimaChiave++, id, nome, emoji: emoji ?? null, emojiScelta: true }
    : { chiave: prossimaChiave++, nome, emoji: suggerisciEmoji(nome), emojiScelta: false };
// Senza un elenco esplicito di ticket, una voce nuova parte con UN ticket
// già pronto (stesso nome del menu): un menu richiede sempre almeno un
// ticket, niente form che parte già in uno stato non valido.
export const voceNuova = (nome: string, id?: number, ticket?: VoceTicketEditor[]): VoceEditor =>
  ({ chiave: prossimaChiave++, id, nome, ticket: ticket ?? [voceTicketNuova(nome)] });
export const vociDiDefault = () => MENU_DI_DEFAULT.map((nome) => voceNuova(nome));
/** Il formato che si aspettano grigliataCrea/grigliataModifica. */
export const vociDaInviare = (voci: VoceEditor[]) =>
  voci.map((v) => ({
    ...(v.id ? { id: v.id } : {}),
    nome: v.nome,
    ticket: v.ticket.map((t) => ({ ...(t.id ? { id: t.id } : {}), nome: t.nome, emoji: t.emoji ?? "" })),
  }));

export function EditorMenu({ voci, onChange, scelte, ticketScelte }: {
  voci: VoceEditor[];
  onChange: (voci: VoceEditor[]) => void;
  /** Quante camere hanno già scelto ciascun menu (per id), solo in modifica. */
  scelte?: Record<number, number>;
  /** Quante volte ciascuna voce (per id) è già stata ritirata, solo in modifica. */
  ticketScelte?: Record<number, number>;
}) {
  // La voce-ticket di cui è aperta la tavolozza delle emoji (una alla volta).
  const [emojiAperta, setEmojiAperta] = useState<number | null>(null);
  const rinomina = (chiave: number, nome: string) =>
    onChange(voci.map((v) => (v.chiave === chiave ? { ...v, nome } : v)));
  const togli = (chiave: number) => onChange(voci.filter((v) => v.chiave !== chiave));
  const cambiaTicket = (chiaveMenu: number, chiaveTicket: number, f: (t: VoceTicketEditor) => VoceTicketEditor) =>
    onChange(voci.map((v) => (v.chiave === chiaveMenu
      ? { ...v, ticket: v.ticket.map((t) => (t.chiave === chiaveTicket ? f(t) : t)) }
      : v)));
  const rinominaTicket = (chiaveMenu: number, chiaveTicket: number, nome: string) =>
    cambiaTicket(chiaveMenu, chiaveTicket, (t) => (t.emojiScelta ? { ...t, nome } : { ...t, nome, emoji: suggerisciEmoji(nome) }));
  const scegliEmoji = (chiaveMenu: number, chiaveTicket: number, emoji: string | null) =>
    cambiaTicket(chiaveMenu, chiaveTicket, (t) => ({ ...t, emoji, emojiScelta: true }));
  const toglieTicket = (chiaveMenu: number, chiaveTicket: number) =>
    onChange(voci.map((v) => (v.chiave === chiaveMenu
      ? { ...v, ticket: v.ticket.filter((t) => t.chiave !== chiaveTicket) }
      : v)));
  const aggiungiTicket = (chiaveMenu: number) =>
    onChange(voci.map((v) => (v.chiave === chiaveMenu ? { ...v, ticket: [...v.ticket, voceTicketNuova("")] } : v)));

  return (
    <div>
      <label style={{ fontSize: 12, ...S.sub, display: "block", marginBottom: 4 }}>Menu fra cui scegliere</label>
      <div style={{ display: "grid", gap: 10 }}>
        {voci.map((v) => {
          const usato = (v.id && scelte?.[v.id]) || 0;
          // Un menu già scelto da qualcuno non si toglie (lo rifiuterebbe
          // comunque la SQL): prima va spostata quella camera. L'ultimo
          // rimasto nemmeno — serve almeno un menu.
          const bloccato = usato > 0 || voci.length === 1;
          return (
            <div key={v.chiave} style={{ display: "grid", gap: 6, padding: 8, borderRadius: 10, background: "var(--secondary)" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input style={{ ...S.input, flex: 1, minWidth: 0, background: "var(--card)" }} value={v.nome} maxLength={40}
                  onChange={(e) => rinomina(v.chiave, e.target.value)}
                  placeholder="Es. Carne" />
                <button onClick={() => togli(v.chiave)} disabled={bloccato}
                  title={usato > 0 ? `Scelto da ${usato} ${usato === 1 ? "camera" : "camere"}: non si può togliere` : "Togli questo menu"}
                  aria-label={`Togli ${v.nome || "menu"}`}
                  style={{
                    width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "none", color: "var(--muted-foreground)",
                    cursor: bloccato ? "default" : "pointer", opacity: bloccato ? 0.35 : 1,
                  }}>
                  <X size={14} />
                </button>
              </div>

              {/* Le voci-ticket di QUESTO menu — un livello annidato, stesso
                  schema (nome + togli + aggiungi), un "Ticket" invece di un
                  "Togli questo menu" quando bloccato. */}
              <div style={{ paddingLeft: 14, display: "grid", gap: 4 }}>
                <label style={{ fontSize: 11, ...S.sub }}>Ticket di questo menu</label>
                {v.ticket.map((t) => {
                  // Bloccata solo se qualcuno l'ha già RITIRATA al banco: i
                  // ticket assegnati ma non usati spariscono con la voce.
                  const usatoTicket = (t.id && ticketScelte?.[t.id]) || 0;
                  const bloccatoTicket = usatoTicket > 0 || v.ticket.length === 1;
                  const aperta = emojiAperta === t.chiave;
                  return (
                    <div key={t.chiave} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => setEmojiAperta(aperta ? null : t.chiave)}
                        title="Scegli l'emoji di questo ticket" aria-label={`Emoji di ${t.nome || "questo ticket"}`} aria-expanded={aperta}
                        style={{
                          width: 34, height: 34, flexShrink: 0, borderRadius: 8, fontSize: 18, lineHeight: 1,
                          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                          background: "var(--card)", border: `1px solid ${aperta ? "var(--primary)" : "var(--border)"}`,
                          opacity: t.emoji ? 1 : 0.45,
                        }}>
                        {t.emoji || EMOJI_TICKET_DEFAULT}
                      </button>
                      <input style={{ ...S.input, flex: 1, minWidth: 0, background: "var(--card)" }} value={t.nome} maxLength={40}
                        onChange={(e) => rinominaTicket(v.chiave, t.chiave, e.target.value)}
                        placeholder="Es. Salsiccia" />
                      <button onClick={() => toglieTicket(v.chiave, t.chiave)} disabled={bloccatoTicket}
                        title={usatoTicket > 0 ? `Già ritirato ${usatoTicket} ${usatoTicket === 1 ? "volta" : "volte"}: non si può togliere` : "Togli questo ticket"}
                        aria-label={`Togli ${t.nome || "ticket"}`}
                        style={{
                          width: 26, height: 26, flexShrink: 0, borderRadius: 7, border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "none", color: "var(--muted-foreground)",
                          cursor: bloccatoTicket ? "default" : "pointer", opacity: bloccatoTicket ? 0.35 : 1,
                        }}>
                        <X size={12} />
                      </button>
                    </div>
                    {aperta && (
                      <div style={{
                        display: "flex", flexWrap: "wrap", gap: 2, padding: 6, borderRadius: 10,
                        background: "var(--card)", border: "1px solid var(--border)",
                      }}>
                        {EMOJI_TICKET.map((e) => (
                          <button key={e} onClick={() => { scegliEmoji(v.chiave, t.chiave, e); setEmojiAperta(null); }}
                            aria-label={e} aria-pressed={t.emoji === e}
                            style={{
                              width: 32, height: 32, fontSize: 18, lineHeight: 1, borderRadius: 7, cursor: "pointer",
                              border: "none", background: t.emoji === e ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "none",
                            }}>
                            {e}
                          </button>
                        ))}
                        {/* Una qualsiasi, dalla tastiera del telefono. */}
                        <input aria-label="Un'altra emoji" placeholder="altra…" maxLength={16}
                          onChange={(e) => { const val = e.target.value.trim(); if (val) scegliEmoji(v.chiave, t.chiave, val); }}
                          style={{ ...S.input, width: 64, height: 32, padding: "0 6px", fontSize: 13 }} />
                        <button onClick={() => { scegliEmoji(v.chiave, t.chiave, null); setEmojiAperta(null); }}
                          style={{ fontSize: 11, fontWeight: 700, padding: "0 8px", height: 32, borderRadius: 7, cursor: "pointer",
                            border: "none", background: "none", color: "var(--gray-accessible-text)" }}>
                          Nessuna
                        </button>
                      </div>
                    )}
                    </div>
                  );
                })}
                {v.ticket.length < TICKET_MAX && (
                  <button onClick={() => aggiungiTicket(v.chiave)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 11, fontWeight: 700,
                      color: "var(--gray-accessible-text)", background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}>
                    <Plus size={11} /> Aggiungi un ticket
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {voci.length < MENU_MAX && (
        <button onClick={() => onChange([...voci, voceNuova("")])}
          style={{
            display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 12, fontWeight: 700,
            color: "var(--gray-accessible-text)", background: "none", border: "none", cursor: "pointer", padding: 0,
          }}>
          <Plus size={13} /> Aggiungi un menu
        </button>
      )}
      <p style={{ fontSize: 11, ...S.sub, marginTop: 6 }}>
        Cosa si mangia (es. "Carne"/"Pesce") — non è legato a vegetariano,
        vegano o senza glutine: quello lo dichiara il residente a parte,
        qualunque menu scelga. Il primo è preselezionato per i residenti. Le
        voci-ticket di ciascun menu (es. "Salsiccia", "Bibita") sono quello
        che il residente ritira una alla volta il giorno della grigliata —
        servono almeno una per menu.
      </p>
    </div>
  );
}
