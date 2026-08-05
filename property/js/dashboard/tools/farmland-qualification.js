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
  function toolFarmland(r) {
    propertyCache[keyFor(r)] = r;
    var s=savedFor(r), e=evaluate(s), d=deadline(), k=keyFor(r).replace(/[^a-zA-Z0-9_-]/g,'');
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
        '<button class="fa-save" type="button" onclick="dbFarmSave(\''+esc(keyFor(r)).replace(/'/g,'')+'\')"><i class="fas fa-calculator"></i> Save & recalculate</button>'+
      '</div>'+
      (e.entered?'<div class="fa-checks">'+e.checks.map(function(c){return '<p class="'+(c.ok?'ok':'no')+'"><i class="fas '+(c.ok?'fa-circle-check':'fa-circle-xmark')+'"></i><span>'+esc(c.label)+'</span></p>';}).join('')+'</div>':'')+
      '<div class="fa-rollback"><b><i class="fas fa-rotate-left"></i> Roll-back tax exposure</b><p>If qualified land changes to a non-farm use, New Jersey says roll-back taxes apply for the year of the change and the two preceding years, to the extent the land was farmland assessed. The roll-back is the difference between the farmland assessment and the assessment that would otherwise have applied.</p></div>'+
      '<div class="fa-links"><a href="https://www.nj.gov/treasury/taxation/lpt/lpt-farmland.shtml" target="_blank" rel="noopener">NJ Farmland Assessment</a><a href="https://www.nj.gov/treasury/taxation/prntlpt.shtml" target="_blank" rel="noopener">FA-1 / FA-1 G.S. forms</a></div>'+
      '<div class="tl-fine">Source: NJ Division of Taxation Farmland Assessment guidance, updated May 28, 2026. Current basic criteria include 5 contiguous actively devoted acres, two prior consecutive years of qualifying use, Aug. 1 filing, continued use through the tax year, and gross sales of at least $1,000 for the first 5 acres plus $5 per additional acre for crops/livestock. Woodland/wetland under a Woodland Management Plan uses $500 for the first 5 acres plus $0.50 per additional acre. The local tax assessor makes the eligibility decision. Entries are private to this browser.</div>');
  }
  window.dbFarmSave=function(key){var id=String(key||'').replace(/[^a-zA-Z0-9_-]/g,''),host=document.getElementById('fa-'+id);if(!host)return;var data={};host.querySelectorAll('[data-fa]').forEach(function(node){data[node.getAttribute('data-fa')]=node.value;});var all=readAll();all[String(key)]=data;try{localStorage.setItem(STORE,JSON.stringify(all));}catch(e){}if(typeof toast==='function')toast('Farmland screen saved');var r=propertyCache[String(key)];if(r){var card=host.closest('.sec');if(card)card.outerHTML=toolFarmland(r);}};
  Object.assign(window,{toolFarmland:toolFarmland,farmlandSavedFor:savedFor});
})();

export {};
