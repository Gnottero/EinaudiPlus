-- 061 — Sezioni: l'app smette di essere "un collegio" e diventa "piu' sezioni".
--
-- Cosa fa, in ordine:
--   1. tabelle section (codice lettera + numero + funzionalita' attive) e
--      section_range (intervalli di camere, ognuno con la sua lavanderia);
--   2. laundry: numero di coppie lavatrice/asciugatrice configurabile (1-3),
--      e le camere non stanno piu' sulla lavanderia ma sugli intervalli — cosi'
--      due sezioni possono puntare alla STESSA lavanderia (condivisa);
--   3. l'identita' di una camera diventa "<lettera><numero>" (V112, P21-b):
--      backfill 'V' + camera su tutto cio' che e' gia' memorizzato. HARD CUT:
--      dopo questa migrazione il server rifiuta le camere senza lettera;
--   4. le segnalazioni portano section_id e vanno alla sezione giusta;
--   5. account amministrativi: ruolo 'superadmin' e ambito per sezione.
--
-- ⚠️ Va applicata INSIEME al deploy del codice che la usa (vedi DEPLOY.md,
-- "Sezioni"): il vecchio codice manda camere senza lettera e verrebbe respinto.
-- Idempotente: si puo' rieseguire.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Sezioni e intervalli
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists section (
  id         smallserial primary key,
  -- La lettera con cui i residenti entrano: V112, P21-b. Una o due lettere
  -- maiuscole, univoca. Non si cambia dopo la creazione (e' dentro ogni
  -- camera memorizzata).
  code       text not null unique check (code ~ '^[A-Z]{1,2}$'),
  -- Il numero della sezione, scelto alla creazione: serve a ordinarle e a
  -- riconoscerle fra gli amministratori. Univoco.
  number     smallint not null unique check (number > 0),
  name       text not null check (length(btrim(name)) between 1 and 60),
  -- Funzionalita' attive. Una chiave mancante vale "attiva": una funzionalita'
  -- nuova non spegne nessuno per sbaglio. Chiavi: laundry, cinema, music,
  -- conference, bikes, linen, grigliata, feedback, notifications.
  features   jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  -- Risorse CONDIVISE con un'altra sezione: {"conference": 1} = questa sezione
  -- usa la sala polivalente della sezione 1 invece di averne una propria.
  -- Per default nessuna: ogni sezione ha le sue risorse e sono indipendenti.
  -- Chiavi ammesse: cinema, music, conference, linen, grigliata, theme (la
  -- lavanderia si condivide dagli intervalli, vedi section_range.laundry_id).
  shared_with jsonb not null default '{}'::jsonb check (jsonb_typeof(shared_with) = 'object'),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Gli intervalli di camere di una sezione (es. "Manica" 1-50, "Valentino"
-- 101-136, 201-236...). Ogni intervallo dice anche QUALE lavanderia usa:
-- e' qui, non sulla sezione, che si decide chi condivide cosa.
create table if not exists section_range (
  id         serial primary key,
  section_id smallint not null references section(id) on delete cascade,
  label      text not null check (length(btrim(label)) between 1 and 40),
  room_from  smallint not null check (room_from >= 1),
  room_to    smallint not null check (room_to >= room_from and room_to <= 9999),
  laundry_id smallint references laundry(id) on delete set null,
  -- Il colore con cui la sezione riconosce a colpo d'occhio questo gruppo di
  -- camere (un piano, un edificio): lo imposta l'amministratore della sezione.
  color      text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  -- Dentro una sezione gli intervalli non si sovrappongono: una camera
  -- appartiene a un solo intervallo, quindi a una sola lavanderia.
  constraint section_range_no_overlap exclude using gist (
    section_id with =,
    int4range(room_from::int, room_to::int, '[]') with &&
  )
);

create index if not exists section_range_laundry_idx on section_range (laundry_id);

alter table section       enable row level security;
alter table section_range enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lavanderie: coppie configurabili, camere sugli intervalli
-- ─────────────────────────────────────────────────────────────────────────────

alter table laundry add column if not exists n_pairs smallint not null default 3
  check (n_pairs between 1 and 8);

-- La Manica ha una sola coppia. Era implicito in machine.bookable: ora e' un
-- dato della lavanderia, da cui machine.bookable discende.
update laundry set n_pairs = 1 where slug = 'manica';

-- Le camere non stanno piu' qui: vedi section_range. Le colonne restano
-- (nullable) per non rompere letture storiche; nessuna funzione le usa piu'.
alter table laundry alter column room_min drop not null;
alter table laundry alter column room_max drop not null;

-- Seed: la sezione V (Valentino + Manica, un solo collegio in due edifici).
insert into section (code, number, name)
values ('V', 1, 'Valentino')
on conflict (code) do nothing;

insert into section_range (section_id, label, room_from, room_to, laundry_id, color)
select s.id, r.label, r.f, r.t, l.id, r.col
from section s
cross join (values
  ('Manica',            1,  50, 'manica',    '#f97316'),
  ('1° piano',        101, 136, 'valentino', '#eab308'),
  ('2° piano',        201, 236, 'valentino', '#22c55e'),
  ('3° piano',        301, 336, 'valentino', '#ef4444'),
  ('4° piano',        401, 436, 'valentino', '#3b82f6'),
  ('Basso fabbricato', 501, 536, 'valentino', '#a855f7')
) as r(label, f, t, lslug, col)
join laundry l on l.slug = r.lslug
where s.code = 'V'
  and not exists (select 1 from section_range x where x.section_id = s.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Identita' della camera: <lettera><numero>
-- ─────────────────────────────────────────────────────────────────────────────

-- La lettera (maiuscola) di una camera, o null.
create or replace function room_prefix(p_room text)
returns text language sql immutable as $$
  select substring(p_room from '^([A-Z]{1,2})[0-9]');
$$;

-- Il numero di una camera, senza lettera ne' suffisso a/b ("V21-b" -> 21).
create or replace function room_number(p_room text)
returns int language sql immutable as $$
  select nullif(substring(p_room from '^[A-Z]{1,2}([0-9]+)'), '')::int;
$$;

create or replace function section_of_room(p_room text)
returns smallint language sql stable as $$
  select id from section where code = room_prefix(p_room) and active limit 1;
$$;

-- L'intervallo (e quindi la lavanderia) di una camera. null = camera che non
-- esiste in nessuna sezione.
create or replace function laundry_for_room(p_room text)
returns smallint language sql stable as $$
  select r.laundry_id
  from section s
  join section_range r on r.section_id = s.id
  where s.code = room_prefix(p_room) and s.active
    and room_number(p_room) between r.room_from and r.room_to
  limit 1;
$$;

-- true se `p_room` e' una camera VERA: formato giusto, sezione attiva,
-- numero dentro uno degli intervalli. 'DIREZIONE' non e' una camera (chi la
-- ammette lo dice esplicitamente, come faceva prima del formato).
create or replace function is_valid_room(p_room text)
returns boolean language sql stable as $$
  select coalesce(
    p_room ~ '^[A-Z]{1,2}[0-9]{1,4}(-?[abAB])?$'
    and exists (
      select 1
      from section s
      join section_range r on r.section_id = s.id
      where s.code = room_prefix(p_room) and s.active
        and room_number(p_room) between r.room_from and r.room_to
    ), false);
$$;

-- Backfill + nuovi vincoli di formato. I vincoli di tabella restano di SOLO
-- formato (un CHECK non deve leggere altre tabelle): la verifica che la camera
-- esista davvero in una sezione la fanno is_valid_room() e il server.
do $$
begin
  alter table laundry_booking  drop constraint if exists laundry_booking_room_check;
  alter table recurring_booking drop constraint if exists recurring_booking_room_check;
  alter table bike             drop constraint if exists bike_room_check;

  update laundry_booking   set room = 'V' || room where room ~ '^[0-9]';
  update recurring_booking set room = 'V' || room where room ~ '^[0-9]';
  update bike              set room = 'V' || room where room ~ '^[0-9]';
  update push_sub          set room = 'V' || room where room ~ '^[0-9]';
  update telegram_sub      set room = 'V' || room where room ~ '^[0-9]';
  -- Le prenotazioni delle sale portano la camera nel campo `name` (chi ha
  -- prenotato): solo se e' una camera, non un nome libero come "Film club".
  update space_booking     set name = 'V' || name where name ~ '^[0-9]{1,4}(-?[abAB])?$';
  update recurring_booking set name = 'V' || name where kind = 'space' and name ~ '^[0-9]{1,4}(-?[abAB])?$';
  update feedback          set room = 'V' || room where room ~ '^[0-9]';
  update linen_change_notify_pref set room = 'V' || room where room ~ '^[0-9]';
  update grigliata_adesione set room = 'V' || room where room ~ '^[0-9]';
  update admin_account     set camera = 'V' || camera where camera ~ '^[0-9]';

  alter table laundry_booking  add constraint laundry_booking_room_check
    check (room = 'DIREZIONE' or room ~ '^[A-Z]{1,2}[0-9]{1,4}(-?[abAB])?$');
  alter table recurring_booking add constraint recurring_booking_room_check
    check (room is null or room = 'DIREZIONE' or room ~ '^[A-Z]{1,2}[0-9]{1,4}(-?[abAB])?$');
  alter table bike             add constraint bike_room_check
    check (room ~ '^[A-Z]{1,2}[0-9]{1,4}(-?[abAB])?$');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lettura pubblica della configurazione (sezioni, intervalli, lavanderie)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function section_public(p_id smallint)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'code', s.code, 'number', s.number, 'name', s.name,
    'features', s.features, 'shared_with', s.shared_with, 'active', s.active,
    'ranges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'label', r.label, 'from', r.room_from, 'to', r.room_to,
        'laundry_id', r.laundry_id, 'color', r.color
      ) order by r.room_from)
      from section_range r where r.section_id = s.id
    ), '[]'::jsonb)
  )
  from section s where s.id = p_id;
$$;

create or replace function section_config()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'sections', coalesce((
      select jsonb_agg(section_public(s.id) order by s.number) from section s
    ), '[]'::jsonb),
    'laundries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'slug', l.slug, 'name', l.name, 'pairs', l.n_pairs
      ) order by l.id) from laundry l
    ), '[]'::jsonb)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Amministrazione di sezioni e lavanderie (solo superadmin: lo decide il server)
-- ─────────────────────────────────────────────────────────────────────────────

-- p_ranges: [{"label":"Manica","from":1,"to":50,"laundry_id":2}, ...]
create or replace function section_admin_set_ranges(p_id smallint, p_ranges jsonb)
returns jsonb language plpgsql as $$
begin
  if not exists (select 1 from section where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'sezione non trovata');
  end if;
  if p_ranges is null or jsonb_typeof(p_ranges) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'intervalli non validi');
  end if;

  delete from section_range where section_id = p_id;
  insert into section_range (section_id, label, room_from, room_to, laundry_id, color)
  select p_id,
         left(btrim(x->>'label'), 40),
         (x->>'from')::smallint,
         (x->>'to')::smallint,
         nullif(x->>'laundry_id', '')::smallint,
         nullif(x->>'color', '')
  from jsonb_array_elements(p_ranges) x;

  return jsonb_build_object('ok', true, 'section', section_public(p_id));
exception
  when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'intervalli sovrapposti');
  when check_violation or invalid_text_representation or numeric_value_out_of_range
       or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'intervalli non validi');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'lavanderia inesistente');
end;
$$;

create or replace function section_admin_create(
  p_code text, p_number smallint, p_name text, p_features jsonb default '{}'::jsonb,
  p_ranges jsonb default '[]'::jsonb
) returns jsonb language plpgsql as $$
declare
  v_id smallint;
  v_r  jsonb;
begin
  insert into section (code, number, name, features)
  values (upper(btrim(p_code)),
          coalesce(p_number, (select coalesce(max(number), 0) + 1 from section)::smallint),
          btrim(p_name), coalesce(p_features, '{}'::jsonb))
  returning id into v_id;

  insert into room_space (slug, name, has_type, open_min, close_min, section_id)
  values ('cinema', 'Sala Cinema', true, 0, 1440, v_id),
         ('music',  'Sala Musica', false, 0, 1440, v_id);

  v_r := section_admin_set_ranges(v_id, coalesce(p_ranges, '[]'::jsonb));
  if not (v_r->>'ok')::boolean then
    raise exception 'ranges: %', v_r->>'error';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'section', section_public(v_id));
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'lettera o numero di sezione gia'' in uso');
  when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'dati della sezione non validi');
  when raise_exception then
    return jsonb_build_object('ok', false, 'error', replace(sqlerrm, 'ranges: ', ''));
end;
$$;

create or replace function section_admin_update(
  p_id smallint, p_name text default null, p_features jsonb default null, p_active boolean default null
) returns jsonb language plpgsql as $$
begin
  update section
  set name     = coalesce(nullif(btrim(p_name), ''), name),
      features = coalesce(p_features, features),
      active   = coalesce(p_active, active)
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sezione non trovata');
  end if;
  return jsonb_build_object('ok', true, 'section', section_public(p_id));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'dati della sezione non validi');
end;
$$;

