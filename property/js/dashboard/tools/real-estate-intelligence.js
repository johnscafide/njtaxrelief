/* Ten transparent Watchdog-derived signals for real-estate professionals. */
(function(){
  'use strict';
  function cl(v){return Math.max(0,Math.min(100,Math.round(+v||0)));}
  function avg(parts){var w=0,n=0;parts.forEach(function(p){n+=p[0]*p[1];w+=p[1];});return cl(w?n/w:0);}
  function metrics(r){
    var b=typeof budgetPressureFor==='function'?budgetPressureFor(r):null,rv=typeof revalRadar==='function'?revalRadar(r):null,u=typeof uniFor==='function'?uniFor(r):null,t=typeof trajectory==='function'?trajectory(r):null,s=typeof sr1aFor==='function'?sr1aFor(r):null,c=typeof chapter123==='function'?chapter123(r):null,m=typeof marketValue==='function'?marketValue(r):null;
    var burden=m&&m.v&&r.last_year_tax?cl((+r.last_year_tax/m.v)/.035*100):50,budget=b?cl(b.score):50,reval=rv?cl(rv.score):35,uneven=u?cl(100-(+u.score||50)):50,trend=t?cl(Math.max(0,t.cagr)/.05*100):40,confidence=s?cl((+s.n||0)/120*100):25,appeal=c&&c.testable?cl((c.hasCase?55:20)+Math.max(0,c.over||0)/(+r.assessed||1)*250):15;
    var complete=cl([r.pams_pin,r.address,r.assessed,r.last_year_tax,r.block,r.lot,(r._sqft||r.living_sqft),(r._lastSale||r.watchdog_value),m&&m.v].filter(Boolean).length/9*100);
    var risk=avg([[budget,.23],[reval,.23],[uneven,.18],[trend,.18],[appeal,.18]]);
    return [
      ['watchdog.listing_friction_index','Listing Friction Index',risk,'Higher = more issues likely to complicate a buyer conversation.'],
      ['watchdog.tax_carry_advantage','Tax Carry Advantage',cl(100-burden),'Higher = lighter recurring property-tax burden relative to the model range.'],
      ['watchdog.buyer_objection_radar','Buyer Objection Radar',cl(Math.max(budget,reval,uneven,appeal)),'Highest current tax or assessment objection signal.'],
      ['watchdog.prelist_readiness_score','Pre-List Readiness Score',avg([[complete,.55],[confidence,.25],[100-risk,.20]]),'Record completeness, evidence confidence and lower surprise risk.'],
      ['watchdog.marketability_drag_index','Marketability Drag Index',avg([[burden,.34],[budget,.23],[reval,.23],[uneven,.20]]),'Recurring tax and municipal conditions that can narrow buyer appeal.'],
      ['watchdog.revaluation_conversation_risk','Revaluation Conversation Risk',avg([[reval,.70],[uneven,.30]]),'How urgently a future assessment reset belongs in the client conversation.'],
      ['watchdog.offer_diligence_priority','Offer Diligence Priority',avg([[risk,.55],[100-complete,.25],[100-confidence,.20]]),'Higher = more source verification before an offer or waiver decision.'],
      ['watchdog.verified_listing_story_strength','Verified Listing Story Strength',avg([[complete,.50],[confidence,.35],[100-uneven,.15]]),'Strength of source-backed facts available to support the listing story.'],
      ['watchdog.assessment_surprise_index','Assessment Surprise Index',avg([[reval,.40],[appeal,.30],[trend,.15],[budget,.15]]),'Likelihood that assessment or tax context becomes a material transaction conversation.'],
      ['watchdog.tax_trend_position','Tax Trend Position',cl(100-trend),'Higher = more stable or restrained recent municipal tax-rate trajectory.']
    ];
  }
  function card(r){var ms=metrics(r);return toolCard('Real Estate Professional Intelligence','fa-house-circle-check','<p class="tl-p">Ten Watchdog-derived conversation signals for agents and brokers. Each is built from attributable tax, assessment, market and municipal inputs already in this report; they do not replace MLS facts, inspections or professional diligence.</p><div class="rai-grid">'+ms.map(function(m){return '<a class="dm" data-marker-id="'+m[0]+'" data-marker-value="'+m[2]+' / 100" data-marker-note="'+m[3].replace(/"/g,'&quot;')+'" href="/property/marker.html?id='+encodeURIComponent(m[0])+'&value='+encodeURIComponent(m[2]+' / 100')+'&note='+encodeURIComponent(m[3])+'"><span><b>'+m[1]+'</b><small>'+m[3]+'</small></span><strong>'+m[2]+'</strong><i class="fas fa-chevron-right"></i></a>';}).join('')+'</div><div class="tl-fine">Watchdog proprietary markers. Scores are decision aids, not predictions of sale price, buyer behavior, legal outcome or appraisal. The marker detail pages publish tier, professional fit, methodology and source lineage.</div>');}
  Object.assign(window,{realEstateProfessionalMarkers:metrics,toolRealEstateIntelligence:card});
})();
export {};
