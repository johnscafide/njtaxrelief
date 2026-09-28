// content-architecture: dynamic — plain-English labels for governed Watchdog Intelligence signals.
/* Watchdog Intelligence in plain English.
   Turns governed signal ids (watchdog.tax_to_assessment_rate, event.recency...)
   into a label a client understands, the value in everyday units, and one line
   on why it matters. Wording follows the formula registry
   (derived_formula_registry.explanation); it never adds facts or claims.
   Unknown signals fall back to a readable version of the id. */
(function(){
  'use strict';
  if(window.WatchdogPlain)return;

  var num=function(v){var n=Number(v);return Number.isFinite(n)?n:null;};
  var pct=function(v,d){var n=num(v);return n==null?'':n.toFixed(d==null?0:d)+'%';};
  var count=function(v,one,many){var n=num(v);return n==null?'':n+' '+(n===1?one:many);};

  var SIGNALS={
    'watchdog.tax_to_assessment_rate':{label:'Tax bill vs. assessed value',value:function(v){var n=num(v);return n==null?'':'The yearly tax bill is '+n.toFixed(2)+'% of the assessed value';},why:'When this runs higher than similar homes in town, the assessment may be worth a second look.'},
    'watchdog.assessment_to_sale_ratio':{label:'Assessment vs. last sale price',value:function(v){var n=num(v);if(n==null)return'';var p=n<=5?n*100:n;return 'Assessed at '+p.toFixed(0)+'% of the price it last sold for';},why:'Compared with the town’s average ratio, this shows whether the home may be assessed high or low.'},
    'watchdog.assessment_to_sale_ratio_review_window':{label:'Assessment vs. a recent sale',value:function(v){var n=num(v);if(n==null)return'';var p=n<=5?n*100:n;return 'Assessed at '+p.toFixed(0)+'% of a sale within the last eight years';},why:'A recent arm’s-length sale is the strongest check on whether an assessment is fair.'},
    'watchdog.sale_recency_confidence':{label:'How recent the last sale is',value:function(v){var n=num(v);return n==null?'':Math.round(n)+' out of 100 (higher means more recent)';},why:'Older sales say less about today’s value.'},
    'watchdog.source_authority_coverage':{label:'Official records found',value:function(v){return pct(v)?pct(v)+' of the core public records we check':'';},why:'More official records means Watchdog is working from a fuller picture.'},
    'watchdog.transaction_diligence_completion':{label:'Closing checks completed',value:function(v){return pct(v)?pct(v)+' of the public-record checks':'';},why:'Shows how many of the standard pre-closing record checks could be run. It is not a closing clearance.'},
    'watchdog.closing_exception_priority':{label:'Closing items to review',value:function(v){var n=num(v);return n==null?'':Math.round(n)+' out of 100 priority';},why:'Weighs open permits, title constraints and environmental screens. It is not a title or legal opinion.'},
    'watchdog.due_diligence_signal_count':{label:'Due-diligence flags',value:function(v){return count(v,'flag found','flags found');},why:'Each flag is a public-record item a buyer or attorney would usually want to check.'},
    'watchdog.permit_closure_confidence':{label:'Permits closed out',value:function(v){return pct(v)?pct(v)+' of permits on record look closed':'';},why:'Open permits can hold up a closing. This is a screen, not a certificate of occupancy.'},
    'watchdog.title_constraint_stack':{label:'Land-use restrictions on record',value:function(v){return count(v,'restriction','restrictions');},why:'Tidelands, wetlands, Pinelands, Highlands and deed notices can limit what can be done with a property. Not a title opinion.'},
    'watchdog.property_story_confidence':{label:'How complete the public record is',value:function(v){var n=num(v);return n==null?'':Math.round(n)+' out of 100';},why:'A more complete record makes the rest of this review more reliable.'},
    'event.type_priority':{label:'Type of change',value:function(v){return String(v||'').replace(/_/g,' ');},why:'Some kinds of record changes matter more than others.'},
    'event.recency':{label:'How recent the change is',value:function(v){var n=num(v);return n==null?String(v||''):Math.round(n)+' out of 100 (higher means more recent)';},why:'Recent changes are the ones most likely to need attention now.'},
    'event.materiality':{label:'Size of the change',value:function(v){return String(v||'').replace(/_/g,' ');},why:'Bigger changes are more likely to affect value or taxes.'},
    'event.change_count_30d':{label:'Changes in the last 30 days',value:function(v){return count(v,'change','changes');},why:'Several changes close together can signal something worth checking.'}
  };

  /* Checks on how complete the record is. They support a finding but are never
     the reason for one. */
  var META={'watchdog.source_authority_coverage':1,'watchdog.property_story_confidence':1,'watchdog.transaction_diligence_completion':1};

  var MISSING={
    'guard_failed':'The record did not pass Watchdog’s checks, so it was left out instead of guessed.',
    'missing':'This record is not available for this property yet.',
    'unmapped_category':'This kind of record is not scored yet.',
    'invalid_future_sale_year':'The recorded sale date is in the future, so it was left out.'
  };

  function readable(id){
    var s=String(id||'').replace(/^(watchdog|event)\./,'').replace(/_/g,' ').trim();
    return s?s.charAt(0).toUpperCase()+s.slice(1):'Signal';
  }

  function signal(e){
    var id=String(e&&e.signal_id||''),def=SIGNALS[id];
    var label=def?def.label:readable(id);
    var value=def&&e&&e.value!=null&&e.value!==''?def.value(e.value):'';
    return {id:id,label:label,value:value,why:def?def.why:'',known:!!def};
  }

  function missing(e){
    var s=signal(e),detail=e&&e.normalization&&e.normalization.detail&&e.normalization.detail.reason;
    var noSaleDate=detail&&/sale age is missing/i.test(detail);
    var reason=noSaleDate?(s.id==='watchdog.sale_recency_confidence'?'No usable sale date is on record, so Watchdog could not tell how recent the last sale was.':'No usable sale date is on record for this property, so Watchdog could not compare the assessment with a recent sale.'):(MISSING[String(e&&e.reason||'')]||'This evidence is not available right now.');
    return {id:s.id,label:s.label,reason:reason};
  }

  function level(n,lo,hi){n=num(n)||0;return n>=hi?'high':n>=lo?'moderate':'low';}

  /* One short paragraph a client can read in five seconds. Uses only the
     finding's own score, confidence, coverage, evidence and missing items. */
  function summary(f,address){
    var score=Math.round(num(f&&f.score)||0),conf=Math.round(num(f&&f.confidence)||0),cov=Math.round(num(f&&f.evidence_coverage)||0);
    var ev=(Array.isArray(f&&f.evidence)?f.evidence:[]).slice().sort(function(a,b){return (num(b.score)||0)-(num(a.score)||0);});
    var miss=Array.isArray(f&&f.missing_evidence)?f.missing_evidence:[];
    var headline=score>=70?'Worth a close look.':score>=40?'Worth a look, not urgent.':'Low priority. Nothing here stands out strongly.';
    var parts=[];
    /* Lead with the reason the finding was raised (why_now), never a
       record-coverage check, and say how strongly it points to a review. */
    var whyIds=(Array.isArray(f&&f.why_now)?f.why_now:[]).map(function(w){return String(w&&w.signal_id||'');});
    var reasons=ev.filter(function(e){return !META[String(e.signal_id||'')];});
    reasons.sort(function(a,b){return (whyIds.indexOf(String(b.signal_id))>=0)-(whyIds.indexOf(String(a.signal_id))>=0);});
    var leadEv=reasons.filter(function(e){return signal(e).value;})[0];
    if(leadEv){var ls=signal(leadEv),st=Math.round(num(leadEv.score)||0);parts.push('The main reason: '+ls.value.charAt(0).toLowerCase()+ls.value.slice(1)+'. On its own, that '+(st>=70?'strongly':st>=40?'moderately':'only weakly')+' points to a review ('+st+' out of 100).');}
    if(miss.length){var m=missing(miss[0]);parts.push('Watchdog could not check '+m.label.toLowerCase()+(miss.length>1?' and '+(miss.length-1)+' other item'+(miss.length>2?'s':''):'')+', so this is based on part of the evidence.');}
    parts.push('Confidence is '+level(conf,50,75)+' ('+conf+'%), with '+cov+'% of the evidence Watchdog normally uses.');
    return {headline:headline,text:parts.join(' '),score:score,confidence:conf,coverage:cov,priority:score>=70?'High':score>=40?'Medium':'Low',confidenceLevel:level(conf,50,75)};
  }

  /* Reasons the finding was raised first, record-coverage checks last. */
  function order(f){
    var whyIds=(Array.isArray(f&&f.why_now)?f.why_now:[]).map(function(w){return String(w&&w.signal_id||'');});
    var rank=function(e){var id=String(e&&e.signal_id||'');return (whyIds.indexOf(id)>=0?0:1)+(META[id]?2:0);};
    return (Array.isArray(f&&f.evidence)?f.evidence:[]).slice().sort(function(a,b){return rank(a)-rank(b)||(num(b.score)||0)-(num(a.score)||0);});
  }

  window.WatchdogPlain={signal:signal,missing:missing,summary:summary,order:order,label:function(id){return signal({signal_id:id}).label;}};
})();