-- Coppie lavatrice/asciugatrice: la lavatrice X prenota in automatico
-- l'asciugatrice X, quindi i due numeri sono lo stesso numero. Le macchine
-- oltre il conto restano nella tabella (client e funzioni indicizzano sempre
-- A-C) ma non prenotabili e segnate fuori servizio, come faceva la Manica.
create or replace function laundry_apply_pairs(p_laundry_id smallint)
returns void language plpgsql as $$
begin
  insert into machine (laundry_id, code, kind, bookable, is_oos, sort_order)
  select l.id, k.prefix || '-' || chr(64 + g), k.kind, true, false, k.base + g
  from laundry l
  cross join generate_series(1, l.n_pairs) g
  cross join (values ('W','washer',0), ('D','dryer',10)) as k(prefix, kind, base)
  where l.id = p_laundry_id
  on conflict (laundry_id, code) do nothing;

  update machine m
  set bookable   = (ascii(substring(m.code from 3 for 1)) - 64) <= l.n_pairs,
      is_oos     = case when (ascii(substring(m.code from 3 for 1)) - 64) <= l.n_pairs
                        then case when m.bookable then m.is_oos else false end
                        else true end,
      updated_at = now()
  from laundry l
  where l.id = p_laundry_id and m.laundry_id = l.id;
end;
$$;

create or replace function laundry_admin_create(p_slug text, p_name text, p_pairs smallint)
returns jsonb language plpgsql as $$
declare v_id smallint;
begin
  insert into laundry (slug, name, reminder_mode, n_pairs)
  values (lower(btrim(p_slug)), btrim(p_name), 'triple', p_pairs)
  returning id into v_id;
  perform laundry_apply_pairs(v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'identificativo lavanderia gia'' in uso');
  when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'error', 'dati della lavanderia non validi');
end;
$$;

create or replace function laundry_admin_update(
  p_id smallint, p_name text default null, p_pairs smallint default null
) returns jsonb language plpgsql as $$
begin
  update laundry
  set name    = coalesce(nullif(btrim(p_name), ''), name),
      n_pairs = coalesce(p_pairs, n_pairs)
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'lavanderia non trovata');
  end if;
  perform laundry_apply_pairs(p_id);
  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'dati della lavanderia non validi');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Segnalazioni: alla sezione giusta
-- ─────────────────────────────────────────────────────────────────────────────

alter table feedback add column if not exists section_id smallint references section(id) on delete set null;
update feedback f set section_id = section_of_room(f.room) where f.section_id is null and f.room is not null;
create index if not exists feedback_section_idx on feedback (section_id) where handled_at is null;


-- book_laundry: la camera deve esistere in una sezione (is_valid_room).
create or replace function book_laundry(
  p_room       text,
  p_day        integer,
  p_slot       integer,
  p_machine    text,
  p_as_admin   boolean default false,
  p_actor_room text default null
) returns jsonb language plpgsql as $$
declare
  v_l     laundry%rowtype;
  v_m     machine%rowtype;
  v_ws    date;
  v_id    bigint;
  v_by    text;
  v_actor smallint;
begin
  if p_room is null or not is_valid_room(p_room) then
    return jsonb_build_object('ok', false, 'error', 'camera mancante');
  end if;

  select * into v_l from laundry where id = laundry_for_room(p_room);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'camera non valida');
  end if;

  -- Il controllo nuovo. Si applica solo se l'app ha detto da dove sta agendo.
  -- DIREZIONE non passa di qui: la portineria usa book_as_direzione().
  if p_actor_room is not null and p_actor_room <> '' and p_actor_room <> 'DIREZIONE' then
    v_actor := laundry_for_room(p_actor_room);
    if v_actor is not null and v_actor <> v_l.id then
      return jsonb_build_object(
        'ok', false,
        'error', 'altra lavanderia',
        'lavanderia', v_l.name
      );
    end if;
  end if;

  if p_day not between 0 and 6 or p_slot not between 0 and v_l.n_slots - 1 then
    return jsonb_build_object('ok', false, 'error', 'parametri non validi');
  end if;

  -- `bookable = false` e `is_oos = true` sono due cose diverse:
  --  - bookable=false: la macchina non esiste fisicamente (es. W-B alla Manica).
  --    Prenotarla non ha senso, si rifiuta.
  --  - is_oos=true: la macchina c'è ma è guasta. Si può prenotare lo stesso,
  --    il client mostra un avviso.
  select * into v_m from machine where laundry_id = v_l.id and code = p_machine;
  if not found or not v_m.bookable then
    return jsonb_build_object('ok', false, 'error', 'macchina non valida');
  end if;

  -- Per i giorni 1-6 e' sempre la settimana corrente; per il giorno 0,
  -- durante la finestra di anteprima (vedi laundry_preview_active), e' gia'
  -- la settimana dopo.
  v_ws := laundry_week_start_for_day(v_l.id, p_day);

  -- La quota settimanale NON viene applicata qui: senza autenticazione la
  -- camera è auto-dichiarata, quindi il blocco fermava solo chi la rispettava
  -- già. Resta un'indicazione lato client.

  insert into laundry_booking (laundry_id, week_start, day, slot, machine_code, room, created_by)
  values (v_l.id, v_ws, p_day, p_slot, p_machine, p_room,
          case when p_as_admin then 'admin' else 'user' end)
  on conflict (laundry_id, week_start, day, slot, machine_code) do nothing
  returning id into v_id;

  if v_id is null then
    select room into v_by
    from laundry_booking
    where laundry_id = v_l.id and week_start = v_ws
      and day = p_day and slot = p_slot and machine_code = p_machine;

    -- La stringa 'occupata' è matchata da errMsg() nel client: non cambiarla.
    return jsonb_build_object('ok', false, 'error', 'occupata', 'by', v_by);
  end if;

  return jsonb_build_object(
    'ok', true,
    'week', week_snapshot_mixed(v_l.id),
    'status', status_snapshot(v_l.id)
  ) || case when v_m.is_oos
            then jsonb_build_object('warning', 'oos')
            else '{}'::jsonb
       end;
end;
$$;

-- telegram_create_code: stessa regola.
create or replace function telegram_create_code(p_room text)
returns jsonb language plpgsql as $$
declare
  v_lid  smallint;
  v_code text;
begin
  if p_room is null or (p_room <> 'DIREZIONE' and not is_valid_room(p_room)) then
    return jsonb_build_object('ok', false, 'error', 'camera non valida');
  end if;

  v_lid := coalesce(laundry_for_room(p_room), (select id from laundry where slug = 'valentino'));

  -- 8 caratteri senza vocali: niente parole leggibili per caso, e nessuna
  -- ambiguità fra 0/O e 1/I quando qualcuno lo ricopia a mano.
  v_code := upper(translate(encode(gen_random_bytes(8), 'base64'), 'AEIOUaeiou+/=', 'BCDFGHJKMN23'));
  v_code := left(v_code, 8);

  -- Un codice per volta per camera: rigenerandolo il precedente non vale più.
  delete from telegram_sub where room = p_room and verified_at is null;

  insert into telegram_sub (chat_id, room, laundry_id, link_code)
  values ('pending:' || v_code, p_room, v_lid, v_code);

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

-- account_set_camera: la camera deve esistere in una sezione.
create or replace function account_set_camera(p_id bigint, p_camera text)
returns jsonb language plpgsql as $$
declare
  v_ruolo text;
  v_camera text := nullif(btrim(coalesce(p_camera, '')), '');
begin
  select ruolo into v_ruolo from admin_account where id = p_id;
  if v_ruolo is null then
    return jsonb_build_object('ok', false, 'error', 'account non trovato');
  end if;
  if v_camera is not null and v_ruolo not in ('delegato', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'solo delegato e admin possono avere una camera');
  end if;
  if v_camera is not null and not is_valid_room(v_camera) then
    return jsonb_build_object('ok', false, 'error', 'numero di camera non valido');
  end if;

  update admin_account set camera = v_camera where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- recurring_add_laundry: la camera appartiene alla lavanderia se il suo
-- intervallo di sezione punta a quella lavanderia (anche se condivisa).
create or replace function recurring_add_laundry(
  p_laundry_id smallint, p_day int, p_slot int, p_machine text, p_room text, p_note text default null
) returns jsonb language plpgsql as $$
declare v_id bigint;
begin
  if not exists (select 1 from machine where laundry_id = p_laundry_id and code = p_machine and bookable) then
    return jsonb_build_object('ok', false, 'error', 'macchina non valida per questa lavanderia');
  end if;

  -- DIREZIONE non ha un numero e non appartiene a un intervallo: è l'unica
  -- eccezione, come nel resto dello schema.
  if p_room <> 'DIREZIONE' and laundry_for_room(p_room) is distinct from p_laundry_id then
    return jsonb_build_object('ok', false, 'error', 'quella camera non appartiene a questa lavanderia');
  end if;

  insert into recurring_booking (kind, laundry_id, day, slot, machine_code, room, note)
  values ('laundry', p_laundry_id, p_day, p_slot, p_machine, p_room, p_note)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'esiste già una regola per questo turno');
end;
$$;

-- admin_overview: intervalli e sezioni derivati da section_range.
create or replace function admin_overview()
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'laundries', coalesce(jsonb_agg(x order by x->>'slug'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', l.id,
      'slug', l.slug,
      'name', l.name,
      -- Il limite superiore del Valentino è una sentinella tecnica, non una
      -- regola della residenza: chi legge intende "dal 100 in su".
      -- Gli intervalli di camere (di ogni sezione) che usano questa lavanderia,
      -- a scopo di visualizzazione: "V 1–50, P 1–40".
      'rooms', coalesce((
        select string_agg(s.code || ' ' || r.room_from || '–' || r.room_to, ', '
                          order by s.number, r.room_from)
        from section_range r join section s on s.id = r.section_id
        where r.laundry_id = l.id), ''),
      -- Una camera qualsiasi di questa lavanderia, per le chiamate che
      -- risolvono la lavanderia dalla camera (vedi laundry_for_room).
      'sample_room', (
        select s.code || r.room_from
        from section_range r join section s on s.id = r.section_id
        where r.laundry_id = l.id and s.active
        order by s.number, r.room_from limit 1),
      'pairs', l.n_pairs,
      'sections', coalesce((
        select jsonb_agg(distinct r.section_id)
        from section_range r where r.laundry_id = l.id), '[]'::jsonb),
      'quota', l.weekly_quota,
      'reminders', l.reminder_mode,
      'week_start', current_laundry_week_start(l.id),
      'bookings', (select count(*) from laundry_booking b
                   where b.laundry_id = l.id and b.week_start = current_laundry_week_start(l.id)),
      'machines', (
        select jsonb_agg(jsonb_build_object(
          'code', m.code, 'kind', m.kind,
          'oos', m.is_oos, 'bookable', m.bookable,
          'updated_at', m.updated_at
        ) order by m.sort_order)
        from machine m where m.laundry_id = l.id
      )
    ) as x
    from laundry l
  ) s;
$$;

-- add_feedback: la segnalazione porta la sezione di chi l'ha scritta.
create or replace function add_feedback(p_room text, p_text text)
returns jsonb language plpgsql as $$
declare
  v_body text := left(btrim(coalesce(p_text, '')), 2000);
begin
  if v_body = '' then
    return jsonb_build_object('ok', false, 'error', 'feedback vuoto');
  end if;

  insert into feedback (laundry_id, room, body, section_id)
  values (laundry_for_room(p_room), nullif(btrim(coalesce(p_room, '')), ''), v_body,
          section_of_room(p_room));

  return jsonb_build_object('ok', true);
end;
$$;

-- admin_feedback: filtro per sezione. p_section_ids null = tutte (ambito
-- globale). Una segnalazione e' visibile a una sezione se e' sua, oppure se
-- riguarda una lavanderia che la sezione usa (condivisa con un'altra).
create or replace function admin_feedback(
  p_only_open boolean default true, p_limit int default 100,
  p_section_ids smallint[] default null
) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', f.id,
      'room', f.room,
      'body', f.body,
      'laundry', l.slug,
      'section_id', f.section_id,
      'created_at', f.created_at,
      'handled', f.handled_at is not null
    ) as x
    from feedback f
    left join laundry l on l.id = f.laundry_id
    where ((not p_only_open) or f.handled_at is null)
      and (
        p_section_ids is null
        or f.section_id = any(p_section_ids)
        or exists (select 1 from section_range r
                   where r.laundry_id = f.laundry_id and r.section_id = any(p_section_ids))
      )
    order by f.created_at desc
    limit p_limit
  ) s;
$$;

drop function if exists admin_feedback(boolean, int);


-- laundry_snapshot: aggiunge section/pairs/laundry.
create or replace function laundry_snapshot(p_room text default null)
returns jsonb language plpgsql stable as $$
declare
  v_id smallint;
  v_l  laundry%rowtype;
