/* Cross-professional Watchdog decision markers built from existing sourced inputs. */
(function(){
  'use strict';
  function cl(v){return Math.max(0,Math.min(100,Math.round(+v||0)));}
  function weighted(parts){var n=0,w=0;parts.forEach(function(p){n+=p[0]*p[1];w+=p[1];});return cl(w?n/w:0);}
  function comparableReliability(r){
    var s=typeof sr1aFor==='function'?sr1aFor(r):null;if(!s)return 0;
    var depth=cl((+s.n||0)/150*100),spread=(s.p25!=null&&s.p75!=null)?cl(100-Math.max(0,(+s.p75-+s.p25))/.35*100):45;
    var years=s.years||[],latest=years.length?Math.max.apply(null,years):0,recency=latest>=2025?100:latest===2024?75:latest?45:20;
    var propertyDetail=(r._sqft||r.living_sqft)?100:35;
    return weighted([[depth,.45],[spread,.30],[recency,.15],[propertyDetail,.10]]);
  }
  function costAbsorption(r){
    var b=typeof budgetPressureFor==='function'?budgetPressureFor(r):null;if(!b||!b.trend)return 0;
    var levy=+b.trend.total_levy_cagr||0,ratable=+b.trend.ratable_growth||0,gap=Math.max(0,levy-ratable);
    var growth=cl(100-gap/.05*100),collection=b.budget&&b.budget.collection_rate!=null?cl(((+b.budget.collection_rate)-.90)/.10*100):50;
    return weighted([[growth,.70],[collection,.30]]);
  }
  function taxShock(r){
    var b=typeof budgetPressureFor==='function'?budgetPressureFor(r):null,rv=typeof revalRadar==='function'?revalRadar(r):null,t=typeof trajectory==='function'?trajectory(r):null;
    var budget=b?cl(b.score):50,reval=rv?cl(rv.score):35,trend=t?cl(Math.max(0,t.cagr)/.05*100):35;
    var gap=b&&b.trend?cl(Math.max(0,(+b.trend.total_levy_cagr||0)-(+b.trend.ratable_growth||0))/.05*100):35;
    return weighted([[reval,.35],[budget,.25],[trend,.25],[gap,.15]]);
  }
  function fiscalResilience(r){
    var b=typeof budgetPressureFor==='function'?budgetPressureFor(r):null;if(!b)return 0;
    var collection=b.budget&&b.budget.collection_rate!=null?cl(((+b.budget.collection_rate)-.90)/.10*100):50;
    var debt=b.budget&&b.budget.debt_service_share!=null?cl(100-(+b.budget.debt_service_share)/.20*100):50;
    return weighted([[cl(100-b.score),.35],[costAbsorption(r),.30],[collection,.20],[debt,.15]]);
  }
  function defensibility(r){
    var c=typeof chapter123==='function'?chapter123(r):null,u=typeof uniFor==='function'?uniFor(r):null,comp=comparableReliability(r);
    var within=c&&c.testable?(c.hasCase?15:100):45,uniformity=u?cl(+u.score||0):45,anchor=c&&c.testable?100:30;
    return weighted([[comp,.30],[uniformity,.25],[within,.25],[anchor,.20]]);
  }
  function metrics(r){return [
    ['watchdog.comparable_evidence_reliability','Comparable Evidence Reliability',comparableReliability(r),'Confidence in the municipal verified-sale evidence supporting property-level analysis.'],
    ['watchdog.municipal_cost_absorption_score','Municipal Cost Absorption Score',costAbsorption(r),'How well ratable growth and tax collections are absorbing levy growth.'],
    ['watchdog.transaction_tax_shock_index','Transaction Tax Shock Index',taxShock(r),'Combined revaluation, fiscal and tax-rate conditions that can change the carrying-cost conversation.'],
    ['watchdog.fiscal_resilience_score','Municipal Fiscal Resilience Score',fiscalResilience(r),'Capacity signal combining budget pressure, cost absorption, collections and debt-service burden.'],
    ['watchdog.assessment_defensibility_score','Assessment Defensibility Score',defensibility(r),'How well the current assessment is supported by independent evidence and assessment consistency.']
  ];}
  function card(r){
    var ms=metrics(r);
    return toolCard('Cross-Professional Decision Signals','fa-compass-drafting',
      '<p class="tl-p">Five new Watchdog-derived markers built for professionals who need to triage a property quickly before opening the deeper evidence. Every score is calculated from already-attributed public inputs and links to its formula.</p>'+
      '<div class="rai-grid">'+ms.map(function(m){return '<a class="dm" data-marker-id="'+m[0]+'" data-marker-value="'+m[2]+' / 100" data-marker-note="'+m[3].replace(/"/g,'&quot;')+'" href="/property/marker.html?id='+encodeURIComponent(m[0])+'&value='+encodeURIComponent(m[2]+' / 100')+'&note='+encodeURIComponent(m[3])+'"><span><b>'+m[1]+'</b><small>'+m[3]+'</small></span><strong>'+m[2]+'</strong><i class="fas fa-chevron-right"></i></a>';}).join('')+'</div>'+
      '<div class="tl-fine">These are screening and prioritization signals, not legal, appraisal, lending or investment conclusions. Missing inputs reduce or neutralize component confidence rather than being silently treated as favorable evidence.</div>');
  }
  Object.assign(window,{professionalDecisionSignals:metrics,comparableEvidenceReliability:comparableReliability,municipalCostAbsorption:costAbsorption,transactionTaxShock:taxShock,fiscalResilience:fiscalResilience,assessmentDefensibility:defensibility,toolProfessionalDecisionSignals:card});
})();
export {};
