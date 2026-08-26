/* NJ Farmland Assessment qualification screener using current 2026 rules. */
(function () {
  'use strict';
  var STORE = 'wd_farmland_screen_v1';
  var propertyCache = {};
  function readAll() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function keyFor(r) { return String((r && (r.pams_pin || r.id)) || 'property'); }
  function savedFor(r) { return readAll()[keyFor(r)] || {}; }
  function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function yes(v) { return String(v) === 'yes'; }
  function selected(v,c){return String(v)===String(c)?' selected':'';}
  function deadline() {
    var now = new Date(), year = now.getFullYear(), d = new Date(year, 7, 1, 23, 59, 59);
    if (now > d) { year++; d = new Date(year, 7, 1, 23, 59, 59); }
    return { date:d, filingYear:year, taxYear:year+1, days:Math.max(0,Math.ceil((d-now)/86400000)) };
  }
  function threshold(s) {
    var acres = n(s.acres), extra = Math.max(0, acres - 5);
    return s.use === 'woodland' ? 500 + extra * .5 : 1000 + extra * 5;
  }
  function evaluate(s) {
    var acres=n(s.acres), sales=n(s.sales), req=threshold(s), checks=[];
    checks.push({ok:acres>=5,label:'At least 5 contiguous acres actively devoted'});
    checks.push({ok:yes(s.two_years),label:'Devoted to qualifying use for the prior 2 consecutive years'});
    checks.push({ok:acres>=5 && sales>=req,label:'Gross-sales test: ' + money(req) + ' required for ' + (acres||0).toFixed(1) + ' acres'});
    checks.push({ok:yes(s.continue_use),label:'Use will continue through the tax year'});
    if(s.use==='woodland') checks.push({ok:yes(s.woodland_plan),label:'Non-appurtenant woodland management plan in place'});
    if(acres>0 && acres<7) checks.push({ok:yes(s.narrative),label:'Under 7 acres: narrative and location sketch prepared'});
    var entered=acres>0 || sales>0 || s.two_years || s.continue_use;
    var passed=entered && checks.every(function(x){return x.ok;});
    return {entered:entered,passed:passed,checks:checks,required:req};
  }
  function rollbackYear(s, suffix) {
    var qualified = String(s['rb_qualified_'+suffix] || 'yes') !== 'no';
    var farmlandAssessment = n(s['rb_farmland_'+suffix]);
    var fullFairValue = n(s['rb_full_value_'+suffix]);
    var countyLevel = n(s['rb_level_'+suffix]);
    var taxRate = n(s['rb_rate_'+suffix]);
    var entered = farmlandAssessment > 0 || fullFairValue > 0 || countyLevel > 0 || taxRate > 0;
    if (!qualified) return { entered:entered, qualified:false, complete:true, amount:0, otherAssessment:0, additionalAssessment:0 };
    var complete = farmlandAssessment >= 0 && fullFairValue > 0 && countyLevel > 0 && taxRate > 0;
    var otherAssessment = complete ? fullFairValue * (countyLevel / 100) : 0;
    var additionalAssessment = complete ? Math.max(0, otherAssessment - farmlandAssessment) : 0;
    var amount = complete ? additionalAssessment * (taxRate / 100) : 0;
    return { entered:entered, qualified:true, complete:complete, amount:amount, otherAssessment:otherAssessment, additionalAssessment:additionalAssessment };
  }
  function rollbackEstimate(s) {
    var years = ['0','1','2'].map(function(suffix){ return rollbackYear(s, suffix); });
    var entered = years.some(function(y){ return y.entered; });
    var complete = entered && years.every(function(y){ return !y.qualified || y.complete; });
    var total = years.reduce(function(sum,y){ return sum + y.amount; },0);
    return { years:years, entered:entered, complete:complete, total:total };
  }
  function rbField(s, suffix, label, key, placeholder) {
    return '<label><span>'+label+'</span><input data-fa="rb_'+key+'_'+suffix+'" inputmode="decimal" placeholder="'+placeholder+'" value="'+esc(s['rb_'+key+'_'+suffix]||'')+'"></label>';
  }
  function rbYearBlock(s, suffix, label) {
    var q = s['rb_qualified_'+suffix] || 'yes';
    return '<div class="fa-rollback-year"><b>'+label+'</b>'+
      '<label><span>Farmland assessed that year?</span><select data-fa="rb_qualified_'+suffix+'"><option value="yes"'+selected('yes',q)+'>Yes</option><option value="no"'+selected('no',q)+'>No</option></select></label>'+
      rbField(s,suffix,'Actual farmland land assessment','farmland','e.g. 12500')+
      rbField(s,suffix,'Full and fair land value without farmland treatment','full_value','e.g. 240000')+
      rbField(s,suffix,'County percentage level','level','e.g. 100')+
      rbField(s,suffix,'General property tax rate (per $100)','rate','e.g. 3.125')+
      '</div>';
  }
  function rollbackSummary(rb) {
    if (!rb.entered) return '<p>Enter the three tax-year inputs below to estimate exposure. Watchdog does not infer historical full-and-fair value, county level, or tax rates.</p>';
    if (!rb.complete) return '<p><b>Estimate incomplete.</b> Each farmland-assessed year needs full-and-fair land value, county percentage level, and that year’s General Tax Rate. Years not farmland assessed should be marked No.</p>';
    return '<p><b>Estimated three-year roll-back exposure: '+money(rb.total)+'</b></p>'+
      '<p>'+rb.years.map(function(y,i){return (i===0?'Year of change':(i===1?'Prior year':'Two years prior'))+': '+money(y.amount);}).join(' · ')+'</p>';
  }
  function toolFarmland(r) {
    propertyCache[keyFor(r)] = r;
    var s=savedFor(r), e=evaluate(s), rb=rollbackEstimate(s), d=deadline(), k=keyFor(r).replace(/[^a-zA-Z0-9_-]/g,'');
    var status=!e.entered?['neutral','Enter the facts to screen this parcel','This is a rule checklist, not an automatic qualification.']:
      e.passed?['good','Passes the basic statutory screen','The assessor still determines eligibility and may require supporting proof.']:
      ['bad','One or more basic requirements are not met','The checklist below shows exactly which requirement is missing.'];
    return toolCard('Farmland Assessment qualification', 'fa-seedling',
      '<p class="tl-p">Qualified agricultural or horticultural land is assessed for productivity rather than ordinary market value. New Jersey tightened the ordinary gross-sales threshold; this screener uses the current rules published in 2026.</p>'+
      '<div class="fa-status '+status[0]+'"><i class="fas fa-seedling"></i><div><b>'+status[1]+'</b><span>'+status[2]+'</span></div></div>'+
      '<div class="fa-deadline"><b>Next filing deadline: Aug. 1, '+d.filingYear+'</b><span>For tax year '+d.taxYear+' · '+d.days+' days away</span></div>'+
      '<div class="fa-form" id="fa-'+k+'">'+
        '<label><span>Acres actively devoted</span><input data-fa="acres" inputmode="decimal" placeholder="e.g. 7.5" value="'+esc(s.acres||'')+'"></label>'+
        '<label><span>Primary qualifying use</span><select data-fa="use"><option value="ag"'+selected('ag',s.use||'ag')+'>Crops / livestock / horticulture</option><option value="woodland"'+selected('woodland',s.use)+'>Non-appurtenant woodland</option></select></label>'+
        '<label><span>Annual gross sales</span><input data-fa="sales" inputmode="decimal" placeholder="e.g. 1500" value="'+esc(s.sales||'')+'"></label>'+
        '<label><span>Qualifying use for prior 2 consecutive years?</span><select data-fa="two_years"><option value="">Choose</option><option value="yes"'+selected('yes',s.two_years)+'>Yes</option><option value="no"'+selected('no',s.two_years)+'>No</option></select></label>'+
        '<label><span>Continue qualifying use through tax year?</span><select data-fa="continue_use"><option value="">Choose</option><option value="yes"'+selected('yes',s.continue_use)+'>Yes</option><option value="no"'+selected('no',s.continue_use)+'>No</option></select></label>'+
        '<label><span>Woodland management plan?</span><select data-fa="woodland_plan"><option value="">Not applicable / choose</option><option value="yes"'+selected('yes',s.woodland_plan)+'>Yes</option><option value="no"'+selected('no',s.woodland_plan)+'>No</option></select></label>'+
        '<label><span>Under 7 acres: narrative + sketch ready?</span><select data-fa="narrative"><option value="">Not applicable / choose</option><option value="yes"'+selected('yes',s.narrative)+'>Yes</option><option value="no"'+selected('no',s.narrative)+'>No</option></select></label>'+
        '<div class="fa-rollback"><b><i class="fas fa-rotate-left"></i> Roll-back tax exposure calculator</b>'+rollbackSummary(rb)+'<p>Statutory estimate: for each applicable year, full-and-fair land value × county percentage level = non-farmland land assessment; subtract the actual farmland assessment; multiply the difference by that year’s General Tax Rate. The assessor and County Board make the official determination.</p></div>'+
        rbYearBlock(s,'0','Year of change in use')+
        rbYearBlock(s,'1','One tax year before change')+
        rbYearBlock(s,'2','Two tax years before change')+
        '<button class="fa-save" type="button" onclick="dbFarmSave(\''+esc(keyFor(r)).replace(/'/g,'')+'\')"><i class="fas fa-calculator"></i> Save & recalculate</button>'+
      '</div>'+
      (e.entered?'<div class="fa-checks">'+e.checks.map(function(c){return '<p class="'+(c.ok?'ok':'no')+'"><i class="fas '+(c.ok?'fa-circle-check':'fa-circle-xmark')+'"></i><span>'+esc(c.label)+'</span></p>';}).join('')+'</div>':'')+
      '<div class="fa-links"><a href="https://www.nj.gov/treasury/taxation/lpt/lpt-farmland.shtml" target="_blank" rel="noopener">NJ Farmland Assessment</a><a href="https://www.nj.gov/treasury/taxation/prntlpt.shtml" target="_blank" rel="noopener">FA-1 / FA-1 G.S. forms</a></div>'+
      '<div class="tl-fine">Source: NJ Division of Taxation Farmland Assessment guidance, updated May 28, 2026, and N.J.S.A. 54:4-23.8. Roll-back taxes apply for the year of change and up to the two immediately preceding years in which the land received Farmland Assessment. This calculator is an estimate only and deliberately requires historical inputs instead of fabricating them. The local assessor and County Board determine the official assessment and tax. Entries are private to this browser.</div>');
  }
  window.dbFarmSave=function(key){var id=String(key||'').replace(/[^a-zA-Z0-9_-]/g,''),host=document.getElementById('fa-'+id);if(!host)return;var data={};host.querySelectorAll('[data-fa]').forEach(function(node){data[node.getAttribute('data-fa')]=node.value;});var all=readAll();all[String(key)]=data;try{localStorage.setItem(STORE,JSON.stringify(all));}catch(e){}if(typeof toast==='function')toast('Farmland screen saved');var r=propertyCache[String(key)];if(r){var card=host.closest('.sec');if(card)card.outerHTML=toolFarmland(r);}};
  Object.assign(window,{toolFarmland:toolFarmland,farmlandSavedFor:savedFor,farmlandRollbackEstimate:rollbackEstimate});
})();

export {};