begin
  -- Fallback su 'valentino' come faceva getApiUrl() con "return API_URL"
  v_id := coalesce(laundry_for_room(p_room), (select id from laundry where slug = 'valentino'));
  select * into v_l from laundry where id = v_id;

  return jsonb_build_object(
    'ok',     true,
    'week',   week_snapshot_mixed(v_id),
    'status', status_snapshot(v_id),
    'slots',  v_l.n_slots,
    -- Tema stagionale attivo (vedi tema.sql): viaggia qui perche' questo e'
    -- gia' cio' che l'app legge a ogni avvio e a ogni ricarica automatica,
    -- senza bisogno di un secondo endpoint o di un canale dedicato.
    'tema',   app_theme_get(resource_section(section_of_room(p_room), 'theme')),
    -- Stessa scelta per il cambio biancheria del martedi' (vedi
    -- cambio-biancheria.sql): grande/piccolo/nessuno/null, gia' risolto per
    -- il martedi' di QUESTA settimana ('nessuno' = saltato di proposito,
    -- null = mai configurato). La finestra oraria in cui mostrarlo
    -- (martedi' 05:00-14:00) la decide il client, non questo campo.
    'cambio_biancheria', linen_change_current(resource_section(section_of_room(p_room), 'linen')),
    -- Solo il booleano (vedi grigliata.sql): decide se la scheda "Grigliata"
    -- compare in navigazione. Il contenuto vero lo legge grigliata_stato_pubblico()
    -- quando la scheda si apre davvero, non qui.
    'grigliata_attiva', grigliata_attiva_bool(resource_section(section_of_room(p_room), 'grigliata')),
    -- Sezione di chi guarda e coppie di macchine della sua lavanderia: il
    -- client non conosce piu' a priori "Manica = 1 coppia".
    'section', case when section_of_room(p_room) is null then null else section_public(section_of_room(p_room)) end,
    'pairs',   v_l.n_pairs,
    'laundry', jsonb_build_object('id', v_l.id, 'name', v_l.name)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Ogni risorsa e' della sua sezione (indipendente per default, condivisibile)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sale (cinema/musica), sala polivalente, cambio biancheria, grigliata e tema
-- appartengono a UNA sezione (section_id). Una sezione puo' scegliere di
-- usare invece la risorsa di un'altra (section.shared_with): resource_section()
-- risolve "di chi e' la risorsa che questa sezione usa".

create or replace function resource_section(p_section smallint, p_feature text)
returns smallint language sql stable as $$
  select case
    when p_feature in ('linen', 'theme') then (select min(id) from section)
    else coalesce(
      (select nullif(s.shared_with->>p_feature, '')::smallint from section s where s.id = p_section),
      p_section)
  end;
$$;

-- Chi puo' agire su una risorsa esistente? Il suo proprietario e le sezioni
-- che la condividono. Serve al server per controllare le azioni "per id"
-- (cancellare una prenotazione di sala, modificare un evento...) prima di
-- eseguirle. null = la risorsa non esiste.
create or replace function resource_actors(p_kind text, p_id bigint)
returns smallint[] language plpgsql stable as $$
declare
  v_owner smallint;
  v_feat  text;
begin
  if p_kind = 'conference_event' then
    select section_id into v_owner from conference_event where id = p_id; v_feat := 'conference';
  elsif p_kind = 'room_space' then
    select section_id into v_owner from room_space where id = p_id;
    select case slug when 'cinema' then 'cinema' else 'music' end into v_feat from room_space where id = p_id;
  elsif p_kind = 'space_booking' then
    select s.section_id, case s.slug when 'cinema' then 'cinema' else 'music' end into v_owner, v_feat
      from space_booking b join room_space s on s.id = b.space_id where b.id = p_id;
  elsif p_kind = 'grigliata_evento' then
    select section_id into v_owner from grigliata_evento where id = p_id; v_feat := 'grigliata';
  elsif p_kind = 'grigliata_adesione' then
    select e.section_id into v_owner from grigliata_adesione a join grigliata_evento e on e.id = a.evento_id where a.id = p_id;
    v_feat := 'grigliata';
  elsif p_kind = 'grigliata_ticket' then
    select e.section_id into v_owner from grigliata_ticket t
      join grigliata_adesione a on a.id = t.adesione_id join grigliata_evento e on e.id = a.evento_id where t.id = p_id;
    v_feat := 'grigliata';
  elsif p_kind = 'recurring_space' then
    select s.section_id, case s.slug when 'cinema' then 'cinema' else 'music' end into v_owner, v_feat
      from recurring_booking r join room_space s on s.id = r.space_id where r.id = p_id and r.kind = 'space';
  elsif p_kind = 'recurring_laundry' then
    return (select coalesce(array_agg(distinct sr.section_id), null)
            from recurring_booking r join section_range sr on sr.laundry_id = r.laundry_id
            where r.id = p_id and r.kind = 'laundry');
  elsif p_kind = 'push_sub' then
    select section_of_room(room) into v_owner from push_sub where id = p_id; v_feat := null;
  elsif p_kind = 'telegram_sub' then
    select section_of_room(room) into v_owner from telegram_sub where id = p_id; v_feat := null;
  else
    return null;
  end if;

  if v_owner is null then return null; end if;
  if v_feat is null then return array[v_owner]; end if;
  return array(select v_owner union select s.id from section s where s.shared_with->>v_feat = v_owner::text);
end;
$$;

-- Condividere una risorsa con un'altra sezione. p_shared: {"conference": 1}.
-- Si condivide solo con una sezione che la possiede davvero (niente catene:
-- se A usa quella di B, B non puo' a sua volta usare quella di C, e C non puo'
-- usare quella di A). Un valore null o una chiave assente = risorsa propria.
create or replace function section_admin_set_sharing(p_id smallint, p_shared jsonb)
returns jsonb language plpgsql as $$
declare
  k text;
  v smallint;
  v_new jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from section where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'sezione non trovata');
  end if;
  if p_shared is null or jsonb_typeof(p_shared) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'condivisioni non valide');
  end if;
  for k in select jsonb_object_keys(p_shared) loop
    if k not in ('cinema', 'music', 'conference', 'linen', 'grigliata', 'theme') then
      return jsonb_build_object('ok', false, 'error', 'risorsa non condivisibile: ' || k);
    end if;
    if jsonb_typeof(p_shared->k) = 'null' then continue; end if;
    v := (p_shared->>k)::smallint;
    if v = p_id then continue; end if;
    if not exists (select 1 from section where id = v and active) then
      return jsonb_build_object('ok', false, 'error', 'sezione inesistente o disattivata');
    end if;
    -- niente catene
    if coalesce((select s.shared_with->>k from section s where s.id = v), '') <> '' then
      return jsonb_build_object('ok', false, 'error', 'quella sezione usa a sua volta la risorsa di un''altra');
    end if;
    if exists (select 1 from section s where s.id <> p_id and s.shared_with->>k = p_id::text) then
      return jsonb_build_object('ok', false, 'error', 'altre sezioni usano gia'' la tua risorsa: non puoi usare quella di un''altra');
    end if;
    v_new := v_new || jsonb_build_object(k, v);
  end loop;
  update section set shared_with = v_new where id = p_id;
  return jsonb_build_object('ok', true, 'section', section_public(p_id));
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'error', 'condivisioni non valide');
end;
$$;

-- Colore e nome di un intervallo di camere (un piano, un edificio): li imposta
-- l'amministratore della sezione senza toccare i numeri.
create or replace function section_admin_set_range_style(p_range_id int, p_label text, p_color text)
returns jsonb language plpgsql as $$
declare v_sid smallint;
begin
  update section_range
  set label = coalesce(nullif(left(btrim(p_label), 40), ''), label),
      color = case when p_color is null then color else nullif(p_color, '') end
  where id = p_range_id
  returning section_id into v_sid;
  if v_sid is null then
    return jsonb_build_object('ok', false, 'error', 'intervallo non trovato');
  end if;
  return jsonb_build_object('ok', true, 'section', section_public(v_sid));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'colore non valido (es. #22c55e)');
end;
$$;

-- ── Sale ──────────────────────────────────────────────────────────────────
alter table room_space add column if not exists section_id smallint references section(id) on delete cascade;
update room_space set section_id = (select id from section where code = 'V') where section_id is null;
alter table room_space alter column section_id set not null;
alter table room_space drop constraint if exists room_space_slug_key;
create unique index if not exists room_space_section_slug_idx on room_space (section_id, slug);

-- ── Sala polivalente ──────────────────────────────────────────────────────
alter table conference_event add column if not exists section_id smallint references section(id) on delete cascade;
update conference_event set section_id = (select id from section where code = 'V') where section_id is null;
alter table conference_event alter column section_id set not null;
create index if not exists conference_event_section_idx on conference_event (section_id, dal, al);

-- ── Grigliata ─────────────────────────────────────────────────────────────
alter table grigliata_evento add column if not exists section_id smallint references section(id) on delete cascade;
update grigliata_evento set section_id = (select id from section where code = 'V') where section_id is null;
alter table grigliata_evento alter column section_id set not null;
create index if not exists grigliata_evento_section_idx on grigliata_evento (section_id, created_at desc);

-- ── Cambio biancheria: un'ancora per sezione ──────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'linen_change_anchor' and column_name = 'id') then
    alter table linen_change_anchor add column if not exists section_id smallint references section(id) on delete cascade;
    update linen_change_anchor set section_id = (select id from section where code = 'V');
    alter table linen_change_anchor drop column id;
    alter table linen_change_anchor alter column section_id set not null;
    alter table linen_change_anchor add primary key (section_id);
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'linen_change_skip' and column_name = 'skip_date')
     and not exists (select 1 from information_schema.columns where table_name = 'linen_change_skip' and column_name = 'section_id') then
    alter table linen_change_skip add column section_id smallint references section(id) on delete cascade;
    update linen_change_skip set section_id = (select id from section where code = 'V');
    alter table linen_change_skip alter column section_id set not null;
    alter table linen_change_skip drop constraint linen_change_skip_pkey;
    alter table linen_change_skip add primary key (section_id, skip_date);
  end if;
  -- ── Tema: uno per sezione ─────────────────────────────────────────────
  if exists (select 1 from information_schema.columns where table_name = 'app_theme' and column_name = 'id') then
    alter table app_theme add column if not exists section_id smallint references section(id) on delete cascade;
    update app_theme set section_id = (select id from section where code = 'V');
    alter table app_theme drop column id;
    alter table app_theme alter column section_id set not null;
    alter table app_theme add primary key (section_id);
  end if;
end $$;


drop function if exists space_bookings(text);
create or replace function space_bookings(p_slug text, p_section_id smallint default null)
returns jsonb language plpgsql stable as $$
declare
  v_sid    smallint;
  v_chiuso boolean;
  v_ws     date;
begin
  select id, chiuso into v_sid, v_chiuso from room_space where slug = p_slug and section_id = p_section_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'sala non valida'); end if;

  v_ws := current_week_start('Europe/Rome');

  return jsonb_build_object('ok', true, 'chiuso', v_chiuso, 'bookings', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',    b.id::text,
      'day',   b.day,
      'start', b.start_min,
      'end',   b.end_min,
      'name',  b.name,
      'type',  b.btype,
      'group', b.group_id::text
    )) order by b.day, b.start_min)
    from space_booking b
    where b.space_id = v_sid and b.week_start = v_ws
  ), '[]'::jsonb));
end;
$$;

drop function if exists book_space(text, integer, integer, integer, text, text);
create or replace function book_space(
  p_slug  text,
  p_day   integer,
  p_start integer,
  p_end   integer,
  p_name  text,
  p_type  text default null,
  p_section_id smallint default null
) returns jsonb language plpgsql as $$
declare
  v_s     room_space%rowtype;
  v_ws    date;
  v_end   int := p_end;
  v_cnt   int;
  v_name  text;
  v_type  text;
  v_gid   uuid;
  v_day2  int;
  v_ws2   date;
  v_coda  int;
begin
  select * into v_s from room_space where slug = p_slug and section_id = p_section_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'sala non valida'); end if;

  -- Chiusa per il deposito dei pacchi (o un altro motivo operativo, vedi
  -- schema.sql): rifiuta QUALUNQUE prenotazione nuova, residente o
  -- Direzione — book_space_as_direzione() delega qui, quindi è lo stesso
  -- controllo per entrambe le vie, non due copie da tenere allineate.
  if v_s.chiuso then
    return jsonb_build_object('ok', false, 'error', 'chiusa');
  end if;

  if p_name is null or btrim(p_name) = '' then
    return jsonb_build_object('ok', false, 'error', 'nome mancante');
  end if;
  if p_day not between 0 and 6 then
    return jsonb_build_object('ok', false, 'error', 'giorno non valido');
  end if;
  if p_start is null or p_start < 0 or p_start > 1439 then
    return jsonb_build_object('ok', false, 'error', 'orario non valido');
  end if;

  -- Semantica di parseRange_: una fascia che scavalca la mezzanotte arriva con
  -- end <= start e si riporta a end + 1440.
  if v_end <= p_start then v_end := v_end + 1440; end if;
  if v_end - p_start > 1440 then
    return jsonb_build_object('ok', false, 'error', 'durata non valida');
  end if;

  v_ws   := current_week_start('Europe/Rome');
  v_name := left(btrim(p_name), 40);
  v_type := case when v_s.has_type then p_type else null end;

  -- Il giorno dopo. Dopo la domenica non c'è un "giorno 7" nella griglia
  -- settimanale: c'è il lunedì della settimana SEGUENTE, che è una riga con un
  -- altro week_start. È l'unico posto in cui quelle ore esistono davvero, e
  -- metterla sul lunedì della settimana in corso — sei giorni PRIMA — è il
  -- difetto che ha corretto la migrazione 018.
  v_day2 := (p_day + 1) % 7;
  v_ws2  := case when p_day = 6 then v_ws + 7 else v_ws end;
  v_coda := v_end - 1440;   -- > 0 solo se si scavalca

  -- Il tetto giornaliero va verificato su TUTTI i giorni che la prenotazione
  -- tocca, non solo su quello di partenza — e ogni giorno con la SUA settimana,
  -- perché per la domenica i due non stanno più nella stessa.
  select max(n) into v_cnt from (
    select count(*) as n
    from space_booking
    where space_id = v_s.id and week_start = v_ws and day = p_day
    union all
    select count(*)
    from space_booking
    where v_coda > 0
      and space_id = v_s.id and week_start = v_ws2 and day = v_day2
  ) t;

  if coalesce(v_cnt, 0) >= v_s.max_per_day then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;

  begin
    if v_coda > 0 then
      v_gid := gen_random_uuid();

      -- Testa: dall'inizio fino a mezzanotte.
      insert into space_booking (space_id, week_start, day, start_min, end_min, name, btype, group_id)
      values (v_s.id, v_ws, p_day, p_start, 1440, v_name, v_type, v_gid);

      -- Coda: da mezzanotte alla fine, sul giorno successivo. È questa riga a
      -- rendere la notte visibile al vincolo anti-sovrapposizione del giorno
      -- dopo — il motivo per cui esiste la divisione.
      insert into space_booking (space_id, week_start, day, start_min, end_min, name, btype, group_id)
      values (v_s.id, v_ws2, v_day2, 0, v_coda, v_name, v_type, v_gid);
    else
      insert into space_booking (space_id, week_start, day, start_min, end_min, name, btype)
      values (v_s.id, v_ws, p_day, p_start, v_end, v_name, v_type);
    end if;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'overlap');
  end;

  return space_bookings(p_slug, p_section_id);
