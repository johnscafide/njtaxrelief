/* Shared Watchdog tax-year intelligence.
   Keeps observed, published and scenario values distinct so a revaluation
   assessment is never silently multiplied by a tax rate from another year. */
(function(){
  'use strict';
  function num(v){var n=Number(v);return Number.isFinite(n)?n:null}
  function money(v){var n=num(v);return n==null?'—':n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}
  function year(v){var n=parseInt(v,10);return Number.isFinite(n)?n:null}
  function rateForYear(town,county,target,rates){
    if(!rates||!target)return null;var t=String(town||'').toUpperCase().trim(),tc=t+' ('+String(county||'').toUpperCase().trim()+')',hit=null;
    Object.keys(rates).some(function(k){if(k.toUpperCase().trim()===tc){hit=rates[k];return true}return false});
    if(!hit)Object.keys(rates).some(function(k){if(k.toUpperCase().trim()===t){hit=rates[k];return true}return false});
    var r=hit&&num(hit[String(target)]);return r>0?r:null;
  }
  function observedTaxYear(r){return year(r.tax_year||r.last_year_tax_year||r.annual_tax_year||r.source_tax_year)}
  function assessmentYear(r){return year(r.assessment_year||r.assessed_year||r.tax_list_year||r.source_assessment_year)}
  function mismatch(r){var ay=assessmentYear(r),ty=observedTaxYear(r);return !!(ay&&ty&&ay!==ty)}
  function project(assessment,rate){assessment=num(assessment);rate=num(rate);return assessment>0&&rate>0?assessment*(rate/100):null}
  function model(r,rates){
    r=r||{};var ay=assessmentYear(r),ty=observedTaxYear(r),assessed=num(r.assessed!=null?r.assessed:r.assessed_value),tax=num(r.last_year_tax),rate=rateForYear(r.town||r.municipality,r.county,ay,rates);
    return {assessment:assessed,assessment_year:ay,observed_tax:tax,observed_tax_year:ty,published_rate:rate,published_rate_year:rate?ay:null,revaluation_guard:mismatch(r),projected_tax:(!mismatch(r)&&rate&&ay)?project(assessed,rate):null};
  }
  function timeline(r,rates){
    var m=model(r,rates),out=[];
    if(m.observed_tax!=null)out.push({year:m.observed_tax_year,label:'Billed tax',value:money(m.observed_tax),status:'Observed',tone:'official'});
    if(m.assessment!=null)out.push({year:m.assessment_year,label:'Assessment',value:money(m.assessment),status:'Official record',tone:'official'});
    if(m.published_rate)out.push({year:m.published_rate_year,label:'General tax rate',value:m.published_rate.toFixed(3)+'%',status:'State published',tone:'published'});
    if(m.revaluation_guard)out.push({year:m.assessment_year,label:'Tax estimate',value:'Awaiting same-year rate',status:'Protected',tone:'waiting'});
    else if(m.projected_tax!=null)out.push({year:m.assessment_year,label:'Calculated tax',value:money(m.projected_tax),status:'Calculated from same-year published rate',tone:'estimate'});
    return out;
  }
  window.WatchdogTaxYears={model:model,timeline:timeline,project:project,rateForYear:rateForYear,mismatch:mismatch};
})();
