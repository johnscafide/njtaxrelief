/* Watchdog proprietary lender workflow: forward collateral / escrow tax stress. */
(function () {
  'use strict';
  function n(v,d){v=+v;return isFinite(v)?v:(d||0);} function clamp(v){return Math.max(0,Math.min(100,v));}
  function metrics(r, opts) {
    opts=opts||{};var price=n(opts.price,r.watchdog_value||0), base=n(r.last_year_tax), assessed=n(r.assessed);
    if(!base||!assessed)return null;
    var bc=typeof buyerCost==='function'&&price?buyerCost(r,price):null;
    var bp=typeof budgetPressureFor==='function'?budgetPressureFor(r):null;
    var rv=typeof revalRadar==='function'?revalRadar(r):null;
    var rate=base/assessed,growth=bc?bc.rateGrowth:(bp&&bp.trend?n(bp.trend.total_levy_cagr,.025):.025);
    var added=n(opts.addedAssessment,Math.max(0,(price||assessed)-assessed)*.15),insurance=n(opts.insurance,0),flood=n(opts.flood,0);
    var caught=bc?n(bc.caughtTax,base):base,addedTax=added*rate,stressed=Math.max(base,caught)+addedTax;
    var y=[1,3,5].map(function(k){return {year:k,tax:stressed*Math.pow(1+growth,k),monthly:(stressed*Math.pow(1+growth,k)+insurance+flood)/12};});
    var currentMonthly=(base+insurance+flood)/12,shock=y[0].monthly-currentMonthly;
    var volatility=bp?clamp(bp.score):35,reval=rv?clamp(rv.score):25;
    var percentile=Math.round(clamp(20+Math.max(0,shock)/Math.max(1,currentMonthly)*120+volatility*.35+reval*.25));
    var reserve=Math.ceil(Math.max(shock*6,(y[2].monthly-currentMonthly)*3,0)/100)*100;
    return {base:base,price:price,added:added,addedTax:addedTax,insurance:insurance,flood:flood,growth:growth,y:y,shock:shock,percentile:percentile,reserve:reserve,volatility:volatility,reval:reval};
  }
  function card(r){var v=metrics(r);if(!v)return'';return toolCard('Collateral & Escrow Stress Lab','fa-vault',
    '<p class="tl-p">A lender-oriented payment-shock screen that separates today’s tax bill from assessment catch-up, added-assessment exposure, municipal growth and insurance inputs.</p>'+
    '<div class="ces-kpis"><span><small>1-year stressed tax</small><b>'+money(v.y[0].tax)+'</b></span><span><small>5-year stressed tax</small><b>'+money(v.y[2].tax)+'</b></span><span><small>Payment-shock percentile</small><b>'+v.percentile+'th</b></span><span><small>Suggested tax reserve</small><b>'+money(v.reserve)+'</b></span></div>'+
    '<div class="ces-inputs"><label>Added assessment <input type="number" min="0" step="1000" value="'+Math.round(v.added)+'" data-ces="added"></label><label>Annual insurance <input type="number" min="0" step="100" value="0" data-ces="insurance"></label><label>Annual flood premium <input type="number" min="0" step="100" value="0" data-ces="flood"></label><button type="button" onclick="cesRecalc(this,\''+esc(r.pams_pin||'')+'\')">Run stress</button></div>'+
    '<div class="ces-result"><b>Municipal levy / budget volatility: '+Math.round(v.volatility)+'/100</b><span> · Revaluation sensitivity '+Math.round(v.reval)+'/100 · historical rate path '+(v.growth*100).toFixed(1)+'%/yr</span></div>'+
    '<div class="tl-fine">Watchdog scenario model, not an escrow disclosure, insurance quote or underwriting decision. Reserve is a planning buffer derived from modeled payment shock. Confirm taxes, added assessments and insurance with controlling sources before closing.</div>');}
  window.cesRecalc=function(btn,pin){var r=(window.rows||[]).filter(function(x){return x.pams_pin===pin;})[0];if(!r)return;var box=btn.closest('.tool,.tl-card,.sec2-body')||btn.parentNode.parentNode;var get=function(k){var e=box.querySelector('[data-ces="'+k+'"]');return e?+e.value:0;};var v=metrics(r,{addedAssessment:get('added'),insurance:get('insurance'),flood:get('flood')});var out=box.querySelector('.ces-result');if(out&&v)out.innerHTML='<b>1-year monthly housing-cost shock: '+money(v.shock)+'/mo</b><span> · '+v.percentile+'th stress percentile · reserve '+money(v.reserve)+'</span>';};
  Object.assign(window,{collateralEscrowStress:metrics,toolCollateralEscrowStress:card});
})();
export {};
