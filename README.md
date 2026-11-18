[![EinaudiPlus logo](docs/images/logo.svg)](docs/images/logo.svg)

EinaudiPlus
===========

[](#einaudiplus)

App del Collegio Einaudi per prenotare **lavanderia**, **sala cinema** e **sala
musica**, oltre a funzioni minori (bici, sala polivalente, cambio biancheria,
grigliate), per una o più **sezioni** del collegio. È una PWA: si installa dal
browser e manda promemoria push.

Requisiti per lavorarci:

* Node.js e npm
* Docker, solo per `npm run test:sql`
* Un progetto Supabase e uno Vercel per il deploy (vedi [DEPLOY.md](DEPLOY.md))

Com'è fatta
-----------

[](#com-e-fatta)


```
browser ──▶ /api/* (funzioni serverless Vercel) ──▶ Postgres (Supabase)
                                                        ▲
                                pg_cron ogni minuto ────┘
                                   └──▶ /api/cron ──▶ Web Push · Telegram
```

Il browser **non parla mai** direttamente col database: la chiave Supabase sta
solo lato server. Tutte le scritture passano da funzioni SQL, che sono anche il
posto dove vivono i vincoli (niente doppie prenotazioni, niente sovrapposizioni
nelle sale).

I file, e cosa c'è dentro
-------------------------

[](#i-file-e-cosa-c-e-dentro)


**Frontend**

| File | Cosa fa |
|---|---|
| `App.tsx` · `shell/` | il guscio dell'app (stato globale, routing); `shell/` ha login, sidebar, menu mobile, tema stagionale e la configurazione di navigazione |
| `features/<dominio>/` | una cartella per dominio (laundry, common-spaces, grigliata, bikes, ...), residenti e `admin/`. `features/common-spaces/` = cinema e musica a fasce libere |
| `panels/` | fogli trasversali: Toast, Impostazioni, promemoria, installazione PWA |
| `AdminPanel.tsx` | le sezioni riservate (macchine, segnalazioni, ricorrenti, manutenzione). Caricato solo a chi fa l'accesso |
| `AccessibilityPanel.tsx` · `statusConfig.ts` | colori e simboli di stato personalizzabili |
| `api.ts` · `roomsApi.ts` | le uniche due porte verso `/api`. Nessun altro file fa `fetch` di dati |
| `push.ts` · `public/sw.js` | notifiche push |
| `style.css` | i design token. **Da leggere prima di toccare un colore**: la palette ha due livelli e il perché è spiegato lì |

**Backend**

| File | Cosa fa |
|---|---|
| `api/laundry.js` | tutto ciò che riguarda la lavanderia |
| `api/rooms.js` | cinema e musica |
| `api/grigliata.js` | adesione, menu e dichiarazione di pagamento per una grigliata attiva |
| `api/cron.js` | invia i promemoria dovuti. Lo chiama `pg_cron`, non Vercel |
| `api/telegram.js` | webhook del bot |
| `api/admin/auth.js` · `api/admin/data.js` | accesso e pipeline delle operazioni riservate (sessione, ruolo, ambito); le azioni stanno in `api/admin/_actions/<dominio>.js`, le regole sul contenuto in `_guards.js` |
| `api/_lib/http.js` | lettura del corpo, risposte JSON, controllo del metodo. Il resto (db, auth, push, rate limit) vive in `src/shared/` e `src/modules/` |
| `supabase/` | schema e funzioni SQL, consolidati. `migrations/` è la storia delle modifiche, numerata |

Il database
-----------

[](#il-database)


I file in `supabase/` sono **consolidati**: contengono lo stato attuale, non
quello iniziale. Ricostruire un database da zero significa eseguirli in
quest'ordine, e nient'altro:

| # | File | Cosa contiene |
|---|---|---|
| 1 | `schema.sql` | tabelle, vincoli, dati iniziali (lavanderie, macchine, sale) |
| 2 | `functions.sql` | lettura e scrittura di lavanderia e sale, per i residenti |
| 3 | `admin.sql` | operazioni del pannello, comprese quelle a nome della Direzione |
| 4 | `sysadmin.sql` | regole ricorrenti e pulizia, riservate all'admin della sezione |
| 5 | `polivalente.sql` | sala polivalente: tabella, agenda, programmazione |
| 6 | `account.sql` | account amministrativi e cambio password |
| 7 | `telegram.sql` | collegamento del bot |
| 8 | `reminders.sql` | promemoria dovuti e potatura periodica |
| 9 | `bici.sql` | dichiarazione bici per camera, vista di portineria/admin |
| 10 | `tema.sql` | tema stagionale decorativo (Halloween, Natale…), acceso/spento dall'admin di ogni sezione |
| 11 | `cambio-biancheria.sql` | cambio biancheria del martedì (grande/piccolo), impostato da FDO e admin di ogni sezione |
| 12 | `grigliata.sql` | evento grigliata: adesioni, menu, pagamenti — impostato dal delegato e dall'admin di ogni sezione |
| 13 | `sezioni.sql` | sezioni (lettera + numero + funzioni accese), intervalli di camere, lavanderie con coppie configurabili e condivisibili, ruolo `superadmin` e ambito per sezione degli account. Identico alla migrazione 061 |
| 14 | `cron.sql` | job `pg_cron` (va personalizzato: contiene dei segnaposto) |
| 15 | **`permessi.sql`** | **restringe l'esecuzione a `service_role`. Non è facoltativo** |

`permessi.sql` va **per ultimo** e va eseguito: agisce su tutte le funzioni
già create, e senza di lui ognuna resta invocabile via `/rest/v1/rpc/` da
chiunque abbia la chiave pubblicabile di Supabase — scavalcando cookie di
sessione, hash delle password e rate limit in un colpo solo.

`migrations/` non serve a una ricostruzione: quelle modifiche sono già dentro
i file qui sopra. Restano perché spiegano **perché** una cosa è come è, e
perché vanno applicate una alla volta al database che è già in produzione.

Sviluppo
--------

[](#sviluppo)


```bash
npm install
npm run dev      # http://localhost:5173, /api compreso
npm run test:unit  # nessuna rete
npm run test:sql   # SQL delle sezioni su un Postgres locale usa-e-getta (docker)
npm test         # gira contro il database VERO: vedi sotto
npm run build
```

> **`npm test` parla con la produzione.** Non esiste un database di staging:
> `.env.local` punta lì. I test scelgono turni liberi e ripuliscono ciò che
> creano, ma un test scritto male scrive su dati veri. La pulizia distruttiva
> è dietro `TEST_ALLOW_PURGE=1` apposta.

Per applicare una migrazione:

```bash
node scripts/db.cjs apply supabase/migrations/00X-nome.sql
node scripts/db.cjs query "select ..."
```

Due cose da sapere prima di cambiare qualcosa
---------------------------------------------

[](#due-cose-da-sapere-prima-di-cambiare-qualcosa)


**L'identità è autodichiarata.** Il numero di camera sta in `localStorage` e
chiunque può scriverci quello che vuole. Non c'è un login per i residenti. Da
qui discende che la quota di 2 turni e la proprietà delle prenotazioni sono
indicazioni, non regole applicabili: un controllo si aggirerebbe cambiando una
stringa nel browser, e fermerebbe solo chi lo rispettava già. Se un giorno
arriverà un'autenticazione vera, è nelle funzioni SQL che vanno rimessi i
controlli.

**Quattro ruoli amministrativi**: `superadmin` (piattaforma: crea sezioni,
intervalli di camere e lavanderie, sceglie su quale sezione lavora), `admin`
(amministra UNA sezione: funzioni, risorse condivise, colori dei gruppi di
camere, account FDO e delegato di quella sezione), `fdo` (portineria della
sezione) e `delegato` (solo la grigliata). Ogni sezione ha le sue risorse
(sale, polivalente, cambio biancheria, grigliata, tema), indipendenti per
default e condivisibili con un'altra sezione.

**Gli amministratori invece hanno un login vero** (cookie httpOnly firmato,
password con hash scrypt) e i loro poteri sono verificati sul server. Si entra
dall'indirizzo `/admin` (nessun link dall'app dei residenti), con nome utente, password e
verifica anti-bot Cloudflare Turnstile (vedi DEPLOY.md).

Documenti
---------

[](#documenti)


- [DEPLOY.md](DEPLOY.md) — variabili d'ambiente, scheduler, migrazione da Google
  Sheets, e le trappole (fra cui: **mai commenti in `vercel.json`**)
- [PUSH-NOTIFICHE.md](PUSH-NOTIFICHE.md) — come funzionano i promemoria
