// Tipi condivisi da tutta la sezione amministrativa — vivono qui perché ogni
// dominio (account, macchine, sale, bici, notifiche...) li usa per sapere chi
// sta chiedendo (Role) o dove si trova (Tab), non solo il guscio in
// AdminPanel.tsx che li ri-esporta per chi importava da lì.

// I permessi di ogni ruolo stanno in UN posto, lato server:
// src/modules/identity/domain/permissions.js. Qui si elencano solo i nomi.
//
// `superadmin` e' il ruolo di piattaforma (crea sezioni, intervalli, lavanderie).
// `admin` amministra UNA sezione (nome, funzioni, condivisioni, colori, account
// di portineria); `fdo` e' la portineria di una sezione. Ogni account che non
// e' superadmin appartiene a una sola sezione.
//
// `delegato` e' diverso in natura: non un quarto livello di fiducia
// operativa, ma un ruolo stretto a una sola cosa (la Grigliata, vedi
// src/modules/grigliata) — vede solo quella scheda, nessun'altra.
export type Role = "superadmin" | "admin" | "fdo" | "delegato";
export type Tab = "macchine" | "segnalazioni" | "bici" | "account" | "ricorrenti" | "notifiche" | "manutenzione" | "tema" | "cambiobiancheria" | "grigliataAdmin" | "sezioni";
