// Real PostgreSQL policies against the transaction schema; auth/plan helpers are isolated fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(process.env.PGLITE_MODULE).href:'@electric-sql/pglite');
const db=new PGlite();
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const tx='33333333-3333-4333-8333-333333333333',otherTx='44444444-4444-4444-8444-444444444444';
let checks=0;
const equal=(a,b,label)=>{assert.deepEqual(a,b,label);checks++};
try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    insert into auth.users values('${owner}'),('${other}');
    create function auth.uid() returns uuid language sql stable as $$select current_setting('test.uid')::uuid$$;
    create function public.has_watchdog_plan(required text) returns boolean language sql stable as $$select
      current_setting('test.status') in ('active','trialing') and
      array_position(array['standard','agent','pro','pro_plus','teams'],current_setting('test.plan')) >=
      array_position(array['standard','agent','pro','pro_plus','teams'],required)$$;
    grant usage on schema auth to authenticated;
    set test.uid='${owner}';set test.plan='agent';set test.status='active';`);
  await db.exec(fs.readFileSync('supabase/migrations/20260915161000_transaction_command_center.sql','utf8'));
  await db.exec(`insert into transaction_workspaces(id,user_id,address) values('${tx}','${owner}','Fixture Street'),('${otherTx}','${other}','Other Street');
    insert into transaction_items(transaction_id,user_id,category,item_key,title) values('${tx}','${owner}','transaction','manual','Manual follow-up');
    insert into transaction_items(transaction_id,user_id,category,item_key,title,source_type,payload) values('${tx}','${owner}','tax','paid','Paid tax evidence','public_record','{"amount":123456}');
    insert into transaction_disclosures(transaction_id,user_id,question_key,question_label) values('${tx}','${owner}','roof','Roof');
    insert into transaction_activity(transaction_id,user_id,action,message,detail) values
      ('${tx}','${owner}','transaction_create','Created','{}'),('${tx}','${owner}','municipal_live_evidence_refresh','Restricted source detail','{"amount":123456}');
    set role authenticated;`);
  equal((await db.query('select * from transaction_workspaces')).rows.length,0,'Original schema excludes Agent');
  await db.exec('reset role');
  await db.exec(fs.readFileSync('supabase/migrations/20260915221914_agent_transaction_workspace_access.sql','utf8'));
  await db.exec('set role authenticated');
  equal((await db.query('select address from transaction_workspaces')).rows.map(x=>x.address),['Fixture Street'],'Only own workspace');
  equal((await db.query('select item_key from transaction_items')).rows.map(x=>x.item_key),['manual'],'Source-populated evidence withheld');
  equal((await db.query('select action from transaction_activity')).rows.map(x=>x.action),['transaction_create'],'Paid evidence activity withheld');
  equal((await db.query('select question_key from transaction_disclosures')).rows.map(x=>x.question_key),['roof']);
  await db.exec(`update transaction_items set state='requested' where item_key='manual';update transaction_disclosures set answer='yes';`);
  equal((await db.query("select state from transaction_items where item_key='manual'")).rows[0].state,'requested');
  await db.exec(`update transaction_workspaces set watch_enabled=true,last_watch_at=now(),readiness_status='ready' where id='${tx}'`);
  const workspace=(await db.query('select watch_enabled,last_watch_at,readiness_status from transaction_workspaces')).rows[0];
  equal(workspace,{watch_enabled:false,last_watch_at:null,readiness_status:'review'},'Agent cannot enable paid monitoring or invent a cleared status');
  equal((await db.query("update transaction_items set source_type=null,payload='{}' where item_key='paid' returning id")).rows.length,0,'Cannot relabel a hidden paid row');
  equal((await db.query("delete from transaction_items where item_key='paid' returning id")).rows.length,0,'Cannot delete hidden paid evidence');
  for(const patch of ["source_type='public_record'","source_label='Restricted'","source_url='https://example.test/paid'","source_checked_at=now()","payload='{\"amount\":123}'"]){
    await assert.rejects(db.exec(`update transaction_items set ${patch} where item_key='manual'`),/row.level security/i);checks++;
  }
  await assert.rejects(db.exec(`insert into transaction_workspaces(user_id,address) values('${other}','Forbidden')`),/row.level security/i);checks++;
  await assert.rejects(db.exec(`update transaction_workspaces set user_id='${other}' where id='${tx}'`),/row.level security/i);checks++;
  await assert.rejects(db.exec(`insert into transaction_items(transaction_id,user_id,category,item_key,title) values('${otherTx}','${owner}','transaction','spoof','Forbidden')`),/foreign key/i);checks++;
  for(const [plan,status,access,evidence] of [['standard','active',false,false],['agent','canceled',false,false],['agent','trialing',true,false],['pro','active',true,false],['pro_plus','active',true,true],['teams','active',true,true]]){
    await db.exec(`set test.plan='${plan}';set test.status='${status}';`);
    equal((await db.query('select id from transaction_workspaces')).rows.length,access?1:0,`${plan}/${status} workspace`);
    equal((await db.query("select id from transaction_items where item_key='paid'")).rows.length,evidence?1:0,`${plan}/${status} paid evidence`);
  }
  await db.exec("set test.plan='pro_plus';set test.status='active';");
  await db.exec(`update transaction_workspaces set watch_enabled=true,last_watch_at=now() where id='${tx}'`);
  equal((await db.query('select watch_enabled from transaction_workspaces')).rows[0].watch_enabled,true,'Pro+ retains monitoring');
  console.log(`Agent Transaction policies: ${checks} PostgreSQL checks passed; paid evidence and cross-account records remain protected.`);
}finally{await db.close()}