end;
$$;

drop function if exists delete_space_booking(text, text);
create or replace function delete_space_booking(p_slug text, p_id text, p_section_id smallint default null)
returns jsonb language plpgsql as $$
declare
  v_sid smallint;
  v_bid bigint;
  v_gid uuid;
begin
  select id into v_sid from room_space where slug = p_slug and section_id = p_section_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'sala non valida'); end if;

  v_bid := nullif(regexp_replace(p_id, '\D', '', 'g'), '')::bigint;

  select group_id into v_gid
  from space_booking where space_id = v_sid and id = v_bid;

  if v_gid is not null then
    delete from space_booking where space_id = v_sid and group_id = v_gid;
  else
    delete from space_booking where space_id = v_sid and id = v_bid;
  end if;

  return space_bookings(p_slug, p_section_id);
end;
$$;

drop function if exists admin_spaces();
create or replace function admin_spaces(p_section_id smallint default null)
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(x order by x->>'space', x->>'day'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', b.id, 'space', s.slug, 'section_id', s.section_id, 'day', b.day,
      'start', b.start_min, 'end', b.end_min,
      'name', b.name, 'type', b.btype
    ) as x
    from space_booking b
    join room_space s on s.id = b.space_id
    where b.week_start = current_week_start('Europe/Rome')
      and (p_section_id is null or s.section_id = p_section_id)
  ) t;
$$;

drop function if exists space_admin_set_chiuso(text, boolean);
create or replace function space_admin_set_chiuso(p_slug text, p_chiuso boolean, p_section_id smallint default null)
returns jsonb language plpgsql as $$
begin
  update room_space set chiuso = coalesce(p_chiuso, false) where slug = p_slug and section_id = p_section_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sala non valida');
  end if;
  return jsonb_build_object('ok', true, 'slug', p_slug, 'chiuso', coalesce(p_chiuso, false));
end;
$$;

drop function if exists book_space_as_direzione(text, int, int, int, text);
create or replace function book_space_as_direzione(
  p_slug text, p_day int, p_start int, p_end int, p_type text default null, p_section_id smallint default null
) returns jsonb language sql as $$
  select book_space(p_slug, p_day, p_start, p_end, 'DIREZIONE', p_type, p_section_id);
$$;

drop function if exists conference_agenda(int);
create or replace function conference_agenda(p_giorni int default 30, p_section_id smallint default null)
returns jsonb language plpgsql stable as $$
declare
  v_da   date := (now() at time zone 'Europe/Rome')::date;
  v_a    date := v_da + greatest(1, least(p_giorni, 400));
  v_ora  time := (now() at time zone 'Europe/Rome')::time;
  v_occorrenze jsonb;
  v_ora_fine time;
  v_titolo   text;
  v_note     text;
begin
  select coalesce(jsonb_agg(x order by x->>'data', x->>'inizio'), '[]'::jsonb)
  into v_occorrenze
  from (
    select jsonb_build_object(
             'id',     e.id,
             'titolo', coalesce(x.titolo, e.titolo),
             'note',   coalesce(x.note, e.note),
             -- g.d e' un timestamp: senza il cast usciva "2026-10-07T00:00:00"
             -- e il client, che ci concatena l'ora, non sapeva piu' leggerlo.
             'data',   coalesce(x.nuova_data, g.d::date),
             'inizio', to_char(coalesce(x.ora_inizio, e.ora_inizio), 'HH24:MI'),
             'fine',   to_char(coalesce(x.ora_fine,   e.ora_fine),   'HH24:MI'),
             'ricorrente', e.giorno_settimana is not null and e.al > e.dal,
             -- I campi della REGOLA, per precompilare il modulo di modifica
             -- senza un secondo giro di rete.
             'dal', e.dal, 'al', e.al, 'giorno', e.giorno_settimana,
             -- La data con cui questa occorrenza va nominata quando la si
             -- vuole annullare o spostare: e' la data che la REGOLA produce,
             -- non quella a cui si vede. Senza, spostare due volte lo stesso
             -- incontro creerebbe una seconda eccezione invece di correggere
             -- la prima.
             'data_regola', g.d::date,
             'spostata', x.id is not null
           ) as x
    from (select * from conference_event where section_id = p_section_id) e
    cross join lateral generate_series(
      greatest(e.dal, v_da)::timestamp,
      least(e.al, v_a)::timestamp,
      interval '1 day'
    ) g(d)
    left join conference_eccezione x
      on x.event_id = e.id and x.data_originale = g.d::date
    where (e.giorno_settimana is null
           or extract(isodow from g.d)::int - 1 = e.giorno_settimana)
      and (x.id is null or x.tipo <> 'annullata')
  ) s;

  -- Occupata adesso, e da cosa. Guarda sia le occorrenze che la regola
  -- produce oggi (saltando le annullate), sia quelle SPOSTATE a oggi da un
  -- altro giorno: un incontro anticipato a venerdì occupa la sala di venerdì,
  -- e non accorgersene qui direbbe "libera" con la gente dentro.
  select ora_fine, titolo, note into v_ora_fine, v_titolo, v_note
  from (
    -- occorrenze naturali di oggi, non annullate e non spostate altrove
    select coalesce(x.ora_inizio, e.ora_inizio) as ora_inizio,
           coalesce(x.ora_fine,   e.ora_fine)   as ora_fine,
           coalesce(x.titolo, e.titolo)         as titolo,
           coalesce(x.note,   e.note)           as note
    from (select * from conference_event where section_id = p_section_id) e
    left join conference_eccezione x
      on x.event_id = e.id and x.data_originale = v_da
    where v_da between e.dal and e.al
      and (e.giorno_settimana is null
           or extract(isodow from v_da)::int - 1 = e.giorno_settimana)
      and (x.id is null or (x.tipo = 'spostata' and coalesce(x.nuova_data, v_da) = v_da))

    union all

    -- incontri spostati DA un altro giorno A oggi
    select coalesce(x.ora_inizio, e.ora_inizio),
           coalesce(x.ora_fine,   e.ora_fine),
           coalesce(x.titolo, e.titolo),
           coalesce(x.note,   e.note)
    from conference_eccezione x
    join conference_event e on e.id = x.event_id and e.section_id = p_section_id
    where x.tipo = 'spostata' and x.nuova_data = v_da and x.data_originale <> v_da
  ) oggi
  where v_ora >= ora_inizio and v_ora < ora_fine
  order by ora_fine desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'occupata_adesso', v_ora_fine is not null,
    'libera_dalle', to_char(v_ora_fine, 'HH24:MI'),
    'evento_adesso', v_titolo,
    'note_adesso', v_note,
    'occorrenze', v_occorrenze
  );
end;
$$;

drop function if exists conference_add(text, text, text, date, date, int, text, text);
create or replace function conference_add(
  p_titolo text,
  p_ora_inizio text,
  p_ora_fine text,
  p_dal date,
  p_al date,
  p_giorno_settimana int default null,
  p_note text default null,
  p_attore text default null,
  p_section_id smallint default null
) returns jsonb language plpgsql as $$
declare
  v_in     time := p_ora_inizio::time;
  v_fi     time := p_ora_fine::time;
  -- Un evento di un giorno solo non ha una cadenza settimanale: vedi 010.
  v_giorno int  := case when p_dal = p_al then null else p_giorno_settimana end;
  v_conflitto text;
  v_quando    date;
begin
  if p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'sezione mancante');
  end if;
  if p_titolo is null or btrim(p_titolo) = '' then
    return jsonb_build_object('ok', false, 'error', 'titolo mancante');
  end if;
  if v_fi <= v_in then
    return jsonb_build_object('ok', false, 'error', 'orario non valido');
  end if;
  if p_al < p_dal then
    return jsonb_build_object('ok', false, 'error', 'periodo non valido');
  end if;
  if p_al - p_dal > 400 then
    return jsonb_build_object('ok', false, 'error', 'periodo troppo lungo');
  end if;
  if v_giorno is not null and v_giorno not between 0 and 6 then
    return jsonb_build_object('ok', false, 'error', 'giorno non valido');
  end if;

  -- Il primo giorno in cui le due regole si incontrano davvero. Se non esiste,
  -- non c'è conflitto, per quanto i periodi si sovrappongano.
  select e.titolo, g.d::date into v_conflitto, v_quando
  from (select * from conference_event where section_id = p_section_id) e
  cross join lateral generate_series(
    greatest(e.dal, p_dal)::timestamp,
    least(e.al, p_al)::timestamp,
    interval '1 day'
  ) g(d)
  where v_in < e.ora_fine and e.ora_inizio < v_fi
    and (e.giorno_settimana is null or extract(isodow from g.d)::int - 1 = e.giorno_settimana)
    and (v_giorno is null              or extract(isodow from g.d)::int - 1 = v_giorno)
  order by g.d
  limit 1;

  if v_conflitto is not null then
    -- `quando` in più rispetto a prima: con una regola annuale sapere CHE si
    -- sovrappone senza sapere DOVE lascia l'amministratore a cercare a mano
    -- fra cinquanta occorrenze.
    return jsonb_build_object('ok', false, 'error', 'sovrapposto',
                              'con', v_conflitto, 'quando', v_quando);
  end if;

  insert into conference_event (titolo, ora_inizio, ora_fine, dal, al, giorno_settimana, note, creato_da, section_id)
  values (left(btrim(p_titolo), 60), v_in, v_fi, p_dal, p_al, v_giorno,
          nullif(btrim(coalesce(p_note, '')), ''), p_attore, p_section_id);

  return conference_agenda(60, p_section_id);
end;
$$;

create or replace function conference_update(
  p_id bigint,
  p_titolo text,
  p_ora_inizio text,
  p_ora_fine text,
  p_dal date,
  p_al date,
  p_giorno_settimana int default null,
  p_note text default null
) returns jsonb language plpgsql as $$
declare
  v_in     time := p_ora_inizio::time;
  v_fi     time := p_ora_fine::time;
  v_giorno int  := case when p_dal = p_al then null else p_giorno_settimana end;
  v_conflitto text;
  v_quando    date;
begin
  if not exists (select 1 from conference_event where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'evento non trovato');
  end if;
  if p_titolo is null or btrim(p_titolo) = '' then
    return jsonb_build_object('ok', false, 'error', 'titolo mancante');
  end if;
  if v_fi <= v_in then
    return jsonb_build_object('ok', false, 'error', 'orario non valido');
  end if;
  if p_al < p_dal then
    return jsonb_build_object('ok', false, 'error', 'periodo non valido');
  end if;
  if p_al - p_dal > 400 then
    return jsonb_build_object('ok', false, 'error', 'periodo troppo lungo');
  end if;
  if v_giorno is not null and v_giorno not between 0 and 6 then
    return jsonb_build_object('ok', false, 'error', 'giorno non valido');
  end if;

  -- Controllo esatto come nella 012/014, saltando se stessa e le occorrenze
  -- annullate dell'altra regola: una data che l'altro evento non occupa piu'
  -- non deve bloccare niente.
  select e.titolo, g.d::date into v_conflitto, v_quando
  from (select * from conference_event where section_id = (select section_id from conference_event where id = p_id)) e
  cross join lateral generate_series(
    greatest(e.dal, p_dal)::timestamp,
    least(e.al, p_al)::timestamp,
    interval '1 day'
  ) g(d)
  left join conference_eccezione x
    on x.event_id = e.id and x.data_originale = g.d::date
  where e.id <> p_id
    and v_in < coalesce(x.ora_fine, e.ora_fine)
    and coalesce(x.ora_inizio, e.ora_inizio) < v_fi
    and (e.giorno_settimana is null or extract(isodow from g.d)::int - 1 = e.giorno_settimana)
    and (v_giorno is null              or extract(isodow from g.d)::int - 1 = v_giorno)
    and (x.id is null or x.tipo <> 'annullata')
  order by g.d
  limit 1;

  if v_conflitto is not null then
    return jsonb_build_object('ok', false, 'error', 'sovrapposto',
                              'con', v_conflitto, 'quando', v_quando);
  end if;

  update conference_event
  set titolo = left(btrim(p_titolo), 60),
      ora_inizio = v_in, ora_fine = v_fi,
      dal = p_dal, al = p_al, giorno_settimana = v_giorno,
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id;

  -- Potatura delle eccezioni rimaste fuori dal nuovo periodo o dalla nuova
  -- cadenza: senza, riallungando il periodo tornerebbero vive a sorpresa.
  delete from conference_eccezione
  where event_id = p_id
    and (data_originale < p_dal
         or data_originale > p_al
         or (v_giorno is not null
             and extract(isodow from data_originale)::int - 1 <> v_giorno));

  return conference_agenda(60, (select section_id from conference_event where id = p_id));
