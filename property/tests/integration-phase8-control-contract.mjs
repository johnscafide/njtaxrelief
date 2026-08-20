import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const fail=(m)=>{console.error(`Integration Phase 8 contract failed: ${m}`);process.exitCode=1;};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label} missing: ${needle}`);};
const forbidText=(text,needle,label)=>{if(text.includes(needle))fail(`${label} contains forbidden text: ${needle}`);};

const worker=read('supabase/functions/integration-delivery-worker/index.ts');
const base=read('supabase/migrations/20260819212400_integration_phase8_operations_control_plane.sql');
const replayBase=read('supabase/migrations/20260819213700_integration_phase8_operations_rpc.sql');
const providerSchema=read('supabase/migrations/20260820123600_integration_phase8_provider_control_schema.sql');
const providerRpcs=read('supabase/migrations/20260820123700_integration_phase8_provider_control_rpcs.sql');
const replay=read('supabase/migrations/20260820123800_integration_phase8_replay_control_enforcement.sql');
const providerHealth=read('supabase/migrations/20260820123900_integration_phase8_provider_health_trigger.sql');
const ui=read('property/js/integrations-automation-fabric.js');

requireText(base,"'integration.health.changed'",'health transition event');
requireText(base,'after insert or update of state','health transition trigger');
requireText(replayBase,"v_delivery.status not in ('failed','canceled')",'base replay eligibility');
requireText(replayBase,"'idempotency_key',v_event.id",'base replay idempotency');
requireText(replayBase,"'delivery.manual_replay_queued'",'base replay audit');

requireText(providerSchema,'create table if not exists public.integration_provider_controls','provider control schema');
requireText(providerSchema,'external_writes_enabled boolean not null default true','provider external-write gate');
requireText(providerSchema,'alter table public.integration_provider_controls enable row level security','provider control RLS');
requireText(providerSchema,'revoke all on public.integration_provider_controls from anon, authenticated','provider browser denial');

requireText(providerRpcs,'integration_update_provider_control','provider control RPC');
requireText(providerRpcs,'integration_list_provider_controls','provider control summary RPC');
requireText(providerRpcs,'auth.uid()','provider RPC caller binding');
requireText(providerRpcs,"'provider.control.updated'",'provider control audit');

requireText(replay,'Replay is blocked by the provider control plane','replay provider gate');
requireText(replay,'not v_provider_control.external_writes_enabled','replay provider external-write gate');
requireText(replay,'not v_control.external_writes_enabled','replay connection external-write gate');
requireText(replay,"'idempotency_preserved',true",'replay idempotency audit');
requireText(replay,"'external_write_control_checked',true",'replay control audit');

requireText(providerHealth,'integration_provider_control_health','provider health trigger');
requireText(providerHealth,"'provider:'||new.provider",'provider health component');
requireText(providerHealth,"'integration.health.changed'",'provider health event');

requireText(worker,'integration_provider_controls','delivery provider gate');
requireText(worker,'provider_external_writes_disabled','delivery provider external-write gate');
requireText(worker,'external_writes_disabled','delivery connection external-write gate');
requireText(worker,'provider_event_type_disabled','delivery provider event-type gate');
requireText(worker,'"Idempotency-Key":e.id','delivery event idempotency key');
requireText(worker,'publicHttps(c.outbound_url)','delivery SSRF boundary');

requireText(ui,'data-waf-provider-outbound','provider outbound UI control');
requireText(ui,'data-waf-provider-writes','provider external-write UI control');
requireText(ui,'data-waf-provider-event','provider event-type UI control');
requireText(ui,'data-waf-outbound','connection outbound UI control');
requireText(ui,'data-waf-writes','connection external-write UI control');
requireText(ui,'data-waf-event','connection event-type UI control');
requireText(ui,'integration_list_provider_controls','provider control UI loading');
requireText(ui,'integration_update_provider_control','provider control UI mutation');
forbidText(ui,'?v=','automation fabric asset loading');

if(!process.exitCode)console.log('Integration Phase 8 control-plane contract passed.');
