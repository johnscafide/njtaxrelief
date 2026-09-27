-- Re-key pilot_agreement_intelligence from the NJ state county/municipal code to
-- the MOD-IV (PAMS PIN) district code.
--
-- The table was loaded by property/scripts/build_pilot_agreement_intelligence.py
-- while its crosswalk (budget-pressure.json) was keyed by the state code, which
-- differs from the PIN district code for 99 municipalities. workbench-hydrate
-- looks rows up by PIN prefix, so those towns were shown a neighbour's PILOT data
-- (for example New Brunswick's 30 agreements sat under North Brunswick's code).
-- Mapping source: property/data/nj-district-crosswalk.json (state code -> PIN code).
--
-- Runs once. The table comment records the key basis so a second run is a no-op.
do $$
begin
  if coalesce(obj_description('public.pilot_agreement_intelligence'::regclass, 'pg_class'), '') like '%district_key=modiv_pams%' then
    raise notice 'pilot_agreement_intelligence already keyed by PIN district code; skipping';
    return;
  end if;

  create temporary table _state_to_pin(state_code text primary key, pin_code text not null unique) on commit drop;
  insert into _state_to_pin(state_code, pin_code) values
    ('1209','1215'),
    ('1210','1209'),
    ('1211','1210'),
    ('1212','1211'),
    ('1213','1212'),
    ('1214','1213'),
    ('1215','1214'),
    ('1301','1302'),
    ('1302','1303'),
    ('1303','1304'),
    ('1304','1305'),
    ('1305','1306'),
    ('1306','1307'),
    ('1307','1308'),
    ('1308','1309'),
    ('1309','1310'),
    ('1310','1311'),
    ('1311','1312'),
    ('1312','1313'),
    ('1313','1314'),
    ('1314','1315'),
    ('1315','1316'),
    ('1316','1317'),
    ('1317','1319'),
    ('1318','1320'),
    ('1319','1321'),
    ('1320','1322'),
    ('1321','1323'),
    ('1322','1324'),
    ('1323','1325'),
    ('1324','1326'),
    ('1325','1327'),
    ('1326','1328'),
    ('1327','1329'),
    ('1328','1330'),
    ('1329','1331'),
    ('1330','1301'),
    ('1331','1332'),
    ('1332','1333'),
    ('1333','1334'),
    ('1334','1335'),
    ('1335','1336'),
    ('1336','1349'),
    ('1339','1318'),
    ('1340','1339'),
    ('1341','1340'),
    ('1342','1341'),
    ('1343','1342'),
    ('1344','1343'),
    ('1345','1344'),
    ('1346','1345'),
    ('1347','1346'),
    ('1348','1347'),
    ('1349','1348'),
    ('1501','1502'),
    ('1502','1503'),
    ('1503','1504'),
    ('1504','1505'),
    ('1505','1506'),
    ('1506','1507'),
    ('1507','1508'),
    ('1508','1509'),
    ('1509','1510'),
    ('1510','1511'),
    ('1511','1512'),
    ('1512','1513'),
    ('1513','1514'),
    ('1514','1515'),
    ('1515','1516'),
    ('1516','1517'),
    ('1517','1518'),
    ('1518','1519'),
    ('1519','1520'),
    ('1520','1521'),
    ('1521','1522'),
    ('1522','1523'),
    ('1523','1524'),
    ('1524','1525'),
    ('1525','1526'),
    ('1526','1527'),
    ('1527','1528'),
    ('1528','1529'),
    ('1529','1530'),
    ('1530','1531'),
    ('1531','1532'),
    ('1532','1533'),
    ('1533','1501'),
    ('1702','1703'),
    ('1703','1704'),
    ('1704','1705'),
    ('1705','1706'),
    ('1706','1707'),
    ('1707','1708'),
    ('1708','1709'),
    ('1709','1710'),
    ('1710','1711'),
    ('1711','1712'),
    ('1712','1713'),
    ('1713','1702');

  create temporary table _moved on commit drop as
    select m.pin_code, p.*
    from public.pilot_agreement_intelligence p
    join _state_to_pin m on m.state_code = p.district;

  delete from public.pilot_agreement_intelligence p
    using _state_to_pin m
    where p.district = m.state_code;

  insert into public.pilot_agreement_intelligence
    select (jsonb_populate_record(
      null::public.pilot_agreement_intelligence,
      (to_jsonb(x) - 'pin_code') || jsonb_build_object('district', x.pin_code)
    )).*
    from _moved x;

  comment on table public.pilot_agreement_intelligence is
    'Service-only governed municipal summary derived from NJ DCA PILOT Database and Viewer 2026 raw UFB rows. Reported agreement count is a row-fingerprint metric, not a legal agreement count. district_key=modiv_pams (PAMS PIN district code).';
end
$$;
