// Un'azione che rifiuta la richiesta con un messaggio, senza essere un errore:
// data.js lo trasforma in { ok:false, error } (HTTP 200, come ha sempre fatto
// fail()) e salta log di audit e filtro per ambito.
export class ActionRefused extends Error {}