end;
$$;

create or replace function conference_skip(
  p_id bigint, p_data date, p_attore text default null
) returns jsonb language plpgsql as $$
begin
  if not exists (select 1 from conference_event where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'evento non trovato');
  end if;

  insert into conference_eccezione (event_id, data_originale, tipo, creato_da)
  values (p_id, p_data, 'annullata', p_attore)
  -- Se quell'incontro era gia' stato spostato, annullarlo vince: chi preme
  -- "annulla questo incontro" vuole che sparisca, non che resti dove l'aveva
  -- messo prima.
  on conflict (event_id, data_originale) do update
    set tipo = 'annullata', nuova_data = null, ora_inizio = null,
        ora_fine = null, titolo = null, note = null;

  return conference_agenda(60, (select section_id from conference_event where id = p_id));
end;
$$;

create or replace function conference_move(
  p_id bigint,
  p_data date,              -- la data che la REGOLA produce (RECURRENCE-ID)
  p_nuova_data date,
  p_ora_inizio text default null,
  p_ora_fine text default null,
  p_titolo text default null,
  p_note text default null,
  p_attore text default null
) returns jsonb language plpgsql as $$
declare
  v_in  time := nullif(p_ora_inizio, '')::time;
  v_fi  time := nullif(p_ora_fine, '')::time;
  v_ev  conference_event%rowtype;
  v_conflitto text;
begin
  select * into v_ev from conference_event where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'evento non trovato');
  end if;

  -- Orari effettivi dell'incontro spostato: quelli dati, o quelli della regola.
  v_in := coalesce(v_in, v_ev.ora_inizio);
  v_fi := coalesce(v_fi, v_ev.ora_fine);
  if v_fi <= v_in then
    return jsonb_build_object('ok', false, 'error', 'orario non valido');
  end if;

  -- Sovrapposizioni nella data di ARRIVO. Si guardano le occorrenze che
  -- cadono quel giorno per qualunque ALTRA regola, saltando quelle annullate
  -- e quelle a loro volta spostate via.
  select coalesce(x2.titolo, e2.titolo) into v_conflitto
  from (select * from conference_event where section_id = (select section_id from conference_event where id = p_id)) e2
  left join conference_eccezione x2
    on x2.event_id = e2.id and x2.data_originale = p_nuova_data
  where e2.id <> p_id
    and p_nuova_data between e2.dal and e2.al
    and (e2.giorno_settimana is null
         or extract(isodow from p_nuova_data)::int - 1 = e2.giorno_settimana)
    and (x2.id is null or (x2.tipo = 'spostata' and coalesce(x2.nuova_data, p_nuova_data) = p_nuova_data))
    and v_in < coalesce(x2.ora_fine, e2.ora_fine)
    and coalesce(x2.ora_inizio, e2.ora_inizio) < v_fi
  limit 1;

  if v_conflitto is not null then
    return jsonb_build_object('ok', false, 'error', 'sovrapposto',
                              'con', v_conflitto, 'quando', p_nuova_data);
  end if;

  insert into conference_eccezione (event_id, data_originale, tipo, nuova_data,
                                    ora_inizio, ora_fine, titolo, note, creato_da)
  values (p_id, p_data, 'spostata', p_nuova_data, v_in, v_fi,
          nullif(btrim(coalesce(p_titolo, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''), p_attore)
  -- Spostare due volte lo stesso incontro corregge l'eccezione, non ne
  -- aggiunge una seconda: `data_originale` resta il suo nome per sempre.
  on conflict (event_id, data_originale) do update
    set tipo = 'spostata', nuova_data = excluded.nuova_data,
        ora_inizio = excluded.ora_inizio, ora_fine = excluded.ora_fine,
        titolo = excluded.titolo, note = excluded.note;

  return conference_agenda(60, (select section_id from conference_event where id = p_id));
end;
$$;

create or replace function conference_reset_occorrenza(p_id bigint, p_data date)
returns jsonb language plpgsql as $$
begin
  delete from conference_eccezione where event_id = p_id and data_originale = p_data;
  return conference_agenda(60, (select section_id from conference_event where id = p_id));
end;
$$;

create or replace function conference_delete(p_id bigint)
returns jsonb language plpgsql as $$
declare v_sec smallint;
begin
  select section_id into v_sec from conference_event where id = p_id;
  delete from conference_event where id = p_id;
  return conference_agenda(60, v_sec);
end;
$$;

drop function if exists conference_rules();
create or replace function conference_rules(p_section_id smallint default null)
returns jsonb language plpgsql stable as $$
begin
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'titolo', titolo, 'note', note,
      'inizio', to_char(ora_inizio, 'HH24:MI'),
      'fine',   to_char(ora_fine,   'HH24:MI'),
      'dal', dal, 'al', al, 'giorno', giorno_settimana
    ) order by dal, ora_inizio)
    from conference_event
    where section_id = p_section_id
      and al >= (now() at time zone 'Europe/Rome')::date
  ), '[]'::jsonb));
end;
$$;

create or replace function grigliata_stato_pubblico(p_room text)
returns jsonb language plpgsql stable as $$
declare
  v_evento grigliata_evento%rowtype;
  v_adesione grigliata_adesione%rowtype;
begin
  select * into v_evento from grigliata_evento
    where section_id = resource_section(section_of_room(p_room), 'grigliata')
      and grigliata_visibile(chiuso, giorno_evento)
    order by created_at desc limit 1;

  if v_evento.id is null then
    return jsonb_build_object('ok', true, 'attiva', false);
  end if;

  select * into v_adesione from grigliata_adesione
    where evento_id = v_evento.id and room = coalesce(p_room, '');

  return jsonb_build_object(
    'ok', true,
    'attiva', true,
    'evento', jsonb_build_object(
      'id', v_evento.id,
      'titolo', v_evento.titolo,
      'scadenza', v_evento.scadenza,
      'iscrizioni_aperte', now() < v_evento.scadenza,
      'giorno_evento', v_evento.giorno_evento,
      'pagamenti_attivi', v_evento.pagamenti_attivi,
      'quota', v_evento.quota,
      'paypal_link', v_evento.paypal_link,
      'satispay_link', v_evento.satispay_link,
      'menu', grigliata_menu_di(v_evento.id)
    ),
    'mia_adesione', case when v_adesione.id is null then null else jsonb_build_object(
      'menu_id', v_adesione.menu_id,
      'dieta', v_adesione.dieta,
      'senza_glutine', v_adesione.senza_glutine,
      'note', v_adesione.note,
      'pagamento_dichiarato', v_adesione.pagamento_dichiarato,
      'pagamento_confermato', v_adesione.pagamento_confermato,
      'ticket', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', gt.id, 'nome', mt.nome, 'emoji', mt.emoji, 'usato', gt.usato, 'numero', gt.numero
        ) order by mt.posizione, mt.id)
        from grigliata_ticket gt
        join grigliata_menu_ticket mt on mt.id = gt.menu_ticket_id
        where gt.adesione_id = v_adesione.id
      ), '[]'::jsonb)
    ) end
  );
end;
$$;

create or replace function grigliata_usa_ticket(p_room text, p_ticket_id bigint)
returns jsonb language plpgsql as $$
declare
  v_evento_id bigint;
  v_adesione_id bigint;
  v_ticket grigliata_ticket%rowtype;
  v_ticket_nome text;
  v_ticket_emoji text;
  v_numero int;
begin
  select id into v_evento_id from grigliata_evento
    where section_id = resource_section(section_of_room(p_room), 'grigliata')
      and grigliata_visibile(chiuso, giorno_evento)
    order by created_at desc limit 1;

  if v_evento_id is null then
    return jsonb_build_object('ok', false, 'error', 'nessuna grigliata attiva');
  end if;

  select id into v_adesione_id
    from grigliata_adesione where evento_id = v_evento_id and room = p_room;

  if v_adesione_id is null then
    return jsonb_build_object('ok', false, 'error', 'devi prima aderire');
  end if;

  select * into v_ticket from grigliata_ticket where id = p_ticket_id and adesione_id = v_adesione_id;

  if v_ticket.id is null then
    return jsonb_build_object('ok', false, 'error', 'ticket non trovato');
  end if;

  if v_ticket.usato then
    return jsonb_build_object('ok', false, 'error', 'ticket già usato', 'ticket_numero', v_ticket.numero);
  end if;

  -- Prima si "prenota" il ticket (usato = true solo se non lo era già): di
  -- due tocchi quasi simultanei sullo stesso ticket ne passa uno solo.
  update grigliata_ticket set usato = true, usato_at = now()
    where id = v_ticket.id and not usato;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'ticket già usato');
  end if;

  update grigliata_evento set ticket_contatore = ticket_contatore + 1
    where id = v_evento_id
    returning ticket_contatore into v_numero;

  update grigliata_ticket set numero = v_numero where id = v_ticket.id;

  select nome, emoji into v_ticket_nome, v_ticket_emoji
    from grigliata_menu_ticket where id = v_ticket.menu_ticket_id;

  return jsonb_build_object('ok', true, 'ticket_numero', v_numero,
                            'ticket_nome', v_ticket_nome, 'ticket_emoji', v_ticket_emoji);
end;
$$;

create or replace function grigliata_iscrivi(
  p_room text, p_menu_id bigint, p_dieta text, p_senza_glutine boolean, p_note text
) returns jsonb language plpgsql as $$
declare
  v_evento grigliata_evento%rowtype;
  v_evento_id bigint;
  v_dieta text;
  v_note text;
begin
  select * into v_evento from grigliata_evento
    where section_id = resource_section(section_of_room(p_room), 'grigliata')
      and grigliata_visibile(chiuso, giorno_evento)
    order by created_at desc limit 1;

  if v_evento.id is null then
    return jsonb_build_object('ok', false, 'error', 'nessuna grigliata attiva');
  end if;
  v_evento_id := v_evento.id;

  -- La scheda può restare visibile a iscrizioni chiuse: solo QUESTA azione
  -- (iscriversi o cambiare scelta) si ferma alla scadenza.
  if now() >= v_evento.scadenza then
    return jsonb_build_object('ok', false, 'error', 'le iscrizioni sono chiuse');
  end if;

  -- Il menu deve essere uno di QUESTA grigliata, non di una precedente.
  if p_menu_id is null or not exists (
    select 1 from grigliata_menu where id = p_menu_id and evento_id = v_evento_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'scegli un menu');
  end if;

  v_dieta := case when p_dieta in ('vegetariano', 'vegano') then p_dieta else 'classico' end;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 300 then
    return jsonb_build_object('ok', false, 'error', 'nota troppo lunga (massimo 300 caratteri)');
  end if;

  insert into grigliata_adesione (evento_id, room, menu_id, dieta, senza_glutine, note, updated_at)
  values (v_evento_id, p_room, p_menu_id, v_dieta, coalesce(p_senza_glutine, false), v_note, now())
  on conflict (evento_id, room) do update
    set menu_id = excluded.menu_id,
        dieta = excluded.dieta,
        senza_glutine = excluded.senza_glutine,
        note = excluded.note,
        updated_at = now();

  -- Cambiare menu da già confermati cambia i ticket: quelli del menu nuovo.
  perform grigliata_allinea_ticket(v_evento_id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function grigliata_dichiara_pagamento(p_room text)
returns jsonb language plpgsql as $$
declare
  v_evento grigliata_evento%rowtype;
  v_id bigint;
begin
  select * into v_evento from grigliata_evento
    where section_id = resource_section(section_of_room(p_room), 'grigliata')
      and grigliata_visibile(chiuso, giorno_evento)
    order by created_at desc limit 1;

  if v_evento.id is null then
    return jsonb_build_object('ok', false, 'error', 'nessuna grigliata attiva');
  end if;

  if not v_evento.pagamenti_attivi then
    return jsonb_build_object('ok', false, 'error', 'i pagamenti non sono attivi per questa grigliata');
  end if;

  select id into v_id
    from grigliata_adesione where evento_id = v_evento.id and room = p_room;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'devi prima aderire');
  end if;

  update grigliata_adesione set pagamento_dichiarato = true, updated_at = now() where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists grigliata_attiva_bool();
create or replace function grigliata_attiva_bool(p_section_id smallint default null)
returns boolean language sql stable as $$
  select exists (select 1 from grigliata_evento where section_id = p_section_id and grigliata_visibile(chiuso, giorno_evento));
$$;

drop function if exists grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric);
create or replace function grigliata_admin_crea(
  p_titolo text, p_scadenza timestamptz, p_giorno_evento date, p_paypal text, p_satispay text, p_menu jsonb, p_attore text,
  -- default: il codice già in produzione (che non manda questo parametro)
  -- continua a funzionare fra l'applicazione di questa migrazione e il deploy.
  p_pagamenti_attivi boolean default true,
  p_quota numeric default null,
  p_section_id smallint default null
) returns jsonb language plpgsql as $$
declare
  v_id bigint;
  v_paypal text;
  v_satispay text;
  v_errore text;
  v_voce record;
  v_menu_id bigint;
  v_pagamenti boolean := coalesce(p_pagamenti_attivi, true);
