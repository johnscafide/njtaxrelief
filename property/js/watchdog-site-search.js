/* Watchdog site search. One "find anything" search for the whole site:
   Ctrl+K / Cmd+K (or "/") opens a search palette that finds
   - plain-English terms and where they live in Watchdog (typing "certif"
     suggests "CO - Certificate of Occupancy > CO Requirements by Town"),
   - Watchdog pages and tools (the signed-in menu's own destinations, so plan
     gating matches the menu),
   - New Jersey addresses (the same instant parcel search as Property Lookup),
   - public guides and insights (the Pagefind index built at deploy).
   The Property Lookup box on the home page stays address-only on purpose; this
   is the separate site-wide search. Terms live in /property/data/site-search.json
   plus the glossary (/property/data/glossary.json).
   Loaded by the page server on every clean Watchdog page and self-loaded by the
   shared shells, so it must stay idempotent. The matching engine is pure and
   is also loaded by property/tests/site-search-contract.mjs. */
(function(root){
  'use strict';

  /* ---------- Engine: pure matching, no DOM ---------- */
  var Engine = (function(){
    var STOP = {a:1,an:1,the:1,of:1,to:1,'for':1,'in':1,on:1,my:1,and:1,how:1,what:1,where:1,is:1,'do':1,does:1,i:1,nj:1,'new':1,jersey:1,find:1,get:1,can:1,me:1};

    function normalize(v){
      return String(v == null ? '' : v).toLowerCase()
        .replace(/[‘’'.]/g,'')
        .replace(/&/g,' and ')
        .replace(/[^a-z0-9]+/g,' ')
        .replace(/\s+/g,' ')
        .trim();
    }
    function words(v){ return v ? v.split(' ') : []; }
    function uniq(list){
      var seen = {}, out = [];
      for(var i = 0; i < list.length; i++){ if(list[i] && !seen[list[i]]){ seen[list[i]] = 1; out.push(list[i]); } }
      return out;
    }

    /* Optimal string alignment distance, stopping early once it passes max. */
    function editDistance(a,b,max){
      var al = a.length, bl = b.length, i, j;
      if(Math.abs(al - bl) > max) return max + 1;
      var prev2 = null, prev = [], cur;
      for(j = 0; j <= bl; j++) prev[j] = j;
      for(i = 1; i <= al; i++){
        cur = [i];
        var rowMin = i;
        for(j = 1; j <= bl; j++){
          var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
          var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
          if(i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
          cur[j] = v;
          if(v < rowMin) rowMin = v;
        }
        if(rowMin > max) return max + 1;
        prev2 = prev; prev = cur;
      }
      return prev[bl];
    }

    /* A typed token matches a word when it is a prefix of it, or (4+ letters)
       within one typo of the word or of the word's start (two typos at 8+). */
    function tokenMatches(t,w,fuzzy){
      if(w.indexOf(t) === 0) return 2;
      if(!fuzzy || t.length < 4) return 0;
      var max = t.length >= 8 ? 2 : 1;
      if(editDistance(t,w,max) <= max) return 1;
      for(var d = -1; d <= 1; d++){
        var len = t.length + d;
        if(len >= 3 && len < w.length && editDistance(t,w.slice(0,len),max) <= max) return 1;
      }
      return 0;
    }
    /* Every token matches a different word. Returns 2 (all exact prefixes),
       1 (some typo-tolerant) or 0. */
    function allTokens(tokens,wordList,fuzzy){
      if(!tokens.length || !wordList.length) return 0;
      var used = {}, grade = 2;
      for(var i = 0; i < tokens.length; i++){
        var best = 0, at = -1;
        for(var j = 0; j < wordList.length; j++){
          if(used[j]) continue;
          var m = tokenMatches(tokens[i],wordList[j],fuzzy);
          if(m > best){ best = m; at = j; if(m === 2) break; }
        }
        if(!best) return 0;
        used[at] = 1;
        if(best < grade) grade = best;
      }
      return grade;
    }

    function prepare(entries){
      return (entries || []).map(function(e,i){
        var names = uniq([e.label].concat(e.aliases || []).map(normalize));
        var kws = uniq((e.keywords || []).map(normalize));
        var allWords = [];
        names.concat(kws).forEach(function(n){ allWords = allWords.concat(words(n)); });
        return {
          entry:e, order:i, names:names, kws:kws,
          nameWords:names.map(words),
          compact:names.map(function(n){ return n.replace(/ /g,''); }),
          allWords:uniq(allWords)
        };
      });
    }

    function scoreQuery(p,q,tokens){
      var best = 0, i, n, len = q.length, qc = q.replace(/ /g,'');
      for(i = 0; i < p.names.length; i++){
        n = p.names[i];
        var s = 0;
        if(n === q) s = i === 0 ? 101 : 100;
        else if(n.indexOf(q) === 0) s = 90 - Math.min(10,(n.length - len) / 4);
        else if(len >= 3 && p.compact[i].indexOf(qc) === 0) s = 84;
        else if(len >= 2 && allTokens(tokens,p.nameWords[i],false)) s = tokens.length > 1 ? 78 : 72;
        else if(len >= 4 && n.indexOf(q) > 0) s = 60;
        if(s > best) best = s;
      }
      if(best >= 72 || len < 2) return best;
      for(i = 0; i < p.kws.length; i++){
        if(len >= 3 && (p.kws[i].indexOf(q) === 0 || allTokens(tokens,words(p.kws[i]),false))){ best = Math.max(best,48); break; }
      }
      if(len >= 3 && best < 65 && allTokens(tokens,p.allWords,false)) best = Math.max(best,65);
      if(len >= 4 && best < 45){
        for(i = 0; i < p.nameWords.length && best < 45; i++) if(allTokens(tokens,p.nameWords[i],true)) best = 45;
        if(best < 40 && allTokens(tokens,p.allWords,true)) best = 40;
      }
      return best;
    }

    function score(p,q){
      var tokens = words(q);
      var best = scoreQuery(p,q,tokens);
      /* "where is the co" still finds "co". */
      var kept = tokens.filter(function(t){ return !STOP[t]; });
      if(kept.length && kept.length < tokens.length){
        var s = scoreQuery(p,kept.join(' '),kept) - 2;
        if(s > best) best = s;
      }
      return best;
    }

    function rank(prepared,raw,opts){
      opts = opts || {};
      var q = normalize(raw);
      if(!q) return [];
      var min = opts.min == null ? 40 : opts.min;
      var tokens = words(q), out = [];
      for(var i = 0; i < prepared.length; i++){
        var s = score(prepared[i],q);
        if(q.length === 1 && s < 90) continue;
        if(s < min) continue;
        /* Ties go to results whose visible title shows what was typed. */
        var label = prepared[i].nameWords[0] || [];
        if(s < 100 && tokens.some(function(t){ return label.some(function(w){ return w.indexOf(t) === 0; }); })) s += 1.5;
        out.push({entry:prepared[i].entry, score:s, order:prepared[i].order});
      }
      out.sort(function(a,b){
        return (b.score - a.score) ||
          (String(a.entry.label).length - String(b.entry.label).length) ||
          (a.order - b.order);
      });
      return opts.limit ? out.slice(0,opts.limit) : out;
    }

    /* "co 12 main st" -> text "co", address "12 main st". An address starts at
       the first token that begins with a digit and has a street word after it. */
    function splitQuery(raw){
      var tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);
      for(var i = 0; i < tokens.length - 1; i++){
        if(/^\d+[a-z]?(?:-\d+[a-z]?)?,?$/i.test(tokens[i]) && /[a-z]{2}/i.test(tokens[i + 1])){
          return {text:tokens.slice(0,i).join(' '), address:tokens.slice(i).join(' ')};
        }
      }
      return {text:tokens.join(' '), address:''};
    }

    return {normalize:normalize, prepare:prepare, rank:rank, score:score, splitQuery:splitQuery, editDistance:editDistance};
  })();

  if(typeof module === 'object' && module && module.exports){ module.exports = Engine; return; }
  if(!root || !root.document || root.__wdSiteSearch) return;
  root.__wdSiteSearch = true;

  /* ---------- Runtime ---------- */
  var VERSION = '20261004a';
  var doc = root.document;
  var CSS_URL = '/property/css/watchdog-site-search.css';
  var DATA_URL = '/property/data/site-search.json?v=' + VERSION;
  var GLOSSARY_URL = '/property/data/glossary.json?v=' + VERSION;
  var PAGEFIND_URL = '/pagefind/pagefind.js';
  var SB_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var SB_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var RECENT_KEY = 'wd_site_search_recent_v1';
  var PARCEL_TIMEOUT = 3500;
  /* Client-facing shared pages (a buyer's client room, a collaborator upload
     link, an agent's public portal, a shared report, the open-house sign-in)
     are not Watchdog's own navigation surface. */
  var OFF_PATH = /^\/(?:property\/)?(?:transaction\/shared|client-room|public-report|open-house|offline)(?:\/|$)/i;
  var AGENT_PORTAL = /^\/(?:property\/)?agent\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/?$/i;
  var AGENT_RESERVED = /^(?:agent|agents|analytics|assets|buyers|client-room|clients|contacts|desk|edit|extension|farm-map|index|leads|listing-prep|new|onboarding|open-house|portal|reports|settings|shared|sphere|team|teams|today|training|workspace)$/i;
  /* Top-level folders that live at the repository root rather than under
     /property/, so preview and local hosts must not prefix them. */
  var ROOT_PHYSICAL = /^\/(?:transaction|co|towns|search|contact|move|lender|attorney|investor|client-room|open-house|nj|statistics|checkup|true-cost|alerts|agent\/(?:listing-prep|buyers|open-house))(?:[\/?#]|$)/i;
  var POPULAR = ['certificate of occupancy','property tax appeal','anchor','senior freeze','added assessment','town compare'];

  var host = String(root.location.hostname || '').toLowerCase();
  var cleanHost = host === 'watchdogindex.com' || host === 'www.watchdogindex.com';
  var isMac = /Mac|iPhone|iPad|iPod/i.test((root.navigator && (root.navigator.platform || root.navigator.userAgent)) || '');

  function offPage(){
    if(doc.body && doc.body.getAttribute('data-wd-search') === 'off') return true;
    var p = root.location.pathname || '/';
    if(OFF_PATH.test(p)) return true;
    var m = p.match(AGENT_PORTAL);
    return !!(m && !AGENT_RESERVED.test(m[1]));
  }
  if(offPage()) return;

  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  /* Public paths are clean and root-level. Preview and local hosts have no
     clean-route layer, so pages that live under /property/ get the prefix. */
  function cleanPath(href){
    var h = String(href || '/');
    if(h.indexOf('/property/') === 0) h = h.slice('/property'.length);
    else if(h === '/property') h = '/';
    return h.charAt(0) === '/' ? h : '/' + h;
  }
  function route(href){
    var h = String(href || '/');
    if(/^https?:\/\//i.test(h)) return h;
    h = cleanPath(h);
    if(cleanHost || ROOT_PHYSICAL.test(h)) return h;
    return h === '/' ? '/property/' : '/property' + h;
  }
  /* Results only ever link inside Watchdog. */
  function safeHref(href){
    var h = String(href || '');
    return /^\/(?!\/)/.test(h) || /^https:\/\/(?:www\.)?watchdogindex\.com\//i.test(h) ? h : '#';
  }
  function pathKey(href){
    var h = cleanPath(String(href || '').replace(/^https?:\/\/[^/]+/i,''));
    return h.split('#')[0].replace(/\/+(?=\?|$)/,'').toLowerCase() || '/';
  }
  function shortText(v,max){
    v = String(v || '').replace(/\s+/g,' ').trim();
    if(v.length <= max) return v;
    var cut = v.slice(0,max - 1);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0,sp) : cut).replace(/[\s,;:.-]+$/,'') + '...';
  }
  function icon(name){
    var n = String(name || '');
    return /^fa-[a-z0-9-]+$/.test(n) ? n : 'fa-circle-dot';
  }
  /* Inline icons (no icon font needed for the search and close glyphs). */
  function svgIcon(d){
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
      '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="' + d + '"/></svg>';
  }
  var SVG_SEARCH = svgIcon('M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.4-2.1L21 21');
  var SVG_CLOSE = svgIcon('M6 6l12 12M18 6 6 18');

  /* ---------- Plan gating (same ranks as the universal menu) ---------- */
  var RANK = {standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
  function planName(v){
    v = String(v || '').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');
    if(v === 'free') v = 'standard';
    return RANK.hasOwnProperty(v) ? v : 'standard';
  }
  function viewerPlan(){
    var m = root.WatchdogUniversalMenu, s = m && typeof m.state === 'function' ? m.state() : null;
    if(!s || !s.user || !s.ready) return null;
    var p = s.profile || {}, e = s.entitlement || {};
    if(planName(p.account_role) === 'developer' || planName(e.account_role) === 'developer') return 'developer';
    return planName(e.plan_tier || p.plan_tier || p.plan);
  }
  function needLabel(need){
    if(!need || !RANK.hasOwnProperty(need)) return '';
    var have = viewerPlan();
    if(have && RANK[have] >= RANK[need]) return '';
    return {agent:'Agent',pro:'Pro',pro_plus:'Pro+',teams:'Teams',developer:'Developer'}[need] || '';
  }

  /* ---------- Data ---------- */
  var entries = [], prepared = [], dataPromise = null;
  function getJson(url){
    return root.fetch(url,{credentials:'same-origin'}).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function menuEntries(){
    var m = root.WatchdogUniversalMenu, out = [];
    if(!m || typeof m.items !== 'function') return out;
    try{
      m.items().forEach(function(item){
        if(!item || !item.href || !item.label) return;
        out.push({id:'menu-' + item.key, kind:'page', label:item.label, aliases:[], keywords:[], summary:'', href:item.href, routed:true, where:'Menu', icon:item.icon});
      });
    }catch(_){}
    return out;
  }
  function rebuild(){
    var byPath = {}, list = [];
    /* Menu destinations first: they are already entitlement-filtered and
       routed for this host. Dictionary entries for the same page add the
       aliases, summary and "where" text. */
    /* First menu row wins: the five Agent Desk areas share /agent-desk once
       the #section is dropped, and the dictionary's Agent Desk entry belongs
       to the first (the desk itself). */
    menuEntries().forEach(function(e){ var k = pathKey(e.href); if(!byPath[k]) byPath[k] = e; list.push(e); });
    entries.forEach(function(e){
      var k = pathKey(e.href), hit = byPath[k];
      if(hit && hit.routed && e.kind === 'page'){
        hit.aliases = (e.aliases || []).concat([e.label]);
        hit.keywords = e.keywords || [];
        hit.summary = e.summary || hit.summary;
        hit.icon = e.icon || hit.icon;
        hit.where = e.where || hit.where;
        return;
      }
      list.push(e);
    });
    prepared = Engine.prepare(list);
  }
  function ensureData(){
    if(dataPromise) return dataPromise;
    dataPromise = Promise.all([
      getJson(DATA_URL),
      getJson(GLOSSARY_URL).catch(function(){ return null; })
    ]).then(function(r){
      var list = (r[0] && Array.isArray(r[0].entries) ? r[0].entries : []).filter(function(e){ return e && e.label && e.href; });
      var seen = {};
      list.forEach(function(e){ seen[pathKey(e.href)] = 1; });
      ((r[1] && r[1].terms) || []).forEach(function(g){
        if(!g || !g.slug || !g.term) return;
        var href = '/glossary/' + encodeURIComponent(g.slug) + '/';
        if(seen[pathKey(href)]) return;
        list.push({id:'glossary-' + g.slug, kind:'term', label:g.term, aliases:(Array.isArray(g.aliases) ? g.aliases : []), keywords:[], summary:shortText(g.definition,140), href:href, where:'Glossary', icon:'fa-book'});
      });
      entries = list;
      rebuild();
    }).catch(function(){
      dataPromise = null;
      rebuild();
    });
    return dataPromise;
  }

  /* ---------- Addresses: Watchdog's instant statewide parcel search ---------- */
  var parcel = {fails:0, until:0, cache:{}, ctrl:null};
  function searchParcels(address){
    var key = address.toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
    if(parcel.cache[key]) return parcel.cache[key];
    if(Date.now() < parcel.until) return Promise.resolve({busy:true, rows:[]});
    if(parcel.ctrl) parcel.ctrl.abort();
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    parcel.ctrl = ctrl;
    var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); },PARCEL_TIMEOUT);
    var p = root.fetch(SB_URL + '/rest/v1/rpc/search_parcels',{
      method:'POST',
      credentials:'omit',
      headers:{apikey:SB_KEY, Authorization:'Bearer ' + SB_KEY, 'Content-Type':'application/json', Accept:'application/json'},
      body:JSON.stringify({p_query:address, p_limit:5}),
      signal:ctrl ? ctrl.signal : undefined
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(rows){
      clearTimeout(timer);
      if(parcel.ctrl === ctrl) parcel.ctrl = null;
      parcel.fails = 0;
      return {rows:Array.isArray(rows) ? rows : []};
    }).catch(function(){
      clearTimeout(timer);
      delete parcel.cache[key];
      /* Aborted because a newer search replaced it: not a failure. */
      if(ctrl && parcel.ctrl !== ctrl) return {stale:true, rows:[]};
      parcel.ctrl = null;
      /* Two misses in a row: stop asking for a minute so a slow database is
         not hit on every keystroke. Property Lookup stays one tap away. */
      if(++parcel.fails >= 2){ parcel.fails = 0; parcel.until = Date.now() + 60000; }
      return {busy:true, rows:[]};
    });
    parcel.cache[key] = p;
    return p;
  }
  function titleCase(v){
    return String(v || '').toLowerCase().replace(/\b[a-z]/g,function(c){ return c.toUpperCase(); });
  }

  /* ---------- Guides and insights: the Pagefind index ---------- */
  var pf = {promise:null, off:false};
  function pagefind(){
    if(pf.off) return Promise.resolve(null);
    if(pf.promise) return pf.promise;
    pf.promise = import(PAGEFIND_URL).then(function(m){
      return Promise.resolve(m.options ? m.options({excerptLength:16}) : null)
        .then(function(){ return m.init ? m.init() : null; })
        .then(function(){ return m; });
    }).catch(function(){ pf.off = true; return null; });
    return pf.promise;
  }
  function searchContent(q){
    return pagefind().then(function(m){
      if(!m) return [];
      return m.search(q).then(function(s){
        var list = (s && s.results ? s.results : []).slice(0,4);
        return Promise.all(list.map(function(r){ return r.data(); }));
      });
    }).catch(function(){ return []; });
  }
  /* Pagefind excerpts carry <mark> around hits; keep only that tag. */
  function safeExcerpt(v){
    return esc(String(v || '').replace(/<(?!\/?mark>)[^>]*>/g,'')).replace(/&lt;(\/?)mark&gt;/g,'<$1mark>');
  }

  /* ---------- Recent picks (this browser only) ---------- */
  function readRecent(){
    try{ var v = JSON.parse(root.localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0,5) : []; }catch(_){ return []; }
  }
  function saveRecent(item){
    if(!item || !item.href || item.type === 'action') return;
    try{
      var list = readRecent().filter(function(r){ return r && r.href !== item.href; });
      list.unshift({label:item.label, href:item.href, icon:item.icon, where:item.where || ''});
      root.localStorage.setItem(RECENT_KEY,JSON.stringify(list.slice(0,5)));
    }catch(_){}
  }

  /* ---------- UI ---------- */
  var ui = null, isOpen = false, lastFocus = null, items = [], active = 0, seq = 0, renderedFor = null, userMoved = false;
  var state = {q:'', props:null, propsState:'idle', address:'', content:null};
  var timers = {parcel:0, content:0, live:0};

  /* Presentation lives in /property/css/watchdog-site-search.css. The page
     server links it next to this script; pages that self-load the runtime get
     it here. Header buttons mount once it has loaded, so they never flash
     unstyled. */
  var cssReady = false, cssWaiters = [];
  function css(){
    var link = doc.querySelector('link[href^="' + CSS_URL + '"]');
    function ready(){
      if(cssReady) return;
      cssReady = true;
      var list = cssWaiters; cssWaiters = [];
      list.forEach(function(fn){ fn(); });
    }
    if(!link){
      link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL + '?v=' + VERSION;
      (doc.head || doc.documentElement).appendChild(link);
    }
    if(link.sheet) ready();
    else{
      link.addEventListener('load',ready,{once:true});
      link.addEventListener('error',ready,{once:true});
      setTimeout(ready,3000);
    }
  }
  function whenCss(fn){ if(cssReady) fn(); else cssWaiters.push(fn); }

  function build(){
    if(ui) return ui;
    css();
    var wrap = doc.createElement('div');
    wrap.className = 'wdss';
    wrap.id = 'wdss-root';
    wrap.hidden = true;
    wrap.setAttribute('data-wd-search-root','');
    wrap.innerHTML =
      '<div class="wdss-backdrop" data-wdss-close></div>' +
      '<div class="wdss-dialog" role="dialog" aria-modal="true" aria-label="Search Watchdog">' +
        '<div class="wdss-bar">' + SVG_SEARCH +
          '<input class="wdss-input" id="wdss-input" type="search" role="combobox" aria-expanded="false" aria-controls="wdss-list" aria-autocomplete="list" aria-label="Search Watchdog" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="Search pages, terms and addresses">' +
          '<button class="wdss-close" type="button" data-wdss-close aria-label="Close search"><span>Esc</span>' + SVG_CLOSE + '</button>' +
        '</div>' +
        '<div class="wdss-body"><div id="wdss-list" role="listbox" aria-label="Search results"></div></div>' +
        '<div class="wdss-foot" aria-hidden="true"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span><span>' + (isMac ? '<kbd>&#8984;</kbd><kbd>K</kbd>' : '<kbd>Ctrl</kbd><kbd>K</kbd>') + ' anywhere</span></div>' +
        '<div class="wdss-sr" aria-live="polite" id="wdss-live"></div>' +
      '</div>';
    (doc.body || doc.documentElement).appendChild(wrap);
    ui = {
      root:wrap,
      dialog:wrap.querySelector('.wdss-dialog'),
      input:wrap.querySelector('#wdss-input'),
      list:wrap.querySelector('#wdss-list'),
      body:wrap.querySelector('.wdss-body'),
      close:wrap.querySelector('.wdss-close'),
      live:wrap.querySelector('#wdss-live')
    };
    ui.input.addEventListener('input',update);
    ui.input.addEventListener('keydown',onInputKey);
    wrap.addEventListener('keydown',trapTab);
    wrap.addEventListener('click',function(e){
      if(e.target.closest('[data-wdss-close]')){ e.preventDefault(); close(); return; }
      var row = e.target.closest('[data-wdss-i]');
      if(!row) return;
      var item = items[Number(row.getAttribute('data-wdss-i'))];
      if(!item) return;
      saveRecent(item);
      /* A link to this same page (a hash or query change) should still close. */
      if(!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) setTimeout(close,0);
    });
    ui.list.addEventListener('mousemove',function(e){
      var row = e.target.closest('[data-wdss-i]');
      if(row && Number(row.getAttribute('data-wdss-i')) !== active){ userMoved = true; setActive(Number(row.getAttribute('data-wdss-i')),false); }
    });
    return ui;
  }

  function highlight(label,query){
    var q = String(query || '').trim();
    var text = String(label || '');
    if(q.length < 1) return esc(text);
    var at = text.toLowerCase().indexOf(q.toLowerCase());
    if(at < 0) return esc(text);
    return esc(text.slice(0,at)) + '<mark>' + esc(text.slice(at,at + q.length)) + '</mark>' + esc(text.slice(at + q.length));
  }

  function rowHtml(item,i){
    var need = item.need ? needLabel(item.need) : '';
    var where = item.where ? String(item.where).replace(/\s+>\s+/g,' › ') : '';
    return '<a class="wdss-row" role="option" tabindex="-1" id="wdss-o-' + i + '" data-wdss-i="' + i + '" aria-selected="false" href="' + esc(safeHref(item.href)) + '">' +
      '<span class="wdss-ico" aria-hidden="true"><i class="fas ' + icon(item.icon) + '"></i></span>' +
      '<span class="wdss-txt"><b>' + (item.type === 'content' ? esc(item.label) : highlight(item.label,item.hl)) + '</b>' +
        (where ? '<span class="wdss-where">' + esc(where) + '</span>' : '') +
        (item.html ? '<span class="wdss-sum">' + item.html + '</span>' : item.summary ? '<span class="wdss-sum">' + esc(item.summary) + '</span>' : '') +
      '</span>' +
      '<span class="wdss-end">' + (need ? '<em class="wdss-need" title="Included with ' + esc(need) + '">' + esc(need) + '</em>' : '') + '<span class="wdss-key" aria-hidden="true">&#8629;</span></span>' +
    '</a>';
  }

  function toItem(entry,hl,type){
    return {
      type:type || entry.kind || 'term',
      label:entry.label,
      href:entry.routed ? entry.href : route(entry.href),
      where:entry.where || '',
      summary:entry.summary || '',
      icon:entry.icon,
      need:entry.need || '',
      hl:hl
    };
  }

  function render(){
    if(!ui) return;
    var raw = state.q, groups = [], next = [];
    function group(title,list){ if(list.length) groups.push({title:title, list:list}); }
    if(!raw){
      group('Recent',readRecent().map(function(r){ return {type:'recent', label:r.label, href:r.href, where:r.where, icon:r.icon}; }));
      var seen = {}, popular = [];
      readRecent().forEach(function(r){ seen[r.href] = 1; });
      POPULAR.forEach(function(q){
        var hit = Engine.rank(prepared,q,{limit:1,min:70})[0];
        if(!hit) return;
        var it = toItem(hit.entry,'');
        if(seen[it.href]) return;
        seen[it.href] = 1;
        popular.push(it);
      });
      group('Try searching for',popular);
    }else{
      var split = Engine.splitQuery(raw);
      var ranked = Engine.rank(prepared,raw);
      if(split.address && split.text){
        var extra = Engine.rank(prepared,split.text);
        var have = {};
        ranked.forEach(function(r){ have[r.entry.id || r.entry.href] = 1; });
        extra.forEach(function(r){ if(!have[r.entry.id || r.entry.href]) ranked.push(r); });
      }
      var hl = split.address ? split.text : raw;
      /* With an address in the query, the property comes first and fewer
         term suggestions follow it. */
      var maxTerms = split.address ? 3 : 6, maxPages = split.address ? 2 : 5;
      var terms = [], pages = [];
      ranked.forEach(function(r){
        if(r.entry.kind === 'page'){ if(pages.length < maxPages) pages.push(toItem(r.entry,hl,'page')); }
        else if(terms.length < maxTerms) terms.push(toItem(r.entry,hl,'term'));
      });
      if(!split.address){
        group('Suggestions',terms);
        group('Go to',pages);
      }
      if(split.address){
        var props = [];
        if(state.address === split.address && state.propsState === 'done'){
          (state.props || []).forEach(function(p){
            if(!p || !p.pams_pin) return;
            var place = [titleCase(p.town), p.county ? titleCase(p.county) + ' County' : '', p.zip].filter(Boolean).join(', ');
            props.push({type:'property', label:titleCase(p.address), href:route('/home') + '?pin=' + encodeURIComponent(p.pams_pin), where:place, summary:'', icon:'fa-location-dot'});
          });
        }
        var lookup = route('/') + '?address=' + encodeURIComponent(split.address);
        if(state.address === split.address && state.propsState === 'busy'){
          props.push({type:'action', label:'Look up ' + split.address, href:lookup, where:'Property Lookup', summary:'Address search is busy right now. Property Lookup will find it.', icon:'fa-magnifying-glass-location'});
        }else if(state.address === split.address && state.propsState === 'done' && !props.length){
          props.push({type:'action', label:'Look up ' + split.address, href:lookup, where:'Property Lookup', summary:'No quick match. Property Lookup searches every New Jersey address.', icon:'fa-magnifying-glass-location'});
        }
        group('Properties',props);
        group('Suggestions',terms);
        group('Go to',pages);
      }
      var content = [];
      (state.contentFor === raw ? state.content || [] : []).forEach(function(d){
        if(!d || !d.url) return;
        var title = String(d.meta && d.meta.title || '').replace(/\s*[|–--]\s*Watchdog.*$/i,'') || 'Watchdog guide';
        content.push({type:'content', label:title, href:route(d.url), where:'Guides and findings', html:safeExcerpt(d.excerpt), icon:'fa-book-open'});
      });
      group('Guides and findings',content);
      if(raw.length >= 2){
        group('More',[{type:'action', label:'Search all guides for "' + shortText(raw,40) + '"', href:route('/search') + '?q=' + encodeURIComponent(raw), where:'', summary:'', icon:'fa-magnifying-glass'}]);
      }
    }

    var html = '', n = 0;
    groups.forEach(function(g,gi){
      html += '<div role="group" aria-labelledby="wdss-g-' + gi + '"><div class="wdss-group" id="wdss-g-' + gi + '" role="presentation">' + esc(g.title) + '</div>';
      g.list.forEach(function(item){ next.push(item); html += rowHtml(item,n++); });
      html += '</div>';
    });
    var hasMatches = next.some(function(i){ return i.type !== 'action'; });
    if(raw && !hasMatches){
      html = '<div class="wdss-note">No matches for <b>' + esc(shortText(raw,60)) + '</b> yet. Try a shorter word, a town, or a street address.</div>' + html;
    }
    if(!raw && !next.length){
      html = '<div class="wdss-note">Type a page, a term like <b>certificate of occupancy</b>, or an address.</div>';
    }

    /* A new query starts at the best match. Late groups (addresses, guides)
       for the same query keep a row the user deliberately moved to. */
    if(raw !== renderedFor) userMoved = false;
    var prevHref = userMoved && items[active] ? items[active].href : '';
    renderedFor = raw;
    items = next;
    ui.list.innerHTML = html;
    var keep = -1;
    if(prevHref) for(var i = 0; i < items.length; i++) if(items[i].href === prevHref){ keep = i; break; }
    setActive(keep >= 0 ? keep : 0,false);
    ui.input.setAttribute('aria-expanded',items.length ? 'true' : 'false');
    clearTimeout(timers.live);
    timers.live = setTimeout(function(){
      if(!ui || !isOpen) return;
      ui.live.textContent = raw ? (hasMatches ? items.length + ' results' : 'No matches') : '';
    },450);
  }

  function setActive(i,scroll){
    if(!ui) return;
    if(!items.length){ active = 0; ui.input.removeAttribute('aria-activedescendant'); return; }
    active = Math.max(0,Math.min(items.length - 1,i));
    var rows = ui.list.querySelectorAll('[data-wdss-i]');
    for(var k = 0; k < rows.length; k++){
      var on = k === active;
      rows[k].classList.toggle('active',on);
      rows[k].setAttribute('aria-selected',on ? 'true' : 'false');
    }
    ui.input.setAttribute('aria-activedescendant','wdss-o-' + active);
    if(scroll && rows[active] && rows[active].scrollIntoView) rows[active].scrollIntoView({block:'nearest'});
  }

  function go(item,newTab){
    if(!item) return;
    var href = safeHref(item.href);
    if(href === '#') return;
    saveRecent(item);
    if(newTab){ root.open(href,'_blank','noopener'); return; }
    close(true);
    root.location.assign(href);
  }

  function onInputKey(e){
    if(e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')){ e.preventDefault(); userMoved = true; setActive(active + 1 >= items.length ? 0 : active + 1,true); return; }
    if(e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')){ e.preventDefault(); userMoved = true; setActive(active - 1 < 0 ? items.length - 1 : active - 1,true); return; }
    if(e.key === 'Enter' && !e.isComposing){
      e.preventDefault();
      if(items[active]) go(items[active],e.metaKey || e.ctrlKey);
      return;
    }
    if(e.key === 'Escape'){
      e.preventDefault();
      if(ui.input.value){ ui.input.value = ''; update(); }
      else close();
    }
  }

  function trapTab(e){
    if(!ui) return;
    /* The input handles its own Escape (clear first, then close). */
    if(e.key === 'Escape' && e.target !== ui.input){ e.preventDefault(); close(); return; }
    if(e.key !== 'Tab') return;
    var stops = [ui.input,ui.close];
    var at = stops.indexOf(doc.activeElement);
    e.preventDefault();
    stops[(at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
  }

  function update(){
    if(!ui) return;
    var raw = ui.input.value.trim();
    var my = ++seq;
    state.q = raw;
    clearTimeout(timers.parcel);
    clearTimeout(timers.content);
    var split = Engine.splitQuery(raw);
    var addr = split.address;
    if(addr && addr.replace(/\s+/g,'').length >= 5){
      if(state.address !== addr){ state.address = addr; state.propsState = 'loading'; state.props = null; }
      timers.parcel = setTimeout(function(){
        searchParcels(addr).then(function(res){
          if(my !== seq || !isOpen || res.stale) return;
          state.address = addr;
          state.props = res.rows;
          state.propsState = res.busy ? 'busy' : 'done';
          render();
        });
      },220);
    }else if(!addr){
      state.address = '';
    }
    if(raw.length >= 3){
      timers.content = setTimeout(function(){
        searchContent(raw).then(function(rows){
          if(my !== seq || !isOpen) return;
          state.content = rows;
          state.contentFor = raw;
          render();
        });
      },160);
    }
    render();
  }

  var scrollLocked = false;
  function lock(on){
    if(on === scrollLocked) return;
    scrollLocked = on;
    doc.documentElement.classList.toggle('wdss-lock',on);
  }

  function open(prefill){
    if(offPage()) return;
    build();
    if(isOpen){ ui.input.focus(); return; }
    var m = root.WatchdogUniversalMenu;
    if(m && typeof m.close === 'function'){ try{ m.close(); }catch(_){} }
    lastFocus = doc.activeElement;
    isOpen = true;
    ui.root.hidden = false;
    lock(true);
    if(typeof prefill === 'string') ui.input.value = prefill;
    ui.input.focus({preventScroll:true});
    ui.input.select();
    rebuild();
    update();
    ensureData().then(function(){ if(isOpen) update(); });
    pagefind();
  }

  function close(leaving){
    if(!isOpen || !ui) return;
    isOpen = false;
    seq++;
    clearTimeout(timers.parcel);
    clearTimeout(timers.content);
    ui.root.hidden = true;
    ui.live.textContent = '';
    lock(false);
    if(!leaving && lastFocus && lastFocus.focus && doc.contains(lastFocus)){
      try{ lastFocus.focus({preventScroll:true}); }catch(_){}
    }
    lastFocus = null;
  }

  function toggle(){ if(isOpen) close(); else open(); }

  function editable(el){
    if(!el || el === doc.body) return false;
    if(el.isContentEditable) return true;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  /* ---------- Header buttons ---------- */
  var MOUNTS = [
    {before:'#wdx-notify', variant:'app'},
    {before:'#hm27-notify', variant:'app'},
    {before:'#wd-profile-trigger', variant:'public'}
  ];
  function triggerHtml(){
    return SVG_SEARCH + '<span class="wdss-trigger-label">Search</span><kbd class="wdss-trigger-kbd">' + (isMac ? '&#8984;K' : 'Ctrl K') + '</kbd>';
  }
  function mount(){
    if(!doc.body) return;
    css();
    if(!cssReady){ whenCss(mount); return; }
    MOUNTS.forEach(function(m){
      var anchor = doc.querySelector(m.before);
      if(!anchor || !anchor.parentNode) return;
      if(anchor.parentNode.querySelector('[data-wdss-trigger]')) return;
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'wdss-trigger' + (m.variant === 'public' ? ' wd-public-trigger' : '');
      b.setAttribute('data-wd-search','open');
      b.setAttribute('data-wdss-trigger','');
      b.setAttribute('data-wdss-variant',m.variant);
      b.setAttribute('aria-label','Search Watchdog');
      b.setAttribute('aria-keyshortcuts',isMac ? 'Meta+K' : 'Control+K');
      b.title = 'Search Watchdog (' + (isMac ? 'Cmd' : 'Ctrl') + '+K)';
      b.innerHTML = triggerHtml();
      anchor.parentNode.insertBefore(b,anchor);
    });
  }

  function bind(){
    doc.addEventListener('keydown',function(e){
      var k = String(e.key || '').toLowerCase();
      if(k === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey){
        e.preventDefault();
        toggle();
        return;
      }
      if((e.metaKey || e.ctrlKey) && !isOpen) ensureData();
      if(k === '/' && !isOpen && !e.metaKey && !e.ctrlKey && !e.altKey && !editable(e.target)){
        e.preventDefault();
        open();
      }
    });
    /* Capture phase so menus that stop propagation still open search. */
    doc.addEventListener('click',function(e){
      var t = e.target && e.target.closest && e.target.closest('[data-wd-search="open"]');
      if(!t) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    },true);
    ['pointerover','focusin'].forEach(function(type){
      doc.addEventListener(type,function(e){
        if(e.target && e.target.closest && e.target.closest('[data-wd-search="open"]')) ensureData();
      },{passive:true});
    });
  }

  function start(){
    mount();
    bind();
    /* Shells build their top bars after data loads; keep looking briefly. */
    if(typeof MutationObserver === 'function'){
      var t = 0;
      var mo = new MutationObserver(function(){ clearTimeout(t); t = setTimeout(mount,80); });
      mo.observe(doc.body,{childList:true,subtree:true});
      setTimeout(function(){ mo.disconnect(); },12000);
    }
    root.addEventListener('load',mount,{once:true});
  }

  root.WatchdogSiteSearch = {version:VERSION, open:open, close:function(){ close(); }, toggle:toggle, engine:Engine};
  if(doc.body) start();
  else doc.addEventListener('DOMContentLoaded',start,{once:true});
})(typeof window !== 'undefined' ? window : this);
