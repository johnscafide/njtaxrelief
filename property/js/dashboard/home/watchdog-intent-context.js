/* Watchdog Intent Context runtime for Property Home.
   Governed job-to-be-done memory and minimal high-information-gain questioning. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTENT_CONTEXT__)return;
window.__WATCHDOG_HOME_INTENT_CONTEXT__=true;

var PROD_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
var PROD_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
var state={client:null,user:null,pref:null,intent:null,pin:'',contextKey:'',mounted:false};
var JOBS={
  real_estate:[
    ['buyer_research','Buyer representation / shortlist research','Compare price context, comps, taxes, changes and diligence evidence.'],
    ['listing_farm','Listing farming / homeowner prospecting','Find evidence-backed reasons for a relevant homeowner conversation without assuming seller intent.'],
    ['listing_prep','Listing appointment / seller research','Build pricing, tax, property-history and market context for a specific seller conversation.'],
    ['investment_research','Investor or opportunity research','Screen the property for investment or acquisition questions.'],
    ['other','Something else','Tell Watchdog this property is serving a different research job.']
  ],
  investor:[
    ['acquisition_screen','Acquisition screening','Evaluate whether this property deserves deeper underwriting.'],
    ['deal_diligence','Deal diligence','Review taxes, property changes, permits and evidence before a decision.'],
    ['portfolio_monitor','Portfolio monitoring','Track a held or watched asset for meaningful changes.'],
    ['exit_research','Exit / disposition research','Study current evidence that may affect an eventual sale or hold decision.'],
    ['other','Something else','Use a different research objective.']
  ],
  attorney:[
    ['appeal_case','Assessment / appeal case research','Review assessment relationships and supporting evidence without forming a legal conclusion.'],
    ['transaction_diligence','Transaction diligence','Surface property-record, tax and change-history issues for professional review.'],
    ['ownership_title','Ownership / title research','Review ownership and record evidence relevant to the matter.'],
    ['client_advisory','Client advisory research','Build an evidence-backed property briefing for a client matter.'],
    ['other','Something else','Use a different legal research objective.']
  ],
  mortgage_lending:[
    ['borrower_affordability','Borrower affordability','Focus on verified tax carrying cost and property context.'],
    ['pre_underwriting','Pre-underwriting research','Screen property facts and exceptions before deeper underwriting.'],
    ['tax_escrow','Tax / escrow verification','Prioritize current tax and assessment evidence.'],
    ['portfolio_monitor','Portfolio monitoring','Monitor property changes that may matter after closing.'],
    ['other','Something else','Use a different lending objective.']
  ],
  appraiser:[
    ['comp_research','Comparable / market research','Use the property as part of a supported comp and market investigation.'],
    ['property_research','Subject property research','Review assessment, history and change evidence on the subject property.'],
    ['assignment_diligence','Assignment diligence','Identify records and anomalies requiring professional verification.'],
    ['market_study','Market study','Use this property within a broader market pattern.'],
    ['other','Something else','Use a different appraisal research objective.']
  ],
  property_tax_professional:[
    ['appeal_screen','Appeal screening','Triage whether the evidence justifies deeper professional review.'],
    ['case_build','Case evidence research','Organize assessment, source and missing-evidence context.'],
    ['client_advisory','Client advisory','Explain property-tax facts and next review questions.'],
    ['portfolio_review','Portfolio tax review','Monitor multiple properties for tax-related changes.'],
    ['other','Something else','Use a different property-tax objective.']
  ],
  title_closing:[
    ['closing_diligence','Closing diligence','Review tax, ownership and property-record exceptions before settlement.'],
    ['record_research','Property-record research','Investigate source-backed property and ownership context.'],
    ['exception_review','Exception review','Focus on records or changes that may require follow-up.'],
    ['other','Something else','Use a different title or closing objective.']
  ],
  contractor:[
    ['project_screen','Project opportunity screening','Review property and permit context before estimating scope.'],
    ['renovation_research','Renovation research','Study change history and evidence relevant to a potential project.'],
    ['permit_context','Permit / lifecycle research','Prioritize permit and property-change context.'],
    ['other','Something else','Use a different contractor objective.']
  ],
  homeowner:[
    ['monitor_home','Monitor my property','Track meaningful tax, assessment and property-record changes.'],
    ['tax_review','Property-tax review','Understand current tax and assessment evidence.'],
    ['sale_research','Possible sale research','Study pricing and property context without assuming a decision to sell.'],
    ['renovation_research','Renovation / improvement research','Review property history and project context.'],
    ['other','Something else','Use a different homeowner objective.']
  ],
  general:[
    ['purchase_research','Purchase research','Compare this property as a possible purchase.'],
    ['sale_research','Sale / listing research','Study property and market context for a possible sale.'],
    ['tax_research','Tax / assessment research','Focus on tax and assessment evidence.'],
    ['property_monitoring','Property monitoring','Watch the property for meaningful changes.'],
    ['other','Something else','Use a different research objective.']
  ]
};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function client(){if(state.client)return state.client;if(window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient){state.client=window.NJPTRSupabaseRuntime.createClient();return state.client;}if(!window.supabase||!window.supabase.createClient)return null;state.client=window.supabase.createClient(PROD_URL,PROD_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});return state.client;}
function pin(){var q=new URLSearchParams(location.search).get('pin');if(q)return q;var s=document.getElementById('hm-switch');return s&&s.value?s.value:'';}
function profession(){var p=state.pref;if(!p||p.onboarding_complete!==true)return'general';var v=String(p.profession||'').trim();return JOBS[v]?v:'general';}
function options(){return JOBS[profession()]||JOBS.general;}
function jobDef(key){var all=options();for(var i=0;i<all.length;i++)if(all[i][0]===key)return all[i];return null;}
async function appendEvent(type,factClass,payload,confidence){if(!state.user||!state.contextKey)return;var c=client();if(!c)return;try{await c.from('intelligence_intent_events').insert({user_id:state.user.id,intent_state_id:state.intent&&state.intent.id||null,context_key:state.contextKey,event_type:type,fact_class:factClass,payload:payload||{},evidence_refs:[],confidence:confidence==null?null:confidence});}catch(e){console.warn('[Watchdog Intent] event write skipped',e);}}
async function loadIntent(){var c=client();if(!c||!state.user||!state.contextKey)return;var r=await c.from('intelligence_intent_states').select('*').eq('user_id',state.user.id).eq('context_key',state.contextKey).maybeSingle();if(!r.error&&r.data)state.intent=r.data;}
async function ensureObservation(){var key='wd-intent-observed:'+state.user.id+':'+state.contextKey;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');await appendEvent('observation','observed',{signal:'property_home_opened',property_pin:state.pin,page:'/property/home',observed_at:new Date().toISOString()},100);}
function candidatePayload(){return options().filter(function(x){return x[0]!=='other';}).map(function(x){return{intent:x[0],label:x[1],confidence:null,status:'candidate'};});}
async function ensureHypothesisSet(){if(state.intent&&Array.isArray(state.intent.candidate_intents)&&state.intent.candidate_intents.length)return;var c=client();if(!c||!state.user)return;var now=new Date().toISOString();var row={user_id:state.user.id,context_key:state.contextKey,profession:profession(),active_job:null,active_job_confidence:null,candidate_intents:candidatePayload(),evidence_refs:[{kind:'observation',signal:'property_home_opened',property_pin:state.pin}],confirmed_fields:{},assumptions:[],missing_questions:[{key:'active_job',reason:'Multiple plausible professional jobs would materially change the analysis.'}],property_scope:[state.pin],source_freshness:{property_context_observed_at:now},last_meaningful_update:now,updated_at:now};var r=await c.from('intelligence_intent_states').upsert(row,{onConflict:'user_id,context_key'}).select('*').single();if(!r.error&&r.data){state.intent=r.data;await appendEvent('hypothesis','hypothesis',{reason:'Profession and a property open establish multiple plausible jobs; no job is treated as fact until confirmed.',candidates:candidatePayload()},null);}}
function panelHtml(){var active=state.intent&&state.intent.active_job;var def=active&&jobDef(active);if(def){return '<section class="wd-intent-context is-confirmed" data-wd-intent-context><div class="wd-intent-icon"><i class="fas fa-route"></i></div><div class="wd-intent-copy"><span>RESEARCH CONTEXT · USER CONFIRMED</span><h3>'+esc(def[1])+'</h3><p>'+esc(def[2])+' Watchdog will keep this objective attached to this property until you change it.</p></div><button type="button" class="wd-intent-change">Change</button></section>';}
var buttons=options().map(function(x){return '<button type="button" data-intent="'+esc(x[0])+'"><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></button>';}).join('');return '<section class="wd-intent-context is-question" data-wd-intent-context><div class="wd-intent-question"><span>ONE QUESTION TO IMPROVE THE ANALYSIS</span><h3>What are you trying to accomplish with this property?</h3><p>Your profession tells Watchdog how to think. This answer tells it what decision it is helping you make. Watchdog will remember your answer for this property and log it as user-confirmed context.</p><div class="wd-intent-options">'+buttons+'</div></div></section>';}
function mount(){var root=document.querySelector('.ai.wdai');if(!root)return false;var old=root.querySelector('[data-wd-intent-context]');if(old)old.remove();var anchor=root.querySelector('.wdai-role-set')||root.querySelector('.wdai-head');if(!anchor)return false;anchor.insertAdjacentHTML('afterend',panelHtml());state.mounted=true;var change=root.querySelector('.wd-intent-change');if(change)change.addEventListener('click',clearIntent);root.querySelectorAll('.wd-intent-options [data-intent]').forEach(function(b){b.addEventListener('click',function(){confirmIntent(b.getAttribute('data-intent'));});});return true;}
async function clearIntent(){if(!state.intent||!state.user)return;var c=client();var previous=state.intent.active_job;var now=new Date().toISOString();var r=await c.from('intelligence_intent_states').update({active_job:null,active_job_confidence:null,confirmed_fields:{},candidate_intents:candidatePayload(),missing_questions:[{key:'active_job',reason:'User requested a context change.'}],last_meaningful_update:now,updated_at:now}).eq('id',state.intent.id).select('*').single();if(!r.error&&r.data){state.intent=r.data;await appendEvent('correction','user_confirmed',{field:'active_job',previous:previous,new:null,reason:'User requested context change.'},100);mount();}}
async function confirmIntent(key){var def=jobDef(key);if(!def||!state.intent||!state.user)return;var c=client();var now=new Date().toISOString();var confirmed={active_job:{value:key,label:def[1],confirmed_at:now,source:'user_selection'}};var r=await c.from('intelligence_intent_states').update({active_job:key,active_job_confidence:100,candidate_intents:[{intent:key,label:def[1],confidence:100,status:'user_confirmed'}],confirmed_fields:confirmed,missing_questions:[],last_meaningful_update:now,updated_at:now}).eq('id',state.intent.id).select('*').single();if(!r.error&&r.data){state.intent=r.data;await appendEvent('answer','user_confirmed',{question:'What are you trying to accomplish with this property?',answer:key,label:def[1]},100);await appendEvent('intent_update','user_confirmed',{active_job:key,label:def[1],previous_active_job:null},100);window.dispatchEvent(new CustomEvent('watchdog:intent-updated',{detail:{context_key:state.contextKey,active_job:key,label:def[1],confidence:100}}));mount();}}
async function init(){var c=client();if(!c)return;var u=await c.auth.getUser();state.user=u&&u.data&&u.data.user||null;if(!state.user)return;state.pin=pin();if(!state.pin)return;state.contextKey='property:'+state.pin;var pr=await c.from('professional_preferences').select('profession,onboarding_complete').eq('user_id',state.user.id).maybeSingle();if(!pr.error&&pr.data)state.pref=pr.data;await loadIntent();await ensureObservation();await ensureHypothesisSet();mount();var mo=new MutationObserver(function(muts){if(!document.querySelector('.ai.wdai [data-wd-intent-context]'))mount();});mo.observe(document.body,{childList:true,subtree:true});window.addEventListener('watchdog:profession-updated',async function(){var rr=await c.from('professional_preferences').select('profession,onboarding_complete').eq('user_id',state.user.id).maybeSingle();if(!rr.error&&rr.data){state.pref=rr.data;if(state.intent&&!state.intent.active_job){var now=new Date().toISOString();var ur=await c.from('intelligence_intent_states').update({profession:profession(),candidate_intents:candidatePayload(),last_meaningful_update:now,updated_at:now}).eq('id',state.intent.id).select('*').single();if(!ur.error&&ur.data)state.intent=ur.data;}mount();}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,0);});else setTimeout(init,0);
})();
