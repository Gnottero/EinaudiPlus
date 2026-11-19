-- v2.1: gestione sezioni piu' chiara.
--   1. Coppie lavatrice/asciugatrice da 1 a 8 (lettere A-H), non piu' 1-3.
--   2. Numero di sezione automatico (max + 1) se non lo si indica.
--   3. Cambio biancheria e tema sono UNO per tutto il collegio: li possiede la
--      sezione con l'id piu' basso, tutte le altre li usano (nessuna condivisione
--      da configurare). Notifiche push/Telegram: sempre attive (lato server).
-- Consolidato in supabase/schema.sql e supabase/sezioni.sql. Idempotente.

-- 1. vincoli piu' larghi (si cercano per definizione: il nome e' autogenerato)
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as t, conname from pg_constraint
    where contype = 'c'
      and ((conrelid = 'machine'::regclass and pg_get_constraintdef(oid) like '%[WD]-[ABC]%')
        or (conrelid = 'laundry'::regclass and pg_get_constraintdef(oid) like '%n_pairs%'))
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
  end loop;
  alter table machine drop constraint if exists machine_code_check;
  alter table laundry drop constraint if exists laundry_n_pairs_check;
  alter table machine add constraint machine_code_check check (code ~ '^[WD]-[A-H]$');
  alter table laundry add constraint laundry_n_pairs_check check (n_pairs between 1 and 8);
end $$;

-- Crea le macchine che mancano (A..n) e allinea bookable/is_oos al conteggio.
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

-- 2. numero di sezione automatico
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

-- 3. risorse globali: stesso proprietario per tutte le sezioni.
create or replace function resource_section(p_section smallint, p_feature text)
returns smallint language sql stable as $$
  select case
    when p_feature in ('linen', 'theme') then (select min(id) from section)
    else coalesce(
      (select nullif(s.shared_with->>p_feature, '')::smallint from section s where s.id = p_section),
      p_section)
  end;
$$;