begin
  if p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'sezione mancante');
  end if;

  -- La scadenza delle iscrizioni può anche essere già passata (v1.6): serve
  -- solo che ci sia. La visibilità della scheda dipende dal giorno della
  -- grigliata, non da questa.
  if p_scadenza is null then
    return jsonb_build_object('ok', false, 'error', 'indica la scadenza delle iscrizioni');
  end if;

  if p_giorno_evento is null then
    return jsonb_build_object('ok', false, 'error', 'indica il giorno della grigliata');
  end if;

  v_paypal := grigliata_normalizza_link(p_paypal);
  v_satispay := grigliata_normalizza_link(p_satispay);

  if v_pagamenti and v_paypal is null and v_satispay is null then
    return jsonb_build_object('ok', false, 'error', 'inserisci almeno un link per il pagamento (PayPal o Satispay)');
  end if;

  if p_quota is not null and (p_quota < 0 or p_quota > 1000) then
    return jsonb_build_object('ok', false, 'error', 'quota non valida (fra 0 e 1000 €)');
  end if;

  v_errore := grigliata_menu_errore(p_menu);
  if v_errore is not null then
    return jsonb_build_object('ok', false, 'error', v_errore);
  end if;

  update grigliata_evento set chiuso = true where not chiuso and section_id = p_section_id;

  insert into grigliata_evento (titolo, creato_da, scadenza, giorno_evento, paypal_link, satispay_link, pagamenti_attivi, quota, section_id)
  values (
    coalesce(nullif(btrim(coalesce(p_titolo, '')), ''), 'Grigliata'),
    p_attore, p_scadenza, p_giorno_evento, v_paypal, v_satispay, v_pagamenti, round(p_quota, 2), p_section_id
  )
  returning id into v_id;

  -- Un evento nuovo non ha menu (né voci-ticket) esistenti: un ciclo, non
  -- un'unica INSERT...SELECT, perché ogni menu appena creato deve portare
  -- subito le proprie voci — serve il suo id, che solo RETURNING dà.
  for v_voce in select e.value, e.ordinality from jsonb_array_elements(p_menu) with ordinality as e(value, ordinality) loop
    insert into grigliata_menu (evento_id, nome, posizione)
    values (v_id, btrim(v_voce.value->>'nome'), v_voce.ordinality - 1)
    returning id into v_menu_id;

    insert into grigliata_menu_ticket (menu_id, nome, emoji, posizione)
    select v_menu_id, btrim(t.value->>'nome'), nullif(btrim(coalesce(t.value->>'emoji', '')), ''), t.ordinality - 1
    from jsonb_array_elements(v_voce.value->'ticket') with ordinality as t(value, ordinality);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

drop function if exists grigliata_admin_overview();
create or replace function grigliata_admin_overview(p_section_id smallint default null)
returns jsonb language plpgsql stable as $$
declare
  v_evento grigliata_evento%rowtype;
begin
  select * into v_evento from grigliata_evento where section_id = p_section_id order by created_at desc limit 1;

  if v_evento.id is null then
    return jsonb_build_object('ok', true, 'evento', null, 'adesioni', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'evento', jsonb_build_object(
      'id', v_evento.id, 'titolo', v_evento.titolo, 'scadenza', v_evento.scadenza,
      'giorno_evento', v_evento.giorno_evento,
      'pagamenti_attivi', v_evento.pagamenti_attivi, 'quota', v_evento.quota,
      'paypal_link', v_evento.paypal_link, 'satispay_link', v_evento.satispay_link,
      'chiuso', v_evento.chiuso, 'attiva', grigliata_visibile(v_evento.chiuso, v_evento.giorno_evento),
      'iscrizioni_aperte', now() < v_evento.scadenza,
      'ticket_contatore', v_evento.ticket_contatore,
      'menu', grigliata_menu_di(v_evento.id)
    ),
    'adesioni', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'room', a.room, 'menu_id', a.menu_id, 'dieta', a.dieta,
        'senza_glutine', a.senza_glutine, 'note', a.note,
        'pagamento_dichiarato', a.pagamento_dichiarato, 'pagamento_confermato', a.pagamento_confermato,
        'confermato_da', a.confermato_da, 'confermato_at', a.confermato_at,
        'ticket', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', gt.id, 'menu_ticket_id', gt.menu_ticket_id,
            'nome', mt.nome, 'emoji', mt.emoji, 'usato', gt.usato, 'numero', gt.numero, 'usato_at', gt.usato_at
          ) order by mt.posizione, mt.id)
          from grigliata_ticket gt
          join grigliata_menu_ticket mt on mt.id = gt.menu_ticket_id
          where gt.adesione_id = a.id
        ), '[]'::jsonb)
      ) order by a.room)
      from grigliata_adesione a where a.evento_id = v_evento.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Cambio biancheria: ancora e martedi' saltati sono per sezione.
create or replace function linen_change_type_for(p_tuesday date, p_section_id smallint)
returns text language plpgsql stable as $$
declare
  v_ancora_data date;
  v_ancora_tipo text;
  v_settimane   int;
begin
  if exists (select 1 from linen_change_skip where skip_date = p_tuesday and section_id = p_section_id) then
    return 'nessuno';
  end if;

  select anchor_date, anchor_type into v_ancora_data, v_ancora_tipo
  from linen_change_anchor where section_id = p_section_id;

  if v_ancora_data is null then
    return null;   -- non ancora configurato
  end if;

  v_settimane := (p_tuesday - v_ancora_data) / 7;
  if mod(v_settimane, 2) = 0 then
    return v_ancora_tipo;
  end if;
  return case v_ancora_tipo when 'grande' then 'piccolo' else 'grande' end;
end;
$$;

create or replace function linen_change_current(p_section_id smallint default null)
returns text language sql stable as $$
  select linen_change_type_for(linen_change_current_tuesday(), p_section_id);
$$;

create or replace function linen_change_admin_get(p_section_id smallint default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'ancora_data', (select anchor_date from linen_change_anchor where section_id = p_section_id),
    'ancora_tipo', (select anchor_type from linen_change_anchor where section_id = p_section_id),
    'salta', coalesce((
      select jsonb_agg(skip_date order by skip_date)
      from linen_change_skip
      where section_id = p_section_id and skip_date >= current_date - interval '7 days'
    ), '[]'::jsonb)
  );
$$;

create or replace function linen_change_set_anchor(p_anchor_date date, p_anchor_type text, p_section_id smallint default null)
returns jsonb language plpgsql as $$
begin
  if p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'sezione mancante');
  end if;
  if p_anchor_type not in ('grande', 'piccolo') then
    return jsonb_build_object('ok', false, 'error', 'tipo non valido');
  end if;
  if extract(isodow from p_anchor_date) <> 2 then
    return jsonb_build_object('ok', false, 'error', 'la data deve essere un martedì');
  end if;

  insert into linen_change_anchor (section_id, anchor_date, anchor_type, updated_at)
  values (p_section_id, p_anchor_date, p_anchor_type, now())
  on conflict (section_id) do update
    set anchor_date = excluded.anchor_date,
        anchor_type = excluded.anchor_type,
        updated_at  = now();

  return jsonb_build_object('ok', true, 'ancora_data', p_anchor_date, 'ancora_tipo', p_anchor_type);
end;
$$;

create or replace function linen_change_set_skip(p_date date, p_skip boolean, p_section_id smallint default null)
returns jsonb language plpgsql as $$
begin
  if p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'sezione mancante');
  end if;
  if extract(isodow from p_date) <> 2 then
    return jsonb_build_object('ok', false, 'error', 'la data deve essere un martedì');
  end if;

  if p_skip then
    insert into linen_change_skip (section_id, skip_date) values (p_section_id, p_date) on conflict do nothing;
  else
    delete from linen_change_skip where section_id = p_section_id and skip_date = p_date;
  end if;

  return jsonb_build_object('ok', true, 'data', p_date, 'salta', p_skip);
end;
$$;

-- Il claim del cron: il tipo del martedi' dipende dalla sezione (dalla
-- risorsa che la camera usa), quindi le righe tornano come {room, tipo}.
create or replace function linen_change_claim_due_notifications(p_tz text default 'Europe/Rome')
returns jsonb language plpgsql as $$
declare
  v_oggi date := (now() at time zone p_tz)::date;
  v_ora time := (now() at time zone p_tz)::time;
  v_righe jsonb;
begin
  if extract(isodow from v_oggi) <> 2 then
    return jsonb_build_object('ok', true, 'righe', '[]'::jsonb);
  end if;

  insert into linen_change_notify_pref (room)
  select distinct btrim(room) from push_sub where btrim(room) <> ''
  union
  select distinct btrim(room) from telegram_sub
    where room is not null and btrim(room) <> '' and verified_at is not null
  on conflict (room) do nothing;

  with candidate as (
    select p.room, linen_change_type_for(v_oggi, resource_section(section_of_room(p.room), 'linen')) as tipo
    from linen_change_notify_pref p
    where p.enabled
      and p.notify_time <= v_ora
      and (p.last_notified_tuesday is null or p.last_notified_tuesday <> v_oggi)
  ), dovute as (
    update linen_change_notify_pref p
    set last_notified_tuesday = v_oggi
    from candidate c
    where p.room = c.room and c.tipo in ('grande', 'piccolo')
    returning p.room, c.tipo
  )
  select coalesce(jsonb_agg(jsonb_build_object('room', room, 'tipo', tipo)), '[]'::jsonb) into v_righe from dovute;

  return jsonb_build_object('ok', true, 'righe', v_righe);
end;
$$;

drop function if exists linen_change_type_for(date);
drop function if exists linen_change_current();
drop function if exists linen_change_admin_get();
drop function if exists linen_change_set_anchor(date, text);
drop function if exists linen_change_set_skip(date, boolean);

-- Tema: uno per sezione.
create or replace function app_theme_get(p_section_id smallint default null)
returns text language sql stable as $$
  select coalesce((select tema from app_theme where section_id = p_section_id), 'nessuno');
$$;

create or replace function sysadmin_set_theme(p_tema text, p_section_id smallint default null)
returns jsonb language plpgsql as $$
begin
  if p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'sezione mancante');
  end if;
  if p_tema not in ('nessuno', 'halloween', 'natale') then
    return jsonb_build_object('ok', false, 'error', 'tema non valido');
  end if;
  insert into app_theme (section_id, tema, updated_at) values (p_section_id, p_tema, now())
  on conflict (section_id) do update set tema = excluded.tema, updated_at = now();
  return jsonb_build_object('ok', true, 'tema', p_tema);
end;
$$;

drop function if exists app_theme_get();
drop function if exists sysadmin_set_theme(text);


drop function if exists apply_recurring(int);
create or replace function apply_recurring(p_offset int default 0, p_section_id smallint default null)
returns jsonb language plpgsql as $$
declare
  v_lav  int := 0;
  v_sale int := 0;
  v_skip int := 0;
  v_ws   date;
  r      record;
  v_id   bigint;
begin
  -- Lavanderia
  for r in
    select rb.*, l.tz from recurring_booking rb
    join laundry l on l.id = rb.laundry_id
    where rb.kind = 'laundry' and rb.active
      and (p_section_id is null or rb.laundry_id = any(array(select distinct laundry_id from section_range where section_id = p_section_id and laundry_id is not null)))
  loop
    v_ws := current_week_start(r.tz) + (p_offset * 7);

    insert into laundry_booking (laundry_id, week_start, day, slot, machine_code, room, created_by)
    values (r.laundry_id, v_ws, r.day, r.slot, r.machine_code, r.room, 'admin')
    on conflict (laundry_id, week_start, day, slot, machine_code) do nothing
    returning id into v_id;

    if v_id is null then v_skip := v_skip + 1; else v_lav := v_lav + 1; end if;
    v_id := null;
  end loop;

  -- Sale
  v_ws := current_week_start('Europe/Rome') + (p_offset * 7);
  for r in
    select * from recurring_booking where kind = 'space' and active
      and (p_section_id is null or space_id in (select id from room_space where section_id = p_section_id))
  loop
    begin
      insert into space_booking (space_id, week_start, day, start_min, end_min, name, btype, created_by)
      values (r.space_id, v_ws, r.day, r.start_min, r.end_min, r.name, r.btype, 'admin');
      v_sale := v_sale + 1;
    exception
      -- Sovrapposizione con qualcosa che c'è già: la regola cede.
      when exclusion_violation then v_skip := v_skip + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true, 'lavanderia', v_lav, 'sale', v_sale, 'saltate', v_skip
  );
end;
$$;

drop function if exists recurring_list();
create or replace function recurring_list(p_section_id smallint default null)
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(x order by x->>'kind', (x->>'day')::int), '[]'::jsonb))
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', rb.id, 'kind', rb.kind, 'day', rb.day, 'active', rb.active, 'note', rb.note,
      'laundry', l.name, 'laundry_id', rb.laundry_id,
      'slot', rb.slot, 'machine', rb.machine_code, 'room', rb.room,
      'space', s.slug, 'space_id', rb.space_id,
      'start', rb.start_min, 'end', rb.end_min, 'name', rb.name, 'type', rb.btype
    )) as x
    from recurring_booking rb
    left join laundry l on l.id = rb.laundry_id
    left join room_space s on s.id = rb.space_id
    where p_section_id is null
       or rb.laundry_id = any(array(select distinct laundry_id from section_range where section_id = p_section_id and laundry_id is not null))
       or rb.space_id in (select id from room_space where section_id = p_section_id)
  ) t;
$$;

