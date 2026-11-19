-- v2.2: eventi di tipo diverso + rimozione di una sezione.
--   1. grigliata_evento.tipo: 'grigliata' (menu e ticket) o 'tombolata'. La tombolata
--      riusa tutto il flusso (iscrizioni, quota, pagamenti) con un menu interno unico
--      che l'app non mostra (lo crea adminCreaEvento): niente SQL in piu' da toccare.
--   2. section_admin_delete(id): elimina una sezione (cascade su intervalli, sale,
--      eventi, polivalente, ...). Rifiuta se: e' l'unica; e' la proprietaria di
--      cambio biancheria/tema (id piu' basso); ha account assegnati; un'altra
--      sezione ne usa una risorsa (shared_with).
-- Consolidato in supabase/sezioni.sql. Idempotente.

alter table grigliata_evento add column if not exists tipo text not null default 'grigliata';
alter table grigliata_evento drop constraint if exists grigliata_evento_tipo_check;
alter table grigliata_evento add constraint grigliata_evento_tipo_check check (tipo in ('grigliata', 'tombolata'));

drop function if exists grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint);
create or replace function grigliata_admin_crea(
  p_titolo text, p_scadenza timestamptz, p_giorno_evento date, p_paypal text, p_satispay text, p_menu jsonb, p_attore text,
  -- default: il codice già in produzione (che non manda questo parametro)
  -- continua a funzionare fra l'applicazione di questa migrazione e il deploy.
  p_pagamenti_attivi boolean default true,
  p_quota numeric default null,
  p_section_id smallint default null,
  p_tipo text default 'grigliata'
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

  if p_tipo is not null and p_tipo not in ('grigliata', 'tombolata') then
    return jsonb_build_object('ok', false, 'error', 'tipo di evento non valido');
  end if;

  update grigliata_evento set chiuso = true where not chiuso and section_id = p_section_id;

  insert into grigliata_evento (titolo, creato_da, scadenza, giorno_evento, paypal_link, satispay_link, pagamenti_attivi, quota, section_id, tipo)
  values (
    coalesce(nullif(btrim(coalesce(p_titolo, '')), ''), 'Grigliata'),
    p_attore, p_scadenza, p_giorno_evento, v_paypal, v_satispay, v_pagamenti, round(p_quota, 2), p_section_id, coalesce(p_tipo, 'grigliata')
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
      'tipo', v_evento.tipo,
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
      'id', v_evento.id, 'titolo', v_evento.titolo, 'tipo', v_evento.tipo, 'scadenza', v_evento.scadenza,
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
drop function if exists grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint);
revoke all on function grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint, text) from public, anon, authenticated;
grant execute on function grigliata_admin_crea(text, timestamptz, date, text, text, jsonb, text, boolean, numeric, smallint, text) to service_role;

create or replace function section_admin_delete(p_id smallint)
returns jsonb language plpgsql as $$
declare v_n int;
begin
  if not exists (select 1 from section where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'sezione non trovata');
  end if;
  if (select count(*) from section) <= 1 then
    return jsonb_build_object('ok', false, 'error', 'non si puo'' eliminare l''unica sezione');
  end if;
  if p_id = (select min(id) from section) then
    return jsonb_build_object('ok', false, 'error', 'e'' la sezione proprietaria di cambio biancheria e tema (la prima): non si elimina');
  end if;
  select count(*) into v_n from admin_account where section_id = p_id;
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'error',
      format('ha %s account assegnati: spostali o eliminali prima', v_n));
  end if;
  if exists (select 1 from section s, jsonb_each_text(s.shared_with) e
             where s.id <> p_id and nullif(e.value, '')::smallint = p_id) then
    return jsonb_build_object('ok', false, 'error', 'un''altra sezione ne usa delle risorse: togli prima la condivisione');
  end if;
  delete from section where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function section_admin_delete(smallint) from public, anon, authenticated;
grant execute on function section_admin_delete(smallint) to service_role;
