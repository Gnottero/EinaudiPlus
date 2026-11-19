#!/bin/bash
# Test SQL delle sezioni su un Postgres LOCALE usa-e-getta (docker). Non tocca
# mai Supabase. Due percorsi:
#   upgrade — schema attuale + dati "vecchio formato" + migrazioni 061 e 062;
#   rebuild — ricostruzione da zero coi file consolidati (con sezioni.sql).
# Uso: tests/sql/run.sh          (serve docker; scarica postgres:16-alpine)
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=pgtest-sezioni
q() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 "${@}"; }
fresh() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
  until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  sleep 2
  q -q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin; create extension if not exists pgcrypto;" >/dev/null
}
base() { for f in schema functions admin sysadmin polivalente account telegram reminders bici tema cambio-biancheria grigliata; do q -q < supabase/$f.sql >/dev/null; done; }

echo "== upgrade (vecchio formato -> 062) =="
fresh; base
q -q < tests/sql/legacy-seed.sql >/dev/null
q -q -1 < supabase/migrations/061-sezioni.sql >/dev/null
q -q -1 < supabase/migrations/061-sezioni.sql >/dev/null   # idempotente
q -q -1 < supabase/migrations/062-sezioni-ux.sql >/dev/null
q -q -1 < supabase/migrations/062-sezioni-ux.sql >/dev/null   # idempotente
q -q -1 < supabase/migrations/063-eventi-e-rimozione-sezione.sql >/dev/null
q -q -1 < supabase/migrations/063-eventi-e-rimozione-sezione.sql >/dev/null   # idempotente
q -t -c "select 'backfill: ' || (select string_agg(room, ',' order by id) from laundry_booking)" | grep -q "V112,V21-b,DIREZIONE" && echo "  ok    backfill V + DIREZIONE intatta"
q -t -c "select 'bike: ' || (select string_agg(room, ',' order by room) from bike)" | grep -q "V007,V112" && echo "  ok    backfill bici"
q -t -c "select 1 from space_booking where name = 'V112'" | grep -q 1 && echo "  ok    backfill nome sala = camera"
q -t -c "select 1 from space_booking where name = 'Film club'" | grep -q 1 && echo "  ok    nome libero della sala intatto"
q -t -c "select string_agg(username || ':' || ruolo || ':' || coalesce(section_id::text,'-'), ',' order by username) from admin_account" | grep -q "grigliatore:delegato:1,portinaio:fdo:1,sis:admin:1,stafffer:fdo:1" && echo "  ok    ruoli migrati (sistemista->admin, staff->fdo, tutti nella sezione V)" || { echo "  FAIL ruoli migrati"; exit 1; }
q -t -c "select (select count(*) from conference_event where section_id = 1)::text || (select count(*) from grigliata_evento where section_id = 1)::text" | grep -q "11" && echo "  ok    polivalente e grigliata migrate alla sezione V" || { echo "  FAIL polivalente/grigliata"; exit 1; }
q -t -c "select app_theme_get(1::smallint) || linen_change_current(1::smallint)" | grep -q "halloweenpiccolo" && echo "  ok    tema e ancora cambio biancheria migrati alla sezione V" || { echo "  FAIL tema/ancora"; exit 1; }
q -t -c "select count(*) from linen_change_skip where section_id = 1" | grep -q 1 && echo "  ok    salti migrati" || { echo "  FAIL salti"; exit 1; }
q -q < supabase/permessi.sql >/dev/null
run_assert() { # $1 = etichetta
  local out; out=$(q -q < tests/sql/sezioni.assert.sql 2>&1) || { echo "$out" | grep -E "FAIL|ERROR"; echo "$1: FALLITO"; exit 1; }
  echo "  $(echo "$out" | grep -c 'NOTICE:  ok') asserzioni ok"; echo "$1: PASSATO"
}
run_assert UPGRADE

echo "== rebuild (file consolidati) =="
fresh; base
q -q -1 < supabase/sezioni.sql >/dev/null
q -q < supabase/permessi.sql >/dev/null
run_assert REBUILD
docker rm -f "$NAME" >/dev/null 2>&1
