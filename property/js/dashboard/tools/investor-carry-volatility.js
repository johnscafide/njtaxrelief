/* Watchdog proprietary: tax-driven carry-cost volatility. */
(function () {
  'use strict';
  function clamp(v){return Math.max(0,Math.min(100,+v||0));}
  function pct(v){return v==null?'—':((+v)*100).toFixed(1)+'%';}
  function calc(r){
    var b=typeof budgetPressureFor==='function'?budgetPressureFor(r):null;
    var t=typeof trajectory==='function'?trajectory(r):null;
    var rv=typeof revalRadar==='function'?revalRadar(r):null;
    var x=typeof exemptPilotFor==='function'?exemptPilotFor(r):null;
    if(!b&&!t&&!rv)return null;
    var gap=b&&b.trend?Math.max(0,(+b.trend.total_levy_cagr||0)-(+b.trend.ratable_growth||0)):0;
    var parts=[
      {label:'Municipal budget pressure',value:b?clamp(b.score):50,weight:.32},
      {label:'Levy / ratable growth gap',value:clamp(gap/.05*100),weight:.24},
      {label:'Revaluation reset pressure',value:rv?clamp(rv.score):35,weight:.22},
      {label:'Tax-rate trend',value:t?clamp(Math.max(0,t.cagr)/.05*100):35,weight:.14},
      {label:'Exempt / PILOT exposure',value:x?clamp((+x.exempt_share||0)/.35*100):25,weight:.08}
    ];
    var score=Math.round(parts.reduce(function(a,p){return a+p.value*p.weight;},0));
    var band=score>=70?'High':score>=48?'Elevated':score>=25?'Moderate':'Low';
    var tax=+r.last_year_tax||0,cagr=t?t.cagr:0;
    return {score:score,band:band,parts:parts,gap:gap,cagr:cagr,tax:tax,one:tax*Math.pow(1+Math.max(-.1,cagr),1),three:tax*Math.pow(1+Math.max(-.1,cagr),3),five:tax*Math.pow(1+Math.max(-.1,cagr),5)};
  }
  function card(r){
    var v=calc(r);if(!v)return '';
    return toolCard('Investor Carry-Cost Volatility','fa-chart-area',
      '<p class="tl-p">A Watchdog operating-cost stability signal for investors. It combines municipal fiscal pressure, levy growth that is not being absorbed by new ratables, revaluation pressure, the tax-rate path and exempt/PILOT exposure.</p>'+
      '<div class="pci-hero"><div><b>'+v.score+'</b><span>/ 100 volatility</span></div><p><strong>'+v.band+' carry-cost uncertainty.</strong> This measures tax-driven variability, not investment quality or a forecast of the next bill.</p></div>'+
      '<div class="pci-grid">'+v.parts.map(function(p){return '<div><span>'+p.label+'</span><b>'+Math.round(p.value)+'</b><i><em style="width:'+p.value+'%"></em></i></div>';}).join('')+'</div>'+
      (v.tax?'<div class="pci-scenarios"><span><small>Current tax</small><b>'+money(v.tax)+'</b></span><span><small>1-year path</small><b>'+money(v.one)+'</b></span><span><small>3-year path</small><b>'+money(v.three)+'</b></span><span><small>5-year path</small><b>'+money(v.five)+'</b></span></div>':'')+
      '<div class="tl-fine">Watchdog proprietary model. Weights: budget pressure 32%, levy/base gap 24%, revaluation pressure 22%, rate trend 14%, exempt/PILOT exposure 8%. The dollar path simply carries the historical tax-rate CAGR forward while holding the assessment fixed. Sources: NJ Division of Taxation, NJ DCA User-Friendly Budgets, Abstract of Ratables, SR1A/uniformity data and DCA PILOT data.</div>');
  }
  function portfolio(list){
    var vals=(list||[]).map(function(r){var v=calc(r);return v?{r:r,v:v}:null;}).filter(Boolean).sort(function(a,b){return b.v.score-a.v.score;});
    if(!vals.length)return '';
    var avg=Math.round(vals.reduce(function(a,x){return a+x.v.score;},0)/vals.length);
    var byTown={};vals.forEach(function(x){var k=String(x.r.town||x.r.municipality||'Unknown');byTown[k]=(byTown[k]||0)+Math.max(1,x.v.tax);});var total=Object.keys(byTown).reduce(function(a,k){return a+byTown[k];},0),shares=Object.keys(byTown).map(function(k){return{town:k,share:byTown[k]/total};}).sort(function(a,b){return b.share-a.share;}),hhi=Math.round(shares.reduce(function(a,x){return a+x.share*x.share;},0)*100),top=shares[0];
    return '<section class="sec"><h4><i class="fas fa-chart-area"></i> Investor Carry-Cost Volatility</h4><div class="pci-portfolio"><div class="pci-hero"><div><b>'+avg+'</b><span>/ 100 portfolio average</span></div><p>Tax-driven operating-cost uncertainty across '+vals.length+' saved propert'+(vals.length===1?'y':'ies')+'.</p></div><div class="pci-scenarios"><span><small>Municipal concentration</small><b>'+hhi+'/100</b></span><span><small>Largest town share</small><b>'+(top?Math.round(top.share*100)+'%':'—')+'</b></span><span><small>Largest exposure</small><b>'+(top?top.town:'—')+'</b></span></div>'+vals.slice(0,8).map(function(x){return '<a href="/property/home.html?pin='+encodeURIComponent(x.r.pams_pin||'')+'#sec-compare"><span>'+String(x.r.address||'Saved property')+'</span><b>'+x.v.score+' · '+x.v.band+'</b></a>';}).join('')+'</div></section>';
  }
  Object.assign(window,{carryCostVolatility:calc,toolCarryCostVolatility:card,toolCarryCostPortfolio:portfolio});
})();
export {};