drop function if exists sysadmin_purge(text, text);
create or replace function sysadmin_purge(p_scope text, p_sala text default null, p_section_id smallint default null)
returns jsonb language plpgsql as $$
declare
  v_out  jsonb := '{}'::jsonb;
  v_n    int;
  v_m    int;
  v_sala text := nullif(btrim(lower(coalesce(p_sala, ''))), '');
  -- 'musica' e' il nome che si legge; 'music' e' lo slug che sta in
  -- room_space fin dallo schema iniziale. La traduzione avviene qui, una
  -- volta, cosi' il chiamante nomina le sale come le nomina l'interfaccia.
  v_slug text;
  v_lids smallint[] := array(select distinct laundry_id from section_range where section_id = p_section_id and laundry_id is not null);
  v_code text := (select code from section where id = p_section_id);
  v_lun  date := current_week_start('Europe/Rome');
  v_dom  date := current_week_start('Europe/Rome') + 6;
begin
  if p_scope not in ('prenotazioni', 'settimana', 'segnalazioni', 'notifiche', 'ricorrenti', 'tutto') then
    return jsonb_build_object('ok', false, 'error', 'ambito non riconosciuto');
  end if;

  if v_sala is not null then
    if v_sala not in ('lavanderia', 'cinema', 'musica', 'polivalente') then
      return jsonb_build_object('ok', false, 'error', 'sala non riconosciuta');
    end if;
    if p_scope not in ('settimana', 'prenotazioni') then
      return jsonb_build_object('ok', false, 'error',
        'la singola sala vale solo per "settimana" e "prenotazioni"');
    end if;
  end if;

  v_slug := case v_sala when 'cinema' then 'cinema' when 'musica' then 'music' end;

  -- Solo la settimana corrente: il caso normale, per ripartire da zero senza
  -- perdere lo storico.
  if p_scope in ('settimana', 'tutto') then
    if v_sala is null or v_sala = 'lavanderia' then
      delete from laundry_booking where week_start = v_lun and (p_section_id is null or laundry_id = any(v_lids));
      get diagnostics v_n = row_count;
      v_out := v_out || jsonb_build_object('prenotazioni_settimana', v_n);
    end if;

    if v_sala is null or v_slug is not null then
      delete from space_booking
       where week_start = v_lun
         and (v_slug is null or space_id in (select id from room_space where slug = v_slug and (p_section_id is null or section_id = p_section_id)))
         and (p_section_id is null or space_id in (select id from room_space where section_id = p_section_id));
      get diagnostics v_n = row_count;
      v_out := v_out || jsonb_build_object(coalesce(v_sala, 'sale') || '_settimana', v_n);
    end if;

    -- La polivalente non ha settimane: ha REGOLE con un periodo di validita'.
    -- "Svuota la settimana" quindi non e' una DELETE sola.
    if v_sala is null or v_sala = 'polivalente' then
      -- Le regole che vivono solo dentro questa settimana (un evento singolo,
      -- un convegno di tre giorni) spariscono davvero: fuori di qui non
      -- lasciano niente.
      delete from conference_event where dal >= v_lun and al <= v_dom and (p_section_id is null or section_id = p_section_id);
      get diagnostics v_n = row_count;

      -- Quelle che vanno oltre restano — cancellarle si porterebbe via mesi
      -- di calendario per svuotare sette giorni. Le loro occorrenze di questa
      -- settimana si annullano una per una, con lo stesso meccanismo del
      -- pulsante "annulla questo incontro".
      --
      -- Si guarda la data EFFETTIVA (`nuova_data` se l'incontro e' stato
      -- spostato), non quella che la regola produrrebbe: un incontro portato
      -- via da questa settimana non c'entra piu' e non va toccato, uno
      -- portato dentro sta in questa settimana e va tolto. Per questo la
      -- finestra generata e' piu' larga di sette giorni. Le occorrenze gia'
      -- annullate si saltano, cosi' il conteggio dice quante ne sono sparite
      -- davvero.
      insert into conference_eccezione (event_id, data_originale, tipo, creato_da)
      select e.id, g.d::date, 'annullata', 'sistemista'
        from conference_event e
        cross join lateral generate_series(
          greatest(e.dal, v_lun - 31)::timestamp,
          least(e.al, v_dom + 31)::timestamp,
          interval '1 day'
        ) g(d)
        left join conference_eccezione x
          on x.event_id = e.id and x.data_originale = g.d::date
       where (p_section_id is null or e.section_id = p_section_id)
         and (e.giorno_settimana is null
              or extract(isodow from g.d)::int - 1 = e.giorno_settimana)
         and (x.id is null or x.tipo <> 'annullata')
         and coalesce(x.nuova_data, g.d::date) between v_lun and v_dom
      on conflict (event_id, data_originale) do update
        set tipo = 'annullata', nuova_data = null, ora_inizio = null,
            ora_fine = null, titolo = null, note = null;
      get diagnostics v_m = row_count;

      v_out := v_out || jsonb_build_object('polivalente_settimana', v_n + v_m);
    end if;
  end if;

  -- Tutto lo storico delle prenotazioni.
  if p_scope in ('prenotazioni', 'tutto') then
    if v_sala is null or v_sala = 'lavanderia' then
      delete from laundry_booking where id is not null and (p_section_id is null or laundry_id = any(v_lids));
      get diagnostics v_n = row_count;
      v_out := v_out || jsonb_build_object('prenotazioni', v_n);
    end if;

    if v_sala is null or v_slug is not null then
      delete from space_booking
       where id is not null
         and (v_slug is null or space_id in (select id from room_space where slug = v_slug and (p_section_id is null or section_id = p_section_id)))
         and (p_section_id is null or space_id in (select id from room_space where section_id = p_section_id));
      get diagnostics v_n = row_count;
      v_out := v_out || jsonb_build_object(coalesce(v_sala, 'sale'), v_n);
    end if;

    -- Le eccezioni se ne vanno da sole: `on delete cascade`.
    if v_sala is null or v_sala = 'polivalente' then
      delete from conference_event where id is not null and (p_section_id is null or section_id = p_section_id);
      get diagnostics v_n = row_count;
      v_out := v_out || jsonb_build_object('polivalente', v_n);
    end if;
  end if;

  if p_scope in ('segnalazioni', 'tutto') then
    delete from feedback where id is not null and (p_section_id is null or section_id = p_section_id);  get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('segnalazioni', v_n);
  end if;

  if p_scope in ('notifiche', 'tutto') then
    delete from push_sub where id is not null and (p_section_id is null or room_prefix(room) = v_code);      get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('push', v_n);
    delete from telegram_sub where id is not null and (p_section_id is null or room_prefix(room) = v_code);  get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('telegram', v_n);
  end if;

  if p_scope in ('ricorrenti', 'tutto') then
    delete from recurring_booking where id is not null and (p_section_id is null or laundry_id = any(v_lids) or space_id in (select id from room_space where section_id = p_section_id));  get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('ricorrenti', v_n);
  end if;

  if p_scope = 'tutto' then
    if p_section_id is null then delete from rate_limit where bucket is not null; end if;
    -- audit_log NON si cancella: serve proprio a sapere chi ha svuotato cosa.
    update machine set is_oos = not bookable where laundry_id is not null and (p_section_id is null or laundry_id = any(v_lids));
    v_out := v_out || jsonb_build_object('macchine_ripristinate', true);
  end if;

  return jsonb_build_object('ok', true, 'cancellati', v_out);
end;
$$;

drop function if exists sysadmin_conteggi();
create or replace function sysadmin_conteggi(p_section_id smallint default null)
returns jsonb language plpgsql stable as $$
declare
  v_lun date := current_week_start('Europe/Rome');
  v_dom date := current_week_start('Europe/Rome') + 6;
  v_lids smallint[] := array(select distinct laundry_id from section_range where section_id = p_section_id and laundry_id is not null);
  v_tot jsonb;
  v_set jsonb;
begin
  select jsonb_build_object(
    'lavanderia',  (select count(*) from laundry_booking where p_section_id is null or laundry_id = any(v_lids)),
    'cinema',      (select count(*) from space_booking b
                      join room_space s on s.id = b.space_id where s.slug = 'cinema' and (p_section_id is null or s.section_id = p_section_id)),
    'musica',      (select count(*) from space_booking b
                      join room_space s on s.id = b.space_id where s.slug = 'music' and (p_section_id is null or s.section_id = p_section_id)),
    -- Per la polivalente si contano le REGOLE, che sono le righe che la
    -- pulizia cancella: una regola ricorrente e' un incontro solo per chi la
    -- scrive, anche se produce trenta occorrenze.
    'polivalente', (select count(*) from conference_event where p_section_id is null or section_id = p_section_id)
  ) into v_tot;

  select jsonb_build_object(
    'lavanderia',  (select count(*) from laundry_booking where week_start = v_lun and (p_section_id is null or laundry_id = any(v_lids))),
    'cinema',      (select count(*) from space_booking b
                      join room_space s on s.id = b.space_id
                     where s.slug = 'cinema' and b.week_start = v_lun and (p_section_id is null or s.section_id = p_section_id)),
    'musica',      (select count(*) from space_booking b
                      join room_space s on s.id = b.space_id
                     where s.slug = 'music' and b.week_start = v_lun and (p_section_id is null or s.section_id = p_section_id)),
    -- Qui invece contano le OCCORRENZE: quello che si vede in agenda da
    -- lunedi' a domenica, annullate escluse. La finestra generata e' piu'
    -- larga della settimana perche' un incontro puo' essere stato spostato
    -- dentro o fuori: si guarda la data che ha davvero, non quella che la
    -- regola avrebbe prodotto.
    'polivalente', (
      select count(*)
        from conference_event e
        cross join lateral generate_series(
          greatest(e.dal, v_lun - 31)::timestamp,
          least(e.al, v_dom + 31)::timestamp,
          interval '1 day'
        ) g(d)
        left join conference_eccezione x
          on x.event_id = e.id and x.data_originale = g.d::date
       where (p_section_id is null or e.section_id = p_section_id)
         and (e.giorno_settimana is null
              or extract(isodow from g.d)::int - 1 = e.giorno_settimana)
         and (x.id is null or x.tipo <> 'annullata')
         and coalesce(x.nuova_data, g.d::date) between v_lun and v_dom
    )
  ) into v_set;

  return jsonb_build_object(
    'ok', true,
    'settimana_dal', v_lun,
    'totale', v_tot,
    'settimana', v_set
  );
end;
$$;

drop function if exists sysadmin_push_subs();
create or replace function sysadmin_push_subs(p_section_id smallint default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'camere_totali', (select count(distinct room) from push_sub),
    'dispositivi_totali', (select count(*) from push_sub),
    'iscrizioni', coalesce(
      jsonb_agg(x order by x->>'room', x->>'ultimo_avvio' desc) filter (where x is not null),
      '[]'::jsonb
    )
  )
  from (
    select jsonb_build_object(
      'id', s.id,
      'laundry', l.name,
      'room', s.room,
      'creato_il', s.created_at,
      'ultimo_avvio', s.last_seen
    ) as x
    from push_sub s
    join laundry l on l.id = s.laundry_id
    where p_section_id is null or room_prefix(s.room) = (select code from section where id = p_section_id)
  ) t;
$$;

drop function if exists sysadmin_telegram_subs();
create or replace function sysadmin_telegram_subs(p_section_id smallint default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'camere_totali', (select count(distinct room) from telegram_sub where verified_at is not null),
    'chat_totali', (select count(*) from telegram_sub where verified_at is not null),
    'iscrizioni', coalesce(
      jsonb_agg(x order by x->>'room', x->>'collegato_il' desc) filter (where x is not null),
      '[]'::jsonb
    )
  )
  from (
    select jsonb_build_object(
      'id', t.id,
      'laundry', l.name,
      'room', t.room,
      'collegato_il', t.verified_at
    ) as x
    from telegram_sub t
    join laundry l on l.id = t.laundry_id
    where t.verified_at is not null
      and (p_section_id is null or room_prefix(t.room) = (select code from section where id = p_section_id))
  ) tt;
$$;

drop function if exists sysadmin_all_push_subs(text);
create or replace function sysadmin_all_push_subs(p_room text default null, p_section_id smallint default null)
returns jsonb language sql stable as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth
    )),
    '[]'::jsonb
  )
  from push_sub
  where (p_room is null or room = p_room)
    and (p_section_id is null or room_prefix(room) = (select code from section where id = p_section_id));
$$;

drop function if exists sysadmin_all_telegram_subs(text);
create or replace function sysadmin_all_telegram_subs(p_room text default null, p_section_id smallint default null)
returns jsonb language sql stable as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('chat_id', chat_id)),
    '[]'::jsonb
  )
  from telegram_sub
  where verified_at is not null
    and (p_room is null or room = p_room)
    and (p_section_id is null or room_prefix(room) = (select code from section where id = p_section_id));
$$;

