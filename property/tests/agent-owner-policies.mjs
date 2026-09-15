// Runs PostgreSQL RLS locally. This is not a live staging or quota certification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const moduleName = process.env.PGLITE_MODULE;
const {PGlite} = await import(moduleName ? pathToFileURL(moduleName).href : '@electric-sql/pglite');
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const tables = [
  ['agent_farm_properties','agent farm',['select','insert','update','delete']],
  ['agent_opportunity_actions','agent actions',['select','insert','update','delete']],
  ['agent_territories','agent territories',['select','insert','update','delete']],
  ['agent_digest_preferences','agent digest',['select','insert','update']],
  ['agent_funnel_events','agent funnel',['select','insert']]
];
try {
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;
    create function public.has_watchdog_plan(required text) returns boolean language sql stable as $$
      select current_setting('test.status') in ('active','trialing') and
      array_position(array['standard','agent','pro','pro_plus','teams'], current_setting('test.plan')) >=
      array_position(array['standard','agent','pro','pro_plus','teams'], required) $$;
    grant usage on schema auth to authenticated;`);
  for (const [table,prefix,commands] of tables) {
    await db.exec(`create table public.${table}(user_id uuid, note text); alter table public.${table} enable row level security;
      grant ${commands.join(',')} on public.${table} to authenticated;
      insert into public.${table} values ('${owner}','own'),('${other}','other');`);
    for (const command of commands) {
      const predicate="((select auth.uid()) = user_id and (select public.has_watchdog_plan('pro')))";
      await db.exec(`create policy "${prefix} ${command} own pro" on public.${table} for ${command} to authenticated
        ${command!=='insert' ? `using ${predicate}` : ''}
        ${['insert','update'].includes(command) ? `with check ${predicate}` : ''};`);
    }
  }
  await db.exec(`set test.uid='${owner}'; set test.plan='agent'; set test.status='active'; set role authenticated;`);
  assert.equal((await db.query('select * from agent_farm_properties')).rows.length,0,'reproduce original Agent denial');
  await db.exec('reset role;');
  await db.exec(fs.readFileSync('supabase/migrations/20260915113017_agent_day_one_owner_access.sql','utf8'));
  let checks=0;
  for(const [table,,commands] of tables){
    await db.exec("set test.plan='agent'; set test.status='active'; set role authenticated;");
    assert.equal((await db.query(`select * from ${table}`)).rows.length,1); checks++;
    await db.exec(`insert into ${table} values ('${owner}','new');`); checks++;
    await assert.rejects(db.exec(`insert into ${table} values ('${other}','forbidden');`), /row.level security/i); checks++;
    if(commands.includes('update')){
      await db.exec(`update ${table} set note='updated' where user_id='${owner}';`); checks++;
      await assert.rejects(db.exec(`update ${table} set user_id='${other}' where user_id='${owner}';`),/row.level security/i); checks++;
    }
    for(const [plan,status,allowed] of [['standard','active',false],['agent','canceled',false],['agent','trialing',true],['pro','active',true],['pro_plus','active',true],['teams','active',true]]){
      await db.exec(`set test.plan='${plan}'; set test.status='${status}';`);
      assert.equal((await db.query(`select * from ${table}`)).rows.length>0,allowed,`${table} ${plan}/${status}`); checks++;
      if(!allowed) {await assert.rejects(db.exec(`insert into ${table} values ('${owner}','forbidden');`), /row.level security/i);checks++;}
    }
    if(commands.includes('delete')){
      await db.exec("set test.plan='agent'; set test.status='active';");
      await db.exec(`delete from ${table} where user_id='${owner}';`);
      assert.equal((await db.query(`select * from ${table}`)).rows.length,0);checks++;
    }
    await db.exec('reset role;');
    assert.equal((await db.query(`select * from ${table} where user_id='${other}'`)).rows[0].note,'other');checks++;
  }
  console.log(`Agent owner policies: ${checks} PostgreSQL checks passed; original denial reproduced; cross-account writes denied.`);
} finally {await db.close();}
