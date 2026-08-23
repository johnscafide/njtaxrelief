(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WatchdogIntelligenceCommandPolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='watchdog-command-policy-vnext-1';
  const CLASSES=Object.freeze({
    neutral:'neutral',
    read_only:'read_only',
    reversible:'reversible',
    approval_required:'approval_required',
    prohibited:'prohibited'
  });
  const clean=(value,max=1800)=>String(value==null?'':value).replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const lower=(value)=>clean(value).toLowerCase();
  const testAny=(text,patterns)=>patterns.some((pattern)=>pattern.test(text));

  const PROHIBITED=[
    /\b(?:bypass|disable|ignore|remove|turn off)\b.{0,45}\b(?:rls|row level security|entitlement|plan gates?|permission|approval|security|guardrail)\b/i,
    /\b(?:reveal|show|expose|print|give me)\b.{0,35}\b(?:service role|service[_ -]?role|api key|password|credential|secret|access token|refresh token)\b/i,
    /\b(?:grant|give|make)\b.{0,25}\b(?:admin|administrator|developer|unrestricted)\b.{0,25}\b(?:access|permission|role)?\b/i,
    /\b(?:change|alter|edit|drop|disable)\b.{0,30}\b(?:rls|row level security|entitlement policy|security policy)\b/i,
    /\b(?:always[- ]?listen|always listening|continuous microphone|hot mic)\b/i,
    /\b(?:clone|copy|impersonate)\b.{0,25}\b(?:voice|speaker)\b/i
  ];
  const APPROVAL_REQUIRED=[
    /\b(?:send|email|text|message|call|contact)\b.{0,60}\b(?:client|lead|customer|prospect|owner|homeowner|recipient|contact)\b/i,
    /\b(?:publish|post|send live|go live)\b.{0,50}\b(?:article|insight|post|campaign|broadcast|newsletter|creative|content)\b/i,
    /\b(?:launch|activate|start|run)\b.{0,45}\b(?:paid|ad|ads|campaign|marketing|direct mail|mailing)\b/i,
    /\b(?:schedule|send)\b.{0,45}\b(?:newsletter|broadcast|campaign|mailing|postcard|email blast)\b/i,
    /\b(?:charge|pay|purchase|buy|checkout|refund|cancel subscription|change billing|modify billing)\b/i,
    /\b(?:delete|erase|purge|remove)\b.{0,40}\b(?:account|all data|customer data|client data|records|workspace|organization)\b/i,
    /\b(?:submit|file|initiate)\b.{0,45}\b(?:appeal|legal|complaint|filing|application)\b/i,
    /\b(?:mail|order|purchase)\b.{0,45}\b(?:postcard|letter|direct mail|mailer)\b/i,
    /\b(?:update|write|sync|push|create)\b.{0,45}\b(?:crm|boldtrail|kit|external system|provider)\b/i
  ];
  const REVERSIBLE=[
    /\b(?:add|save)\b.{0,45}\b(?:watchlist|comparison|compare set|filter|tag)\b/i,
    /\b(?:remove|unsave|clear|untag)\b.{0,45}\b(?:watchlist|comparison|compare set|filter|tag)\b/i,
    /\b(?:create|add|save)\b.{0,45}\b(?:follow[- ]?up task|internal task|draft|note)\b/i,
    /\bdraft\b.{0,50}\b(?:client brief|email|message|newsletter|campaign|creative)\b/i
  ];
  const READ_ONLY=[
    /\b(?:open|show|view|display)\b.{0,45}\b(?:evidence|source|sources|lineage|history|watchlist|comparison|compare|report)\b/i,
    /\b(?:read|listen to|summarize|explain)\b.{0,55}\b(?:latest|current|material|evidence|changes|brief|report|score)\b/i,
    /\bwhat (?:changed|is new)\b/i,
    /\bwhy (?:was|is) (?:this|that) (?:flagged|important)\b/i
  ];

  function classify(prompt){
    const raw=clean(prompt),text=lower(raw);
    if(!text)return Object.freeze({version:VERSION,class:CLASSES.neutral,reason:'empty',action:null,confirmation:'none',execution:'analyst'});
    if(testAny(text,PROHIBITED))return Object.freeze({version:VERSION,class:CLASSES.prohibited,reason:'authority_or_privacy_boundary',action:null,confirmation:'none',execution:'blocked'});
    if(testAny(text,APPROVAL_REQUIRED))return Object.freeze({version:VERSION,class:CLASSES.approval_required,reason:'external_paid_destructive_or_regulated_effect',action:null,confirmation:'prepare_only',execution:'proposal_only'});
    if(testAny(text,REVERSIBLE))return Object.freeze({version:VERSION,class:CLASSES.reversible,reason:'reversible_internal_change',action:null,confirmation:'confirm',execution:'governed_after_confirmation'});
    if(testAny(text,READ_ONLY)){
      const action=/\bopen\b.{0,25}\b(?:evidence|sources?|lineage)\b/i.test(text)?'focus_evidence':null;
      return Object.freeze({version:VERSION,class:CLASSES.read_only,reason:'read_only_navigation_or_analysis',action,confirmation:'none',execution:action?'local_read_only':'analyst_read_only'});
    }
    return Object.freeze({version:VERSION,class:CLASSES.neutral,reason:'normal_analyst_request',action:null,confirmation:'none',execution:'analyst'});
  }

  function confirmCopy(policy){
    const value=policy||{};
    if(value.class===CLASSES.reversible)return Object.freeze({title:'Confirm reversible action',body:'This can change your internal Watchdog state, but it is intended to be reversible. Confirm before Watchdog passes the request into governed tools.',confirmLabel:'Confirm action',mode:'confirmed'});
    if(value.class===CLASSES.approval_required)return Object.freeze({title:'Approval required',body:'This could create an external, paid, destructive, legal, marketing, communication, billing, or provider-side effect. Voice will not execute it. You can prepare it for the existing approval flow.',confirmLabel:'Prepare for review',mode:'prepare_only'});
    if(value.class===CLASSES.prohibited)return Object.freeze({title:'Command blocked',body:'Watchdog will not use spoken or typed commands to bypass permissions, reveal credentials, expand access, enable always-listening behavior, or clone/impersonate a voice.',confirmLabel:'',mode:'blocked'});
    return null;
  }

  return Object.freeze({VERSION,CLASSES,classify,confirmCopy});
});
