/* Canonical public ROBUST score-on-demand bridge.
   Public property surfaces can ask the existing governed workbench-score engine
   for an immediate ROBUST-v1 score. The server owns calculation + caching. */
(function(root){
  'use strict';
  if(root.WatchdogPublicScoreOnDemand)return;

  var installed=false;

  function runtime(){return root.NJPTRSupabaseRuntime||null;}
  function num(value){var n=Number(value);return Number.isFinite(n)?n:null;}
  function rowFor(raw){
    raw=raw||{};
    var pin=String(raw.pams_pin||raw.pin||'').trim();
    if(!pin)return null;
    var parts=pin.split('_');
    return {
      pams_pin:pin,
      town:String(raw.town||raw.city||'').trim(),
      county:String(raw.county||'').trim(),
      block:String(raw.block||parts[1]||'').trim(),
      lot:String(raw.lot||parts[2]||'').trim(),
      qualifier:String(raw.qualifier||raw.qual||parts.slice(3).join('_')||'').trim(),
      assessed_value:num(raw.assessed_value!=null?raw.assessed_value:(raw.assessed!=null?raw.assessed:raw.assessment)),
      last_year_tax:num(raw.last_year_tax!=null?raw.last_year_tax:raw.tax)
    };
  }
  function normalizeRows(rows){
    var seen={};
    return (rows||[]).map(rowFor).filter(function(row){
      if(!row||seen[row.pams_pin])return false;
      seen[row.pams_pin]=1;return true;
    }).slice(0,8);
  }
  function endpoint(){var cfg=runtime();return cfg&&cfg.url?cfg.url.replace(/\/+$/,'')+'/functions/v1/workbench-score':'';}
  function scoreRows(rows){
    rows=normalizeRows(rows);
    var cfg=runtime(),url=endpoint();
    if(!rows.length||!cfg||!url||!cfg.key)return Promise.resolve({});
    return fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':cfg.key,'x-client-info':'watchdog-public-score/1.0'},
      body:JSON.stringify({mode:'public_score',rows:rows})
    }).then(function(response){
      if(!response.ok)throw new Error('public score http '+response.status);
      return response.json();
    }).then(function(payload){
      var out={};
      (payload&&Array.isArray(payload.rows)?payload.rows:[]).forEach(function(row){
        var pin=String(row&&row.pams_pin||'');
        if(pin)out[pin]=row;
      });
      return out;
    });
  }

  function parseRpcRows(init){
    try{
      var body=init&&init.body;
      if(typeof body!=='string')return[];
      var parsed=JSON.parse(body);
      return Array.isArray(parsed&&parsed.p_rows)?parsed.p_rows:[];
    }catch(_error){return[];}
  }
  function isScoreRpc(url){return /\/rest\/v1\/rpc\/get_public_realtime_watchdog_scores(?:\?|$)/.test(String(url||''));}
  function responseWith(response,data){
    try{
      var headers=new Headers(response.headers||{});headers.set('content-type','application/json');
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:headers});
    }catch(_error){return response;}
  }
  function bridgeRpcResponse(response,requestRows){
    if(!response||!response.ok||!requestRows.length||requestRows.length>8)return Promise.resolve(response);
    return response.clone().json().then(function(data){
      if(!Array.isArray(data))return response;
      var byPin={};data.forEach(function(row){if(row&&row.pams_pin)byPin[row.pams_pin]=row;});
      var needs=requestRows.filter(function(row){
        var rec=byPin[row&&row.pams_pin];
        return !rec||rec.score_source!=='robust_public_cache'||rec.watchdog_score==null;
      });
      if(!needs.length)return response;
      return scoreRows(needs).then(function(scores){
        var changed=false;
        data=data.map(function(row){
          var fresh=row&&scores[row.pams_pin];
          if(!fresh||fresh.watchdog_score==null)return row;
          changed=true;
          return {pams_pin:row.pams_pin,watchdog_score:fresh.watchdog_score,score_source:fresh.source||'robust_on_demand'};
        });
        return changed?responseWith(response,data):response;
      }).catch(function(){return response;});
    }).catch(function(){return response;});
  }
  function installRpcBridge(){
    if(installed||typeof root.fetch!=='function')return;
    installed=true;
    var original=root.fetch.bind(root);
    root.fetch=function(input,init){
      var url=typeof input==='string'?input:(input&&input.url)||'';
      if(!isScoreRpc(url))return original(input,init);
      var rows=parseRpcRows(init);
      return original(input,init).then(function(response){return bridgeRpcResponse(response,rows);});
    };
  }

  root.WatchdogPublicScoreOnDemand=Object.freeze({scoreRows:scoreRows,rowFor:rowFor,install:installRpcBridge});
  installRpcBridge();
})(typeof window!=='undefined'?window:globalThis);
