/* NJW-96 correction v2: realtime score for every card + structural footer fix. */
(function(){
  'use strict';
  var SB_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client=null,busy=false,lastSignature='';

  function injectCorrectionCss(){
    if(document.getElementById('njw96-corrections-v2-css'))return;
    var l=document.createElement('link');l.id='njw96-corrections-v2-css';l.rel='stylesheet';l.href='/property/css/lookup/08-search-corrections-v2.css?v=20260812d';document.head.appendChild(l);
  }
  function sb(){
    if(client)return client;
    if(window.__njwSB){client=window.__njwSB;return client;}
    if(!window.supabase)return null;
    client=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
    window.__njwSB=client;
    return client;
  }
  function parseMoney(v){
    var raw=String(v||'').trim(),mult=/m\b/i.test(raw)?1000000:(/k\b/i.test(raw)?1000:1);
    var n=raw.replace(/[^0-9.]/g,'');return n?(+n*mult):null;
  }
  function pinOf(card){var b=card.querySelector('[data-save-pin]');return b?b.getAttribute('data-save-pin'):'';}
  function townName(){var h=document.getElementById('hd-results-title');return h?h.textContent.replace(/,\s*NJ\s+Property Tax Assessments.*$/i,'').trim():'';}
  function taxOf(card){
    var attr=card.getAttribute('data-tax')||card.getAttribute('data-last-year-tax');if(attr)return parseMoney(attr);
    var found=null;Array.prototype.some.call(card.querySelectorAll('.hd-meta span'),function(s){if(/tax/i.test(s.textContent)){found=parseMoney(s.textContent);return true;}return false;});return found;
  }
  function assessmentOf(card){return parseMoney(card.getAttribute('data-assessment')||card.getAttribute('data-assessed')||(card.querySelector('.hd-val')||{}).textContent);}

  (function installFooterGuard(){
    if(window.__njwFooterAppendGuard)return;window.__njwFooterAppendGuard=true;
    var nativeAppend=Node.prototype.appendChild,nativeInsert=Node.prototype.insertBefore;
    Node.prototype.appendChild=function(node){
      if(node&&node.id==='wd-property-footer'&&this.nodeType===1&&this.classList&&this.classList.contains('hd-right')){
        var hood=document.getElementById('pl-hood');
        if(hood&&hood.parentNode){nativeInsert.call(hood.parentNode,node,hood.nextSibling);return node;}
      }
      return nativeAppend.call(this,node);
    };
    Node.prototype.insertBefore=function(node,ref){
      if(ref&&ref.id==='wd-property-footer'&&this.nodeType===1&&this.classList&&this.classList.contains('hd-right')){
        return nativeAppend.call(this,node);
      }
      return nativeInsert.call(this,node,ref);
    };
  })();

  function forceFooterOutside(){
    if(!document.body.classList.contains('hood-on'))return;
    var hood=document.getElementById('pl-hood'),footer=document.getElementById('wd-property-footer');
    if(!hood||!footer)return;
    if(footer.closest('#pl-hood')||footer.parentNode!==hood.parentNode||footer.previousElementSibling!==hood){hood.insertAdjacentElement('afterend',footer);}
    footer.style.display='block';footer.style.width='100%';
  }

  function ensureArtEndsRight(){
    if(!document.body.classList.contains('hood-on'))return;
    var right=document.querySelector('#pl-hood .hd-right'),art=document.getElementById('njw-search-art');
    if(!right||!art)return;
    if(art.parentNode!==right)right.appendChild(art);
    if(art!==right.lastElementChild)right.appendChild(art);
  }

  function scoreAllCards(){
    if(busy||!document.body.classList.contains('hood-on')||!sb())return;
    var cards=Array.prototype.slice.call(document.querySelectorAll('#hd-list .hd-card'));
    if(!cards.length)return;
    var town=townName();
    var rows=cards.map(function(card){
      var body=card.querySelector('.hd-body');
      var line=body&&body.querySelector('.njw-card-score');
      if(!line&&body){line=document.createElement('div');line.className='njw-card-score';line.innerHTML='<i class="fas fa-shield-dog"></i> Watchdog Score <b>Loading…</b>';body.appendChild(line);}
      else if(line){var b=line.querySelector('b');if(b&&!card.dataset.njwRealtimeDone)b.textContent='Loading…';}
      return {pams_pin:pinOf(card),assessment:assessmentOf(card),tax:taxOf(card),town:town,county:card.getAttribute('data-county')||''};
    }).filter(function(r){return r.pams_pin;});
    var sig=rows.map(function(r){return r.pams_pin+':'+r.assessment+':'+r.tax;}).join('|');
    if(!rows.length||(sig===lastSignature&&cards.every(function(c){return c.dataset.njwRealtimeDone==='1';})))return;
    lastSignature=sig;busy=true;
    sb().rpc('get_public_realtime_watchdog_scores',{p_rows:rows}).then(function(r){
      var map=Object.create(null);if(!r.error)(r.data||[]).forEach(function(x){map[x.pams_pin]=x;});
      cards.forEach(function(card){var rec=map[pinOf(card)],b=card.querySelector('.njw-card-score b');if(!b)return;
        if(rec){b.textContent=String(Math.round(+rec.watchdog_score));b.title=rec.score_source==='observed'?'Latest observed Watchdog score':'Calculated live from current property tax data';card.dataset.watchdogScore=String(rec.watchdog_score);}
        else{b.textContent='—';}
        card.dataset.njwRealtimeDone='1';
      });
      var sel=document.getElementById('njw-sort-select');if(sel&&/score/i.test(sel.value))sel.dispatchEvent(new Event('change'));
    }).catch(function(){cards.forEach(function(card){var b=card.querySelector('.njw-card-score b');if(b)b.textContent='—';});}).finally(function(){busy=false;});
  }

  function scan(){injectCorrectionCss();forceFooterOutside();ensureArtEndsRight();}
  // scoreAllCards() removed: search-corrections-v3.js now owns the visible
  // Watchdog Score line. Running this too caused a flicker/overwrite race
  // between competing score-fetch calls.
  var obs=new MutationObserver(function(){clearTimeout(window.__njwV2Scan);window.__njwV2Scan=setTimeout(scan,80);});
  obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('load',scan);scan();
})();
