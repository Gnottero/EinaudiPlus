-- Dati nel VECCHIO formato (camere senza lettera), per provare il backfill.
insert into laundry_booking (laundry_id,week_start,day,slot,machine_code,room) values
  ((select id from laundry where slug='valentino'),'2026-11-16',1,3,'W-A','112'),
  ((select id from laundry where slug='manica'),'2026-11-16',1,3,'W-A','21-b'),
  ((select id from laundry where slug='valentino'),'2026-11-16',2,3,'W-B','DIREZIONE');
insert into bike(room) values ('112'),('007');
insert into feedback(laundry_id,room,body) values ((select id from laundry where slug='valentino'),'112','rotta'),(null,null,'anon');
insert into push_sub(laundry_id,room,endpoint,p256dh,auth) values ((select id from laundry where slug='valentino'),'112','e1','a','b');
insert into space_booking(space_id,week_start,day,start_min,end_min,name) values
  ((select id from room_space where slug='music'),'2026-11-16',1,600,660,'112'),
  ((select id from room_space where slug='cinema'),'2026-11-16',1,700,760,'Film club');
insert into admin_account(username,password_hash,ruolo,camera) values ('sis','h','sistemista','112');
insert into admin_account(username,password_hash,ruolo) values ('portinaio','h','fdo'),('stafffer','h','staff'),('grigliatore','h','delegato');
insert into conference_event(titolo, ora_inizio, ora_fine, dal, al) values ('Vecchio evento', '09:00', '10:00', current_date + 5, current_date + 5);
insert into grigliata_evento(titolo, creato_da, scadenza, giorno_evento, chiuso) values ('Vecchia grigliata', 'x', now() + interval '1 day', current_date + 3, true);
insert into linen_change_anchor(id, anchor_date, anchor_type) values (true, date_trunc('week', current_date)::date + 1, 'piccolo');
insert into linen_change_skip(skip_date) values (date_trunc('week', current_date)::date + 8);
update app_theme set tema = 'halloween';