revoke all on function resource_section(smallint, text) from public, anon, authenticated;
revoke all on function resource_actors(text, bigint) from public, anon, authenticated;
revoke all on function section_admin_set_sharing(smallint, jsonb) from public, anon, authenticated;
revoke all on function section_admin_set_range_style(int, text, text) from public, anon, authenticated;
revoke all on function space_bookings(text, smallint) from public, anon, authenticated;
revoke all on function book_space(text, integer, integer, integer, text, text, smallint) from public, anon, authenticated;
revoke all on function delete_space_booking(text, text, smallint) from public, anon, authenticated;
revoke all on function admin_spaces(smallint) from public, anon, authenticated;
revoke all on function space_admin_set_chiuso(text, boolean, smallint) from public, anon, authenticated;
revoke all on function book_space_as_direzione(text, int, int, int, text, smallint) from public, anon, authenticated;
revoke all on function conference_agenda(int, smallint) from public, anon, authenticated;
revoke all on function conference_add(text, text, text, date, date, int, text, text, smallint) from public, anon, authenticated;
revoke all on function conference_update(bigint, text, text, text, date, date, int, text) from public, anon, authenticated;
revoke all on function conference_skip(bigint, date, text) from public, anon, authenticated;
revoke all on function conference_move(bigint, date, date, text, text, text, text, text) from public, anon, authenticated;
revoke all on function conference_reset_occorrenza(bigint, date) from public, anon, authenticated;
revoke all on function conference_delete(bigint) from public, anon, authenticated;
revoke all on function conference_rules(smallint) from public, anon, authenticated;
revoke all on function grigliata_attiva_bool(smallint) from public, anon, authenticated;
revoke all on function grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint) from public, anon, authenticated;
revoke all on function grigliata_admin_overview(smallint) from public, anon, authenticated;
revoke all on function linen_change_type_for(date, smallint) from public, anon, authenticated;
revoke all on function linen_change_current(smallint) from public, anon, authenticated;
revoke all on function linen_change_admin_get(smallint) from public, anon, authenticated;
revoke all on function linen_change_set_anchor(date, text, smallint) from public, anon, authenticated;
revoke all on function linen_change_set_skip(date, boolean, smallint) from public, anon, authenticated;
revoke all on function app_theme_get(smallint) from public, anon, authenticated;
revoke all on function sysadmin_set_theme(text, smallint) from public, anon, authenticated;
revoke all on function apply_recurring(int, smallint) from public, anon, authenticated;
revoke all on function recurring_list(smallint) from public, anon, authenticated;
revoke all on function sysadmin_purge(text, text, smallint) from public, anon, authenticated;
revoke all on function sysadmin_conteggi(smallint) from public, anon, authenticated;
revoke all on function sysadmin_push_subs(smallint) from public, anon, authenticated;
revoke all on function sysadmin_telegram_subs(smallint) from public, anon, authenticated;
revoke all on function sysadmin_all_push_subs(text, smallint) from public, anon, authenticated;
revoke all on function sysadmin_all_telegram_subs(text, smallint) from public, anon, authenticated;
grant execute on function resource_section(smallint, text) to service_role;
grant execute on function resource_actors(text, bigint) to service_role;
grant execute on function section_admin_set_sharing(smallint, jsonb) to service_role;
grant execute on function section_admin_set_range_style(int, text, text) to service_role;
grant execute on function space_bookings(text, smallint) to service_role;
grant execute on function book_space(text, integer, integer, integer, text, text, smallint) to service_role;
grant execute on function delete_space_booking(text, text, smallint) to service_role;
grant execute on function admin_spaces(smallint) to service_role;
grant execute on function space_admin_set_chiuso(text, boolean, smallint) to service_role;
grant execute on function book_space_as_direzione(text, int, int, int, text, smallint) to service_role;
grant execute on function conference_agenda(int, smallint) to service_role;
grant execute on function conference_add(text, text, text, date, date, int, text, text, smallint) to service_role;
grant execute on function conference_update(bigint, text, text, text, date, date, int, text) to service_role;
grant execute on function conference_skip(bigint, date, text) to service_role;
grant execute on function conference_move(bigint, date, date, text, text, text, text, text) to service_role;
grant execute on function conference_reset_occorrenza(bigint, date) to service_role;
grant execute on function conference_delete(bigint) to service_role;
grant execute on function conference_rules(smallint) to service_role;
grant execute on function grigliata_attiva_bool(smallint) to service_role;
grant execute on function grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint) to service_role;
grant execute on function grigliata_admin_overview(smallint) to service_role;
grant execute on function linen_change_type_for(date, smallint) to service_role;
grant execute on function linen_change_current(smallint) to service_role;
grant execute on function linen_change_admin_get(smallint) to service_role;
grant execute on function linen_change_set_anchor(date, text, smallint) to service_role;
grant execute on function linen_change_set_skip(date, boolean, smallint) to service_role;
grant execute on function app_theme_get(smallint) to service_role;
grant execute on function sysadmin_set_theme(text, smallint) to service_role;
grant execute on function apply_recurring(int, smallint) to service_role;
grant execute on function recurring_list(smallint) to service_role;
grant execute on function sysadmin_purge(text, text, smallint) to service_role;
grant execute on function sysadmin_conteggi(smallint) to service_role;
grant execute on function sysadmin_push_subs(smallint) to service_role;
grant execute on function sysadmin_telegram_subs(smallint) to service_role;
grant execute on function sysadmin_all_push_subs(text, smallint) to service_role;
grant execute on function sysadmin_all_telegram_subs(text, smallint) to service_role;
-- Cancellare una prenotazione / chiudere una segnalazione per id: se
-- l'amministratore ha un ambito limitato (p_section_ids non null) la funzione
-- rifiuta quelle che non sono della sua sezione. Le firme vecchie vanno
-- tolte: con due overload PostgREST non saprebbe quale chiamare.
create or replace function admin_delete_booking(p_id bigint, p_section_ids smallint[] default null)
returns jsonb language plpgsql as $$
declare v_n int;
begin
  if p_section_ids is not null and not exists (
    select 1 from laundry_booking b
    join section_range r on r.laundry_id = b.laundry_id
    where b.id = p_id and r.section_id = any(p_section_ids)
  ) then
    if exists (select 1 from laundry_booking where id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'fuori dal tuo ambito');
    end if;
    return jsonb_build_object('ok', false, 'error', 'prenotazione inesistente');
  end if;
  delete from laundry_booking where id = p_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'error', case when v_n = 0 then 'prenotazione inesistente' end);
end;
$$;

drop function if exists admin_delete_booking(bigint);

create or replace function admin_mark_feedback(
  p_id bigint, p_handled boolean default true, p_section_ids smallint[] default null
) returns jsonb language plpgsql as $$
begin
  if p_section_ids is not null and not exists (
    select 1 from feedback f
    where f.id = p_id and (
      f.section_id = any(p_section_ids)
      or exists (select 1 from section_range r
                 where r.laundry_id = f.laundry_id and r.section_id = any(p_section_ids))
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'fuori dal tuo ambito');
  end if;
  update feedback set handled_at = case when p_handled then now() else null end where id = p_id;
  return jsonb_build_object('ok', found);
end;
$$;

drop function if exists admin_mark_feedback(bigint, boolean);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Account amministrativi: ruolo superadmin e ambito per sezione
-- ─────────────────────────────────────────────────────────────────────────────

-- Ruoli (v2.0): superadmin (piattaforma), admin (UNA sezione), fdo, delegato.
-- Ogni account non superadmin appartiene a UNA sezione (section_id); il
-- superadmin non ne ha. 'sistemista' diventa 'admin' e 'staff' diventa 'fdo'
-- (vedi DEPLOY.md: lo staff guadagna le funzioni di portineria).
alter table admin_account add column if not exists section_id smallint references section(id);

alter table admin_account drop constraint if exists admin_account_ruolo_check;
update admin_account set ruolo = 'admin' where ruolo = 'sistemista';
update admin_account set ruolo = 'fdo'   where ruolo = 'staff';
update admin_account set section_id = (select id from section where code = 'V')
 where ruolo <> 'superadmin' and section_id is null;
alter table admin_account add constraint admin_account_ruolo_check
  check (ruolo in ('superadmin', 'admin', 'fdo', 'delegato'));
alter table admin_account drop constraint if exists admin_account_section_check;
alter table admin_account add constraint admin_account_section_check
  check ((ruolo = 'superadmin' and section_id is null) or (ruolo <> 'superadmin' and section_id is not null));

create or replace function account_by_username(p_username text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'username', username, 'password_hash', password_hash,
    'ruolo', ruolo, 'attivo', attivo, 'deve_cambiare_password', deve_cambiare_password,
    'camera', camera, 'section_id', section_id
  )
  from admin_account
  where username = p_username
  limit 1;
$$;

create or replace function account_list()
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'items', coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'username', username, 'ruolo', ruolo, 'attivo', attivo,
    'created_at', created_at, 'password_at', password_at,
    'deve_cambiare_password', deve_cambiare_password, 'camera', camera,
    'section_id', section_id
  ) order by created_at), '[]'::jsonb))
  from admin_account;
$$;

create or replace function account_create(
  p_username text, p_password_hash text, p_ruolo text, p_attore text default null,
  p_section_id smallint default null
) returns jsonb language plpgsql as $$
declare
  v_id bigint;
begin
  if p_ruolo not in ('superadmin', 'admin', 'fdo', 'delegato') then
    return jsonb_build_object('ok', false, 'error', 'ruolo non valido');
  end if;
  if p_ruolo <> 'superadmin' and p_section_id is null then
    return jsonb_build_object('ok', false, 'error', 'indica la sezione');
  end if;

  insert into admin_account (username, password_hash, ruolo, creato_da, section_id)
  values (p_username, p_password_hash, p_ruolo, p_attore,
          case when p_ruolo = 'superadmin' then null else p_section_id end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'nome utente gia'' in uso');
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', 'sezione inesistente');
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'nome utente non valido (3-24 caratteri, lettere/numeri/._-)');
end;
$$;

drop function if exists account_create(text, text, text, text);

create or replace function account_set_section(p_id bigint, p_section_id smallint)
returns jsonb language plpgsql as $$
begin
  update admin_account
  set section_id = case when ruolo = 'superadmin' then null else p_section_id end
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'account non trovato');
  end if;
  return jsonb_build_object('ok', true);
exception
  when foreign_key_violation or check_violation then
    return jsonb_build_object('ok', false, 'error', 'sezione non valida');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permessi: solo service_role (vedi permessi.sql per il perche')
-- ─────────────────────────────────────────────────────────────────────────────


revoke all on function room_prefix(text) from public, anon, authenticated;
revoke all on function room_number(text) from public, anon, authenticated;
revoke all on function section_of_room(text) from public, anon, authenticated;
revoke all on function laundry_for_room(text) from public, anon, authenticated;
revoke all on function is_valid_room(text) from public, anon, authenticated;
revoke all on function section_public(smallint) from public, anon, authenticated;
revoke all on function section_config() from public, anon, authenticated;
revoke all on function section_admin_set_ranges(smallint, jsonb) from public, anon, authenticated;
revoke all on function section_admin_create(text, smallint, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function section_admin_update(smallint, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function laundry_apply_pairs(smallint) from public, anon, authenticated;
revoke all on function laundry_admin_create(text, text, smallint) from public, anon, authenticated;
revoke all on function laundry_admin_update(smallint, text, smallint) from public, anon, authenticated;
revoke all on function book_laundry(text, integer, integer, text, boolean, text) from public, anon, authenticated;
revoke all on function telegram_create_code(text) from public, anon, authenticated;
revoke all on function account_set_camera(bigint, text) from public, anon, authenticated;
revoke all on function recurring_add_laundry(smallint, int, int, text, text, text) from public, anon, authenticated;
revoke all on function admin_overview() from public, anon, authenticated;
revoke all on function add_feedback(text, text) from public, anon, authenticated;
revoke all on function admin_feedback(boolean, int, smallint[]) from public, anon, authenticated;
revoke all on function admin_delete_booking(bigint, smallint[]) from public, anon, authenticated;
revoke all on function admin_mark_feedback(bigint, boolean, smallint[]) from public, anon, authenticated;
revoke all on function laundry_snapshot(text) from public, anon, authenticated;
revoke all on function account_by_username(text) from public, anon, authenticated;
revoke all on function account_list() from public, anon, authenticated;
revoke all on function account_create(text, text, text, text, smallint) from public, anon, authenticated;
revoke all on function account_set_section(bigint, smallint) from public, anon, authenticated;
grant execute on function room_prefix(text) to service_role;
grant execute on function room_number(text) to service_role;
grant execute on function section_of_room(text) to service_role;
grant execute on function laundry_for_room(text) to service_role;
grant execute on function is_valid_room(text) to service_role;
grant execute on function section_public(smallint) to service_role;
grant execute on function section_config() to service_role;
grant execute on function section_admin_set_ranges(smallint, jsonb) to service_role;
grant execute on function section_admin_create(text, smallint, text, jsonb, jsonb) to service_role;
grant execute on function section_admin_update(smallint, text, jsonb, boolean) to service_role;
grant execute on function laundry_apply_pairs(smallint) to service_role;
grant execute on function laundry_admin_create(text, text, smallint) to service_role;
grant execute on function laundry_admin_update(smallint, text, smallint) to service_role;
grant execute on function book_laundry(text, integer, integer, text, boolean, text) to service_role;
grant execute on function telegram_create_code(text) to service_role;
grant execute on function account_set_camera(bigint, text) to service_role;
grant execute on function recurring_add_laundry(smallint, int, int, text, text, text) to service_role;
grant execute on function admin_overview() to service_role;
grant execute on function add_feedback(text, text) to service_role;
grant execute on function admin_feedback(boolean, int, smallint[]) to service_role;
grant execute on function admin_delete_booking(bigint, smallint[]) to service_role;
grant execute on function admin_mark_feedback(bigint, boolean, smallint[]) to service_role;
grant execute on function laundry_snapshot(text) to service_role;
grant execute on function account_by_username(text) to service_role;
grant execute on function account_list() to service_role;
grant execute on function account_create(text, text, text, text, smallint) to service_role;
grant execute on function account_set_section(bigint, smallint) to service_role;
