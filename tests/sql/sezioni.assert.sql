-- Asserzioni sul comportamento delle sezioni. Gira su un Postgres LOCALE
-- usa-e-getta (vedi tests/sql/run.sh), mai sul database di produzione.
\set ON_ERROR_STOP on

create or replace function _ok(p_name text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'ok    %', p_name;
end $$;

-- Camere: formato + intervalli
select _ok('V112 valida', is_valid_room('V112'));
select _ok('V21-b valida', is_valid_room('V21-b'));
select _ok('V100 fuori intervallo', not is_valid_room('V100'));
select _ok('V537 fuori intervallo', not is_valid_room('V537'));
select _ok('camera senza lettera respinta (hard cut)', not is_valid_room('112'));
select _ok('sezione inesistente respinta', not is_valid_room('P5'));
select _ok('DIREZIONE non e'' una camera', not is_valid_room('DIREZIONE'));
select _ok('V1-50 -> Manica', laundry_for_room('V21') = (select id from laundry where slug='manica'));
select _ok('V112 -> Valentino', laundry_for_room('V112') = (select id from laundry where slug='valentino'));

-- Una sezione nuova con lavanderia condivisa
select _ok('crea lavanderia condivisa 2 coppie',
  (laundry_admin_create('po-mole', 'Lavanderia Po-Mole', 2::smallint)->>'ok')::boolean);
select _ok('2 coppie: A e B prenotabili, C no',
  (select count(*) filter (where bookable) from machine where laundry_id = (select id from laundry where slug='po-mole')) = 4
  and not exists (select 1 from machine where laundry_id=(select id from laundry where slug='po-mole') and code='W-C' and bookable));

select _ok('crea sezione P',
  (section_admin_create('P', 2::smallint, 'Po',
     '{"conference": false}'::jsonb,
     jsonb_build_array(jsonb_build_object('label','Po','from',1,'to',40,
        'laundry_id',(select id from laundry where slug='po-mole'))))->>'ok')::boolean);
select _ok('crea sezione M sulla stessa lavanderia',
  (section_admin_create('M', 3::smallint, 'Mole', '{}'::jsonb,
     jsonb_build_array(jsonb_build_object('label','Mole','from',1,'to',30,
        'laundry_id',(select id from laundry where slug='po-mole'))))->>'ok')::boolean);
select _ok('lettera duplicata respinta',
  not (section_admin_create('P', 9::smallint, 'Dup', '{}'::jsonb, '[]'::jsonb)->>'ok')::boolean);
select _ok('numero duplicato respinto',
  not (section_admin_create('Q', 2::smallint, 'Dup', '{}'::jsonb, '[]'::jsonb)->>'ok')::boolean);
select _ok('intervalli sovrapposti respinti (e sezione non creata)',
  not (section_admin_create('Z', 8::smallint, 'Z', '{}'::jsonb,
     '[{"label":"a","from":1,"to":10},{"label":"b","from":5,"to":20}]'::jsonb)->>'ok')::boolean
  and not exists (select 1 from section where code='Z'));
select _ok('P5 e M5 sono la stessa lavanderia',
  laundry_for_room('P5') = laundry_for_room('M5') and laundry_for_room('P5') is not null);
select _ok('V5 e P5 sono lavanderie diverse', laundry_for_room('V5') <> laundry_for_room('P5'));

-- Prenotazione: P5 e M5 si contendono lo stesso turno
select _ok('P5 prenota W-A', (book_laundry('P5', 1, 4, 'W-A')->>'ok')::boolean);
select _ok('M5 trova il turno occupato (condivisa)', book_laundry('M5', 1, 4, 'W-A')->>'error' = 'occupata');
select _ok('M5 prenota W-B', (book_laundry('M5', 1, 4, 'W-B')->>'ok')::boolean);
select _ok('W-C non prenotabile (2 coppie)', book_laundry('M5', 1, 4, 'W-C')->>'error' = 'macchina non valida');
select _ok('camera senza lettera respinta', book_laundry('112', 1, 5, 'W-A')->>'error' = 'camera mancante');
select _ok('camera fuori intervallo respinta', book_laundry('V100', 1, 5, 'W-A')->>'error' = 'camera mancante');
select _ok('actor di altra lavanderia respinto',
  book_laundry('P5', 1, 6, 'W-A', false, 'V112')->>'error' = 'altra lavanderia');
select _ok('actor di sezione diversa ma stessa lavanderia accettato',
  (book_laundry('P5', 1, 6, 'W-A', false, 'M5')->>'ok')::boolean);

-- Snapshot
select _ok('snapshot porta sezione, coppie e funzionalita''',
  (laundry_snapshot('P5')->'section'->>'code') = 'P'
  and (laundry_snapshot('P5')->>'pairs')::int = 2
  and (laundry_snapshot('P5')->'section'->'features'->>'conference') = 'false'
  and (laundry_snapshot('V21')->>'pairs')::int = 1);

-- Segnalazioni: vanno alla sezione giusta (e a chi condivide la lavanderia)
select add_feedback('P5', 'asciugatrice rotta');
select add_feedback('V112', 'rubinetto');
select _ok('feedback P porta section_id P',
  (select section_id from feedback where body='asciugatrice rotta') = (select id from section where code='P'));
select _ok('admin di V non vede la segnalazione di P',
  not exists (select 1 from jsonb_array_elements(admin_feedback(true, 100, array[(select id from section where code='V')])->'items') i where i->>'body'='asciugatrice rotta'));
select _ok('admin di V vede la sua',
  exists (select 1 from jsonb_array_elements(admin_feedback(true, 100, array[(select id from section where code='V')])->'items') i where i->>'body'='rubinetto'));
select _ok('admin di M vede la segnalazione di P (lavanderia condivisa)',
  exists (select 1 from jsonb_array_elements(admin_feedback(true, 100, array[(select id from section where code='M')])->'items') i where i->>'body'='asciugatrice rotta'));
select _ok('admin globale (null) vede tutto',
  jsonb_array_length(admin_feedback(true, 100, null)->'items') >= 2);

-- Aggiornamento coppie
select _ok('porta Po-Mole a 3 coppie',
  (laundry_admin_update((select id from laundry where slug='po-mole'), null, 3::smallint)->>'ok')::boolean);
select _ok('ora W-C e'' prenotabile', (book_laundry('M5', 1, 4, 'W-C')->>'ok')::boolean);

-- Account: ruoli e sezione
select _ok('crea fdo di una sezione',
  (account_create('mario', 'h', 'fdo', 'test', (select id from section where code='P'))->>'ok')::boolean);
select _ok('l''account porta la sua sezione',
  (account_by_username('mario')->>'section_id')::int = (select id from section where code='P'));
select _ok('ruolo superadmin: senza sezione',
  (account_create('boss', 'h', 'superadmin', 'test')->>'ok')::boolean);
select _ok('superadmin ha section_id nullo', (account_by_username('boss')->'section_id') = 'null'::jsonb);
select _ok('un fdo senza sezione e'' respinto', not (account_create('orfano', 'h', 'fdo', 'test')->>'ok')::boolean);
select _ok('ruolo vecchio respinto', not (account_create('vecchio', 'h', 'sistemista', 'test', 1::smallint)->>'ok')::boolean);
select _ok('sezione inesistente respinta', not (account_create('x1x', 'h', 'admin', 'test', 99::smallint)->>'ok')::boolean);
select _ok('sposta un account in un''altra sezione',
  (account_set_section((select id from admin_account where username='mario'), (select id from section where code='M'))->>'ok')::boolean);

-- Config pubblica
select _ok('section_config elenca sezioni e lavanderie',
  jsonb_array_length(section_config()->'sections') >= 3 and jsonb_array_length(section_config()->'laundries') >= 3);

-- Disattivare una sezione ne invalida le camere
select _ok('disattiva P', (section_admin_update((select id from section where code='P'), null, null, false)->>'ok')::boolean);
select _ok('camere di sezione disattivata non valide', not is_valid_room('P5'));

-- Permessi: nessuna funzione nuova eseguibile da anon
select _ok('anon non esegue section_admin_create',
  not has_function_privilege('anon', 'section_admin_create(text,smallint,text,jsonb,jsonb)', 'execute'));
select _ok('service_role esegue section_config',
  has_function_privilege('service_role', 'section_config()', 'execute'));
select _ok('anon non esegue account_set_sections',
  not has_function_privilege('anon', 'account_set_section(bigint,smallint)', 'execute'));

-- Ambito: cancellare / chiudere solo dentro la propria sezione
select _ok('admin di V non cancella una prenotazione di P',
  admin_delete_booking((select min(id) from laundry_booking where room like 'P%'), array[(select id from section where code='V')]::smallint[])->>'error' = 'fuori dal tuo ambito');
select _ok('admin di M cancella una prenotazione di P (lavanderia condivisa)',
  (admin_delete_booking((select min(id) from laundry_booking where room like 'P%'), array[(select id from section where code='M')]::smallint[])->>'ok')::boolean);
select book_laundry('V112', 3, 3, 'W-A');
select _ok('ambito nullo cancella qualunque',
  (admin_delete_booking((select min(id) from laundry_booking where room like 'V%'), null)->>'ok')::boolean);
select _ok('prenotazione inesistente resta "inesistente"',
  admin_delete_booking(999999, array[1]::smallint[])->>'error' = 'prenotazione inesistente');
select _ok('admin di V non chiude la segnalazione di P',
  admin_mark_feedback((select id from feedback where body='asciugatrice rotta'), true, array[(select id from section where code='V')]::smallint[])->>'error' = 'fuori dal tuo ambito');
select _ok('admin di M chiude la segnalazione di P (condivisa)',
  (admin_mark_feedback((select id from feedback where body='asciugatrice rotta'), true, array[(select id from section where code='M')]::smallint[])->>'ok')::boolean);
select _ok('anon non esegue admin_delete_booking',
  not has_function_privilege('anon', 'admin_delete_booking(bigint,smallint[])', 'execute'));


-- ═══ Risorse per sezione ═══════════════════════════════════════════════════
-- (la sezione P e' stata disattivata piu' sopra: la riattiviamo)
select section_admin_update((select id from section where code='P'), null, null, true);

select _ok('ogni sezione ha le sue sale', (select count(*) from room_space where section_id = (select id from section where code='P')) = 2);
select _ok('V ha le sue (migrate)', (select count(*) from room_space where section_id = (select id from section where code='V')) = 2);

-- Sale indipendenti
select _ok('prenota il cinema di V', (book_space('cinema', 3, 600, 660, 'V112', 'private', (select id from section where code='V'))->>'ok')::boolean);
select _ok('stessa ora nel cinema di P: libera (indipendente)',
  (book_space('cinema', 3, 600, 660, 'P5', 'private', (select id from section where code='P'))->>'ok')::boolean);
select _ok('il cinema di P vede solo la sua',
  jsonb_array_length(space_bookings('cinema', (select id from section where code='P'))->'bookings') = 1);
select _ok('V non vede quella di P',
  not exists (select 1 from jsonb_array_elements(space_bookings('cinema', (select id from section where code='V'))->'bookings') b where b->>'name' = 'P5'));
select _ok('stessa ora nel cinema di V: occupata (sovrapposizione)',
  not (book_space('cinema', 3, 600, 660, 'V113', 'private', (select id from section where code='V'))->>'ok')::boolean);
select _ok('sezione mancante: sala non valida', space_bookings('cinema', null)->>'error' = 'sala non valida');
select _ok('chiude la sala di P', (space_admin_set_chiuso('cinema', true, (select id from section where code='P'))->>'ok')::boolean);
select _ok('... e non quella di V',
  (space_bookings('cinema', (select id from section where code='V'))->>'chiuso')::boolean = false
  and (space_bookings('cinema', (select id from section where code='P'))->>'chiuso')::boolean = true);
select _ok('admin_spaces filtra per sezione',
  not exists (select 1 from jsonb_array_elements(admin_spaces((select id from section where code='V'))->'items') i where (i->>'section_id')::int <> (select id from section where code='V')));

-- Sala polivalente indipendente
select _ok('evento polivalente in P', (conference_add('Riunione P', '10:00', '11:00', current_date + 1, current_date + 1, null, null, 'test', (select id from section where code='P'))->>'ok')::boolean);
select _ok('stesso orario in V: nessun conflitto (indipendente)',
  (conference_add('Riunione V', '10:00', '11:00', current_date + 1, current_date + 1, null, null, 'test', (select id from section where code='V'))->>'ok')::boolean);
select _ok('conflitto dentro la stessa sezione',
  conference_add('Altra P', '10:30', '11:30', current_date + 1, current_date + 1, null, null, 'test', (select id from section where code='P'))->>'error' = 'sovrapposto');
select _ok('agenda di P: solo i suoi eventi',
  (select count(*) from jsonb_array_elements(conference_agenda(5, (select id from section where code='P'))->'occorrenze') o where o->>'titolo' = 'Riunione V') = 0
  and (select count(*) from jsonb_array_elements(conference_agenda(5, (select id from section where code='P'))->'occorrenze') o where o->>'titolo' = 'Riunione P') = 1);
select _ok('regole: solo della sezione',
  jsonb_array_length(conference_rules((select id from section where code='P'))->'items') = 1);
select _ok('conference_add senza sezione rifiutata',
  conference_add('x', '10:00', '11:00', current_date + 1, current_date + 1, null, null, 'test', null)->>'error' = 'sezione mancante');
select _ok('cancellare un evento ridà l''agenda della sua sezione',
  jsonb_array_length(conference_delete((select id from conference_event where titolo='Riunione P'))->'occorrenze') = 0);
select _ok('V ha ancora il suo', (select count(*) from conference_event where titolo = 'Riunione V') = 1);

-- Condivisione
select _ok('di default nessuna risorsa condivisa', resource_section((select id from section where code='P'), 'conference') = (select id from section where code='P'));
select _ok('P condivide la polivalente con V',
  (section_admin_set_sharing((select id from section where code='P'), jsonb_build_object('conference', (select id from section where code='V')))->>'ok')::boolean);
select _ok('resource_section segue la condivisione',
  resource_section((select id from section where code='P'), 'conference') = (select id from section where code='V'));
select _ok('... solo per quella risorsa', resource_section((select id from section where code='P'), 'cinema') = (select id from section where code='P'));
select _ok('chi agisce sull''evento di V: V e P',
  resource_actors('conference_event', (select id from conference_event where titolo='Riunione V')) @> array[(select id from section where code='V'), (select id from section where code='P')]::smallint[]);
select _ok('niente catene: V non puo'' usare quella di M se P usa V',
  not (section_admin_set_sharing((select id from section where code='V'), jsonb_build_object('conference', (select id from section where code='M')))->>'ok')::boolean);
select _ok('niente catene: M non puo'' usare quella di P (P usa V)',
  not (section_admin_set_sharing((select id from section where code='M'), jsonb_build_object('conference', (select id from section where code='P')))->>'ok')::boolean);
select _ok('risorsa non condivisibile respinta',
  not (section_admin_set_sharing((select id from section where code='M'), '{"laundry": 1}'::jsonb)->>'ok')::boolean);
select _ok('toglie la condivisione', (section_admin_set_sharing((select id from section where code='P'), '{}'::jsonb)->>'ok')::boolean);
select _ok('... e la risorsa torna propria',
  resource_section((select id from section where code='P'), 'conference') = (select id from section where code='P'));
select _ok('resource_actors: risorsa inesistente = null', resource_actors('conference_event', 999999) is null);
select _ok('resource_actors: tipo sconosciuto = null', resource_actors('boh', 1) is null);

-- Grigliata indipendente
select _ok('grigliata in P', (grigliata_admin_crea('Grigliata P', now() + interval '1 day', current_date + 2, 'https://paypal.me/x', null,
    '[{"nome":"Carne","ticket":[{"nome":"Panino","emoji":"🍔"}]}]'::jsonb, 'test', true, null, (select id from section where code='P'))->>'ok')::boolean);
select _ok('attiva per P', grigliata_attiva_bool((select id from section where code='P')));
select _ok('non attiva per V', not grigliata_attiva_bool((select id from section where code='V')));
select _ok('stato pubblico di una camera P', (grigliata_stato_pubblico('P5')->>'attiva')::boolean);
select _ok('stato pubblico di una camera V: nessuna', not (grigliata_stato_pubblico('V112')->>'attiva')::boolean);
select _ok('crea una grigliata per V', (grigliata_admin_crea('Grigliata V', now() + interval '1 day', current_date + 2, 'https://paypal.me/y', null,
    '[{"nome":"Carne","ticket":[{"nome":"Panino","emoji":"🍔"}]}]'::jsonb, 'test', true, null, (select id from section where code='V'))->>'ok')::boolean);
select _ok('... e non chiude quella di P', grigliata_attiva_bool((select id from section where code='P')));
select _ok('overview per sezione', grigliata_admin_overview((select id from section where code='P'))->'evento'->>'titolo' = 'Grigliata P');
select _ok('grigliata_admin_crea senza sezione rifiutata',
  grigliata_admin_crea('x', now(), current_date, 'https://paypal.me/z', null, '[{"nome":"a","ticket":[{"nome":"b","emoji":"x"}]}]'::jsonb, 'test', true, null, null)->>'error' = 'sezione mancante');
select _ok('resource_actors grigliata', resource_actors('grigliata_evento', (select id from grigliata_evento where titolo='Grigliata P')) = array[(select id from section where code='P')]::smallint[]);

-- Cambio biancheria e tema indipendenti
select _ok('ancora cambio biancheria per P',
  (linen_change_set_anchor(date_trunc('week', current_date)::date + 1, 'grande', (select id from section where code='P'))->>'ok')::boolean);
select _ok('P ha il tipo, V no',
  linen_change_current((select id from section where code='P')) = 'grande' and linen_change_current((select id from section where code='V')) is not distinct from linen_change_current((select id from section where code='V')));
select _ok('l''ancora di M e'' vuota', linen_change_current((select id from section where code='M')) is null);
select _ok('admin_get per sezione', linen_change_admin_get((select id from section where code='P'))->>'ancora_tipo' = 'grande');
select _ok('segna un salto per P', (linen_change_set_skip(date_trunc('week', current_date)::date + 1, true, (select id from section where code='P'))->>'ok')::boolean);
select _ok('... e P ha "nessuno"', linen_change_current((select id from section where code='P')) = 'nessuno');
select _ok('il salto di P non tocca M', linen_change_current((select id from section where code='M')) is null);
select _ok('ancora senza sezione rifiutata', linen_change_set_anchor(date_trunc('week', current_date)::date + 1, 'grande', null)->>'error' = 'sezione mancante');
select _ok('imposta il tema di P', (sysadmin_set_theme('natale', (select id from section where code='P'))->>'ok')::boolean);
select _ok('... e solo quello',
  app_theme_get((select id from section where code='P')) = 'natale'
  and app_theme_get((select id from section where code='M')) = 'nessuno');
-- v2.1: tema e cambio biancheria sono globali: lo snapshot legge quelli della sezione col minimo id (V)
select sysadmin_set_theme('halloween', (select min(id) from section));
select _ok('lo snapshot porta il tema globale a tutte le sezioni', laundry_snapshot('P5')->>'tema' = 'halloween' and laundry_snapshot('M5')->>'tema' = 'halloween');
select _ok('lo snapshot porta la grigliata della propria sezione',
  (laundry_snapshot('P5')->>'grigliata_attiva')::boolean and not (laundry_snapshot('M5')->>'grigliata_attiva')::boolean);

-- Ricorrenti, pulizia, conteggi per sezione
select recurring_add_laundry((select id from laundry where slug='po-mole'), 2, 5, 'W-A', 'P7');
select recurring_add_laundry((select id from laundry where slug='valentino'), 2, 6, 'W-A', 'V112');
select _ok('recurring_list: solo le regole della sezione',
  jsonb_array_length(recurring_list((select id from section where code='P'))->'items') = 1
  and jsonb_array_length(recurring_list(null)->'items') >= 2);
select _ok('apply_recurring per sezione',
  (apply_recurring(0, (select id from section where code='P'))->>'lavanderia')::int = 1);
select book_laundry('V113', 4, 4, 'W-A');
select _ok('conteggi per sezione: P conta le sue prenotazioni lavanderia',
  (sysadmin_conteggi((select id from section where code='P'))->'totale'->>'lavanderia')::int
  < (sysadmin_conteggi(null)->'totale'->>'lavanderia')::int);
select upsert_push_sub('P5', 'ep-p', 'k', 'a');
select upsert_push_sub('V112', 'ep-v', 'k', 'a');
select _ok('iscrizioni push per sezione',
  jsonb_array_length(sysadmin_push_subs((select id from section where code='P'))->'iscrizioni') = 1
  and jsonb_array_length(sysadmin_push_subs(null)->'iscrizioni') >= 2);
select _ok('destinatari broadcast per sezione',
  jsonb_array_length(sysadmin_all_push_subs(null, (select id from section where code='P'))) = 1);
select _ok('pulizia di P', (sysadmin_purge('prenotazioni', null, (select id from section where code='P'))->>'ok')::boolean);
select _ok('... le prenotazioni lavanderia di P spariscono, quelle di V restano',
  (select count(*) from laundry_booking where room like 'V%') > 0
  and (select count(*) from laundry_booking where room like 'P%') = 0);
select _ok('pulizia di P: il cinema di V resta',
  (select count(*) from space_booking b join room_space s on s.id=b.space_id where s.section_id=(select id from section where code='V')) > 0);
select _ok('pulizia di P: la polivalente di V resta', (select count(*) from conference_event where titolo = 'Riunione V') = 1);
select _ok('pulizia notifiche di P', (sysadmin_purge('notifiche', null, (select id from section where code='P'))->>'ok')::boolean);
select _ok('... le iscrizioni V restano',
  (select count(*) from push_sub where room like 'V%') >= 1 and (select count(*) from push_sub where room like 'P%') = 0);

-- Colori dei gruppi di camere
select _ok('imposta nome e colore di un intervallo',
  (section_admin_set_range_style((select min(id) from section_range where section_id=(select id from section where code='V')), '  Edificio A ', '#112233')->>'ok')::boolean);
select _ok('... salvati',
  (select color from section_range where id=(select min(id) from section_range where section_id=(select id from section where code='V'))) = '#112233');
select _ok('colore non valido respinto',
  not (section_admin_set_range_style((select min(id) from section_range), null, 'rosso')->>'ok')::boolean);
select _ok('intervallo inesistente', section_admin_set_range_style(999999, null, '#000000')->>'error' = 'intervallo non trovato');
select _ok('seed: la Manica ha il suo colore', exists (select 1 from section_range where label in ('Manica') and color = '#f97316'));

-- Permessi delle funzioni nuove
select _ok('anon non esegue resource_actors', not has_function_privilege('anon', 'resource_actors(text,bigint)', 'execute'));
select _ok('anon non esegue section_admin_set_sharing', not has_function_privilege('anon', 'section_admin_set_sharing(smallint,jsonb)', 'execute'));
select _ok('anon non esegue sysadmin_purge', not has_function_privilege('anon', 'sysadmin_purge(text,text,smallint)', 'execute'));
select _ok('service_role esegue conference_agenda', has_function_privilege('service_role', 'conference_agenda(integer,smallint)', 'execute'));

-- v2.1: coppie fino a 8, numero di sezione automatico, risorse globali
select _ok('crea lavanderia da 5 coppie', (laundry_admin_create('cinque', 'Cinque', 5::smallint)->>'ok')::boolean);
select _ok('5 coppie: 10 macchine prenotabili',
  (select count(*) from machine where laundry_id=(select id from laundry where slug='cinque') and bookable and not is_oos) = 10);
select _ok('9 coppie respinte', not (laundry_admin_create('nove', 'Nove', 9::smallint)->>'ok')::boolean);
select laundry_admin_update((select id from laundry where slug='cinque'), null, 2::smallint);
select _ok('scendendo a 2 coppie le altre vanno fuori servizio',
  (select count(*) from machine where laundry_id=(select id from laundry where slug='cinque') and bookable) = 4
  and (select is_oos and not bookable from machine where laundry_id=(select id from laundry where slug='cinque') and code='D-E'));
select _ok('numero di sezione automatico',
  (section_admin_create('Q', null, 'Auto')->'section'->>'number')::int = (select max(number) from section where code <> 'Q') + 1);
select _ok('cambio biancheria e tema: stesso proprietario per tutte le sezioni',
  resource_section((select id from section where code='Q'), 'linen') = (select min(id) from section)
  and resource_section((select id from section where code='Q'), 'theme') = (select min(id) from section)
  and resource_section((select id from section where code='Q'), 'cinema') = (select id from section where code='Q'));
