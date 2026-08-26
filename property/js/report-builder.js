(function(){
'use strict';
var URL='https://uvkvaxljhhngydvlrzom.supabase.co',
    KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa',
    FN=URL+'/functions/v1/report-share',
    client,user,profile={},properties=[],reports=[],versions={},active=null;
var $=function(id){return document.getElementById(id);};
function sb(){return client||(client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}}));}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function label(v){return String(v||'').replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}
function money(v){return Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+v):'—';}
function money2(v){return Number.isFinite(+v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(+v):'—';}
function date(v){return v?new Date(v).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}):'—';}
function num(id){var el=$(id),v=el?Number(String(el.value||'').replace(/[$,\s]/g,'')):0;return Number.isFinite(v)?v:0;}
function agentBrand(){var b=profile&&profile.pro_agent&&typeof profile.pro_agent==='object'?profile.pro_agent:{};return{agent_name:profile.display_name||profile.full_name||'',brokerage_name:b.brokerage_name||'',license_number:b.license_number||'',business_phone:b.business_phone||profile.phone||'',business_email:b.business_email||profile.email||'',headshot_url:b.headshot_url||profile.photo_url||profile.avatar_url||'',brokerage_logo_url:b.brokerage_logo_url||'',disclosure:b.disclosure||''};}
function brandHtml(b){var bits=[];if(b.brokerage_name)bits.push(esc(b.brokerage_name));if(b.license_number)bits.push('NJ license '+esc(b.license_number));if(b.business_phone)bits.push(esc(b.business_phone));if(b.business_email)bits.push(esc(b.business_email));return'<section class="rb-brand"><div class="rb-brand-primary">'+(b.headshot_url?'<img class="rb-brand-headshot" src="'+esc(b.headshot_url)+'" alt="">':'')+'<div><span>PREPARED BY</span><h3>'+esc(b.agent_name||'Watchdog professional')+'</h3><p>'+bits.join(' · ')+'</p></div></div><div class="rb-brand-data">'+(b.brokerage_logo_url?'<img src="'+esc(b.brokerage_logo_url)+'" alt="Brokerage logo">':'')+'<b>Data by Watchdog</b><small>Governed New Jersey property intelligence</small></div></section>'+(b.disclosure?'<p class="rb-brand-disclosure">'+esc(b.disclosure)+'</p>':'');}
var defaults={
  attorney_title:['property.assessed','property.block','property.lot','property.owner_verified','title.evidence_confidence'],
  lender_collateral:['property.assessed','property.annual_tax','property.market_value','tax.effective_rate','lender.collateral_escrow_stress'],
  broker_listing:['property.annual_tax','property.market_value','town.median_sale','broker.listing_brief_score','permit.lifecycle_score'],
  investor_diligence:['property.annual_tax','tax.effective_rate','investor.carry_cost_volatility','town.budget_pressure','property.market_value'],
  appeal_case:['property.assessed','property.market_value','appeal.chapter_123_margin','appeal.evidence_strength','town.uniformity_score'],
  seller_net_sheet:['property.assessed','property.annual_tax','property.market_value','tax.effective_rate'],
  custom:[]
};
function sourceManifest(markers,preset){
  var list=markers.map(function(id){return{marker_id:id,source:'Watchdog governed marker registry',source_url:'/property/marker?id='+encodeURIComponent(id),captured_at:new Date().toISOString()};});
  if(preset==='seller_net_sheet'){
    list.push({marker_id:'nj.rtf.2026_schedule',source:'NJ Division of Taxation: Realty Transfer Fee',source_url:'https://www.nj.gov/treasury/taxation/realty.shtml',captured_at:new Date().toISOString()});
    list.push({marker_id:'nj.rtf.partial_exemption',source:'NJ Division of Taxation: Realty Transfer Fee FAQs',source_url:'https://www.nj.gov/treasury/taxation/lpt/rtffaqs.shtml',captured_at:new Date().toISOString()});
  }
  return list;
}
function ceil500(n){return Math.ceil(Math.max(0,n)/500);}
function progressive(price,bands){var fee=0,used=0;for(var i=0;i<bands.length;i++){var cap=bands[i][0],rate=bands[i][1],amount=Math.max(0,Math.min(price,cap)-used);if(amount>0)fee+=ceil500(amount)*rate;used=cap;if(price<=cap)break;}return fee;}
function rtf(price,partial){if(partial){return price<=350000?progressive(price,[[150000,.50],[350000,1.25]]):progressive(price,[[150000,1.40],[550000,2.15],[850000,2.65],[1000000,3.15],[Infinity,3.40]]);}return price<=350000?progressive(price,[[150000,2],[200000,3.35],[350000,3.90]]):progressive(price,[[150000,2.90],[200000,4.25],[550000,4.80],[850000,5.30],[1000000,5.80],[Infinity,6.05]]);}
function graduated(price,applies){if(!applies||price<=1000000)return 0;var pct=price<=2000000?.01:price<=2500000?.02:price<=3000000?.025:price<=3500000?.03:.035;return price*pct;}
function sellerNetFromDom(){
  var sale=num('rb-sale-price'),commissionRate=Math.max(0,Math.min(20,num('rb-commission-rate'))),payoff=Math.max(0,num('rb-payoff')),other=Math.max(0,num('rb-other-costs')),partial=$('rb-rtf-schedule')&&$('rb-rtf-schedule').value==='partial',gpfApplies=!!($('rb-gpf-applies')&&$('rb-gpf-applies').checked);
  var commission=sale*commissionRate/100,transfer=rtf(sale,partial),gpf=graduated(sale,gpfApplies),estimatedNet=sale-commission-payoff-other-transfer-gpf;
  return{sale_price:sale,commission_rate:commissionRate,commission_amount:commission,mortgage_payoff:payoff,other_seller_costs:other,rtf_schedule:partial?'partial':'standard',realty_transfer_fee:transfer,graduated_percent_fee_applies:gpfApplies,graduated_percent_fee:gpf,estimated_net:estimatedNet,calculation_version:'nj_rtf_2026_2025_gpf',calculated_at:new Date().toISOString(),disclaimer:'Estimate only. Confirm payoff, commission, exemptions, deed classification, recording fees, taxes, credits and closing figures with the applicable professionals and county recording office.'};
}
function sellerNetHtml(saved){
  saved=saved||{};
  return'<section class="rb-net"><h3>Seller net sheet inputs</h3><p class="rb-help">Transparent estimate only. Watchdog calculates from the inputs shown and the current NJ Division of Taxation RTF schedule; it does not infer contract terms, exemptions, payoff figures or legal eligibility.</p><div class="rb-net-grid">'+
    '<label>Sale price<input id="rb-sale-price" inputmode="decimal" value="'+esc(saved.sale_price||'')+'" placeholder="500000"></label>'+
    '<label>Commission rate (%)<input id="rb-commission-rate" inputmode="decimal" value="'+esc(saved.commission_rate==null?'':saved.commission_rate)+'" placeholder="5"></label>'+
    '<label>Mortgage / lien payoff<input id="rb-payoff" inputmode="decimal" value="'+esc(saved.mortgage_payoff||'')+'" placeholder="0"></label>'+
    '<label>Other seller costs<input id="rb-other-costs" inputmode="decimal" value="'+esc(saved.other_seller_costs||'')+'" placeholder="0"></label>'+
    '<label>RTF schedule<select id="rb-rtf-schedule"><option value="standard" '+(saved.rtf_schedule!=='partial'?'selected':'')+'>Standard transaction</option><option value="partial" '+(saved.rtf_schedule==='partial'?'selected':'')+'>Qualifying partial exemption</option></select></label>'+
    '<label class="rb-check"><input id="rb-gpf-applies" type="checkbox" '+(saved.graduated_percent_fee_applies===false?'':'checked')+'><span>Covered property class for the Graduated Percent Fee if sale price exceeds $1 million.</span></label>'+
  '</div><div id="rb-net-preview" class="rb-net-summary"></div></section>';
}
function refreshNet(){
  if(!active||active.preset!=='seller_net_sheet'||!$('rb-net-preview'))return;
  var n=sellerNetFromDom(),p=properties.find(function(x){return x.pams_pin===active.pams_pin;})||{};
  $('rb-net-preview').innerHTML='<div><span>Commission</span><b>'+money2(n.commission_amount)+'</b></div><div><span>NJ Realty Transfer Fee</span><b>'+money2(n.realty_transfer_fee)+'</b></div><div><span>Graduated Percent Fee</span><b>'+money2(n.graduated_percent_fee)+'</b></div><div class="rb-net-total"><span>Estimated seller net</span><b>'+money2(n.estimated_net)+'</b></div><p>Current recorded annual property tax context: <b>'+money2(p.last_year_tax)+'</b>. Buyer tax obligations can change after sale, reassessment, exemption changes or municipal updates and are not predicted here.</p>';
}
function modal(on){$('rb-modal').hidden=!on;$('rb-modal').style.display=on?'flex':'none';document.body.style.overflow=on?'hidden':'';if(on){var p=properties[0];$('rb-title').value=p?(p.address+' professional report'):'';$('rb-note').textContent='';}}
function list(){var q=$('rb-search').value.toLowerCase(),rows=reports.filter(function(r){return!q||(r.title+' '+r.pams_pin+' '+r.preset).toLowerCase().includes(q);});$('rb-reports').innerHTML=rows.length?rows.map(function(r){return'<button class="rb-report '+(active&&active.id===r.id?'on':'')+'" data-report="'+esc(r.id)+'"><b>'+esc(r.title)+'</b><span>'+esc(label(r.preset))+'</span><small>'+esc(date(r.updated_at))+'</small></button>';}).join(''):'<div class="rb-empty"><p>No reports yet.</p></div>';}
function evidence(p){return'<div class="rb-evidence"><article><span>ASSESSED</span><b>'+money(p&&p.assessed)+'</b></article><article><span>ANNUAL TAX</span><b>'+money(p&&p.last_year_tax)+'</b></article><article><span>MARKET VALUE</span><b>'+money(p&&p.watchdog_value)+'</b></article></div>';}
function render(){
  list();
  if(!active){$('rb-detail').innerHTML='<div class="rb-empty"><i class="fas fa-file-circle-plus"></i><h2>Build your first report</h2><p>Choose a profession preset, review the evidence, then save an immutable version before sharing or downloading a PDF.</p></div>';return;}
  var p=properties.find(function(x){return x.pams_pin===active.pams_pin;}),vs=versions[active.id]||[],markers=Array.isArray(active.selected_marker_ids)?active.selected_marker_ids:[],latest=vs[0]&&vs[0].content||{},b=latest.agent_branding||agentBrand();
  var net=active.preset==='seller_net_sheet'?sellerNetHtml(latest.seller_net_sheet):'';
  $('rb-detail').innerHTML=brandHtml(b)+'<div class="rb-file-head"><div><span class="rb-kicker">'+esc(label(active.preset))+' · '+esc(active.status)+'</span><h2>'+esc(active.title)+'</h2><p>'+esc(p&&p.address||active.pams_pin||'Professional report')+'</p></div><div class="rb-actions"><button class="rb-secondary" data-act="version"><i class="fas fa-camera"></i> Save version</button><button class="rb-secondary" data-act="share"><i class="fas fa-link"></i> Share read-only</button><button class="rb-secondary" data-act="print"><i class="fas fa-print"></i> Print preview</button><button class="rb-primary" data-act="pdf"><i class="fas fa-file-pdf"></i> Download PDF</button></div></div><div id="rb-share-result"></div><div class="rb-grid"><article class="rb-card rb-editor"><h3>Report narrative</h3>'+evidence(p)+net+'<label>Executive summary<textarea id="rb-summary" placeholder="State the professional conclusion, limitations and next action…">'+esc(latest.summary||'')+'</textarea></label><label>Marker IDs<input id="rb-markers" value="'+esc(markers.join(', '))+'"></label><button class="rb-primary" data-act="save">Save draft</button><span id="rb-save-note"></span></article><aside><article class="rb-card"><h3>Version history</h3>'+(vs.length?vs.map(function(v){return'<div class="rb-version"><b>Version '+(v.version_no||v.version_number||'—')+'</b><span>'+esc(date(v.created_at))+'</span></div>';}).join(''):'<p>No immutable version saved yet.</p>')+'</article><article class="rb-card" style="margin-top:18px"><h3>Source manifest</h3>'+(active.source_manifest||[]).map(function(s){return'<div class="rb-source"><b>'+esc(s.marker_id)+'</b><br><span>'+esc(s.source)+'</span></div>';}).join('')+'</article></aside></div>';
  if(active.preset==='seller_net_sheet'){
    ['rb-sale-price','rb-commission-rate','rb-payoff','rb-other-costs','rb-rtf-schedule','rb-gpf-applies'].forEach(function(id){var el=$(id);if(el)el.addEventListener('input',refreshNet);});
    refreshNet();
  }
}
function loadVersions(id){return sb().from('professional_report_versions').select('*').eq('report_id',id).order('version_no',{ascending:false}).then(function(r){versions[id]=r.data||[];});}
function select(id){active=reports.find(function(r){return r.id===id;});if(!active)return render();loadVersions(id).finally(render);}
function create(e){
  e.preventDefault();
  var p=properties.find(function(x){return x.pams_pin===$('rb-property').value;}),preset=$('rb-preset').value,markers=defaults[preset]||[];
  if(!p)return;
  $('rb-note').textContent='Creating…';
  sb().from('professional_reports').insert({user_id:user.id,pams_pin:p.pams_pin,preset:preset,title:$('rb-title').value.trim(),selected_marker_ids:markers,source_manifest:sourceManifest(markers,preset)}).select().single().then(function(r){if(r.error)throw r.error;reports.unshift(r.data);active=r.data;versions[active.id]=[];modal(false);render();}).catch(function(e){$('rb-note').textContent=e.message;});
}
function saveDraft(){
  var markers=$('rb-markers').value.split(',').map(function(x){return x.trim();}).filter(Boolean).filter(function(x,i,a){return a.indexOf(x)===i;}).slice(0,120),manifest=sourceManifest(markers,active.preset);
  $('rb-save-note').textContent=' Saving…';
  sb().from('professional_reports').update({selected_marker_ids:markers,source_manifest:manifest,updated_at:new Date().toISOString()}).eq('id',active.id).select().single().then(function(r){if(r.error)throw r.error;Object.assign(active,r.data);$('rb-save-note').textContent=' Saved';render();}).catch(function(e){$('rb-save-note').textContent=' '+e.message;});
}
function saveVersion(){
  var vs=versions[active.id]||[],content={summary:$('rb-summary').value,evidence_snapshot:properties.find(function(x){return x.pams_pin===active.pams_pin;})||{},title:active.title,preset:active.preset,agent_branding:agentBrand()};
  if(active.preset==='seller_net_sheet')content.seller_net_sheet=sellerNetFromDom();
  sb().from('professional_report_versions').insert({report_id:active.id,user_id:user.id,version_no:(vs[0]?(vs[0].version_no||vs[0].version_number||0):0)+1,content:content,source_manifest:active.source_manifest}).select().single().then(function(r){if(r.error)throw r.error;(versions[active.id]||(versions[active.id]=[])).unshift(r.data);render();}).catch(function(e){showResult(e.message,true);});
}
function authFetch(body){
  return sb().auth.getSession().then(function(r){var token=r.data&&r.data.session&&r.data.session.access_token;if(!token)throw Error('Sign in required');return fetch(FN,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token,'apikey':KEY},body:JSON.stringify(body)});});
}
function showResult(message,isError){var el=$('rb-share-result');if(el)el.innerHTML='<div class="rb-share '+(isError?'rb-error':'')+'">'+esc(message)+'</div>';}
function share(){
  var v=(versions[active.id]||[])[0];if(!v){alert('Save a version before sharing.');return;}
  authFetch({report_id:active.id,version_id:v.id,days:14}).then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j.error||'Share failed');return j;});}).then(function(j){$('rb-share-result').innerHTML='<div class="rb-share"><b>Read-only link (expires '+esc(date(j.expires_at))+')</b><br><a href="'+esc(j.url)+'" target="_blank" rel="noopener">'+esc(j.url)+'</a></div>';}).catch(function(e){showResult(e.message,true);});
}
function downloadPdf(){
  var v=(versions[active.id]||[])[0];if(!v){alert('Save an immutable version before downloading a PDF.');return;}
  showResult('Preparing governed PDF…',false);
  authFetch({action:'pdf',report_id:active.id,version_id:v.id}).then(function(r){if(!r.ok)return r.json().then(function(j){throw Error(j.error||'PDF generation failed');});return r.blob();}).then(function(blob){var url=URL.createObjectURL(blob),a=document.createElement('a'),name=(active.title||'watchdog-report').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();a.href=url;a.download=(name||'watchdog-report')+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);showResult('PDF generated from the latest immutable report version.',false);}).catch(function(e){showResult(e.message,true);});
}
function bind(){
  $('rb-new').onclick=function(){modal(true);};$('rb-close').onclick=function(){modal(false);};$('rb-form').onsubmit=create;$('rb-search').oninput=list;
  $('rb-reports').onclick=function(e){var b=e.target.closest('[data-report]');if(b)select(b.dataset.report);};
  $('rb-detail').onclick=function(e){var b=e.target.closest('[data-act]');if(!b)return;({save:saveDraft,version:saveVersion,share:share,pdf:downloadPdf,print:function(){window.print();}}[b.dataset.act]||function(){})();};
  $('rb-modal').onclick=function(e){if(e.target===$('rb-modal'))modal(false);};document.addEventListener('keydown',function(e){if(e.key==='Escape')modal(false);});
}
function init(){Promise.resolve(window.njptrAccessReady).then(function(){return sb().auth.getUser();}).then(function(r){user=r.data.user;if(!user)throw Error('Sign in required');return Promise.all([sb().from('saved_properties').select('*').order('updated_at',{ascending:false}),sb().from('professional_reports').select('*').order('updated_at',{ascending:false}),sb().from('profiles').select('id,email,full_name,display_name,phone,avatar_url,photo_url,pro_agent').eq('id',user.id).maybeSingle()]);}).then(function(r){properties=r[0].data||[];reports=r[1].data||[];profile=r[2].data||{};$('rb-property').innerHTML=properties.map(function(p){return'<option value="'+esc(p.pams_pin)+'">'+esc(p.nickname||p.address)+'</option>';}).join('');$('rb-app').hidden=false;bind();list();}).catch(console.warn);}
init();
})();