/* Watchdog site editor (Phase 1).
   Loaded only for confirmed developers by site-editor-loader.js.

   How edits map back to source:
   - When Edit is turned on, the page's real source file is fetched from the
     draft branch (or main) and parsed. Each editable element on screen is
     matched to exactly one element in that source by tag + text (images by
     src + alt). Anything built by page scripts has no source match and stays
     locked, so runtime content can never be baked into a file.
   - Saves send element-level edits (by source index, with the text the editor
     saw) to /api/site-editor, which splices them into the file and commits to
     the draft branch. Publish merges the draft into main through a PR. */
(function(){
  'use strict';
  if(window.__WD_SITE_EDITOR__) return;
  window.__WD_SITE_EDITOR__ = true;

  var API = '/api/site-editor';
  var AUTH_KEY = 'sb-uvkvaxljhhngydvlrzom-auth-token';
  var MIN_KEY = 'wd-site-editor:minimized';
  var MAX_UPLOAD = 2.5 * 1024 * 1024;
  var MAX_TEXT = 5000;

  function set(list){ var o = {}; list.split(',').forEach(function(k){ o[k] = true; }); return o; }
  /* Elements that can be edited as one text unit, as long as everything
     inside them is inline formatting. */
  var CANDIDATE = set('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,td,th,dt,dd,summary,label,caption,legend,button,a,div,span,strong,em,b,i,small,cite,time,code');
  var INLINE = set('a,b,strong,em,i,u,s,span,small,br,code,sup,sub,mark,abbr,time,wbr,q,cite,kbd');
  var SINGLE_LINE = set('h1,h2,h3,h4,h5,h6,a,button,label,summary,td,th,dt,span,small,strong,em,b,i,caption,legend,cite,time,code');

  var state = {
    session: null,
    editing: false,
    busy: false,
    source: null,          // { file, sha, doc, mainDoc, list, index }
    active: null,
    changes: new Set(),    // live elements with unsaved edits
    attrEdits: new Map(),  // live element -> { attr: value|null }
    uploads: new Map(),    // id -> { id, name, type, data }
    counts: { editable: 0, locked: 0 }
  };
  var meta = new WeakMap();     // live element -> { src, index, type, paired, baseline }
  var attrSrc = new WeakMap();  // live descendant -> source attribute list
  var userAttr = new WeakSet(); // live descendants whose attributes the developer changed
  var imgAlias = new WeakMap(); // live img -> src value now stored in the draft

  /* ---------- helpers ---------- */

  function normText(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
  function token(){
    try{
      var parsed = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      var s = parsed && (parsed.currentSession || parsed);
      return s && s.access_token || '';
    }catch(_){ return ''; }
  }
  function api(action, payload){
    var body = Object.assign({ action:action, host:location.hostname }, payload || {});
    return fetch(API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token() },
      body:JSON.stringify(body),
      credentials:'same-origin',
      cache:'no-store'
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(data){
        if(!r.ok) throw new Error(data && data.error || ('Request failed (' + r.status + ')'));
        return data;
      });
    });
  }
  function uid(){
    var a = new Uint8Array(9);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function(b){ return (b % 36).toString(36); }).join('');
  }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function attrsOf(el){
    return Array.prototype.map.call(el.attributes, function(a){ return [a.name, a.value]; });
  }
  function isInternalAttr(name){ return name === 'contenteditable' || name.indexOf('data-wd-se') === 0; }
  function isOurs(node){ return !!(node && node.nodeType === 1 && (node === ui.host || node.closest && node.closest('#wd-site-editor-host'))); }

  /* ---------- matching live elements to source ---------- */

  function pathOf(el){
    var path = [];
    while(el && el.parentElement){
      path.unshift(Array.prototype.indexOf.call(el.parentElement.children, el));
      el = el.parentElement;
    }
    return path;
  }
  function byPath(doc, path){
    var el = doc.documentElement;
    for(var i = 0; i < path.length && el; i++) el = el.children[path[i]];
    return el || null;
  }
  function normUrl(value, base){
    try{
      var u = new URL(value, base);
      if(u.origin !== location.origin) return u.href;
      var p = u.pathname.replace(/^\/property(?=\/|$)/, '') || '/';
      return p + u.search;
    }catch(_){ return String(value || ''); }
  }
  function imgFp(el, base, alias){
    return 'img|' + normUrl(alias || el.getAttribute('src'), base) + '|' + normText(el.getAttribute('alt'));
  }
  function textFp(el){ return el.localName + '|' + normText(el.textContent); }
  function inlineOnly(el){
    var all = el.getElementsByTagName('*');
    for(var i = 0; i < all.length; i++) if(!INLINE[all[i].localName]) return false;
    return true;
  }
  function textCandidate(el){
    if(!CANDIDATE[el.localName] || !inlineOnly(el)) return false;
    var text = normText(el.textContent);
    return !!text && text.length <= MAX_TEXT;
  }
  function sourceBase(file){ return location.origin + '/' + file; }
  function fpMap(doc, file){
    var map = new Map();
    var base = sourceBase(file);
    Array.prototype.forEach.call(doc.getElementsByTagName('*'), function(el){
      var fp = null;
      if(el.localName === 'img' && el.getAttribute('src')) fp = imgFp(el, base);
      else if(CANDIDATE[el.localName] && inlineOnly(el)) fp = textFp(el);
      if(!fp) return;
      if(!map.has(fp)) map.set(fp, []);
      map.get(fp).push(el);
    });
    return map;
  }
  function parseSource(data){
    var parser = new DOMParser();
    var doc = parser.parseFromString(data.html, 'text/html');
    var list = Array.prototype.slice.call(doc.getElementsByTagName('*'));
    var index = new Map();
    list.forEach(function(el, i){ index.set(el, i); });
    return {
      file:data.file,
      sha:data.sha,
      doc:doc,
      mainDoc:data.mainHtml ? parser.parseFromString(data.mainHtml, 'text/html') : null,
      index:index
    };
  }

  function clearMarks(){
    document.querySelectorAll('[data-wd-se]').forEach(function(el){
      el.removeAttribute('data-wd-se');
      el.removeAttribute('data-wd-se-changed');
      el.removeAttribute('data-wd-se-active');
      el.removeAttribute('contenteditable');
    });
  }

  function scan(){
    clearMarks();
    var src = state.source;
    var srcMap = fpMap(src.doc, src.file);
    var mainMap = src.mainDoc ? fpMap(src.mainDoc, src.file) : null;
    var found = [];
    var all = document.body.getElementsByTagName('*');
    var live = new Map();

    for(var i = 0; i < all.length; i++){
      var el = all[i];
      if(isOurs(el)) continue;
      if(el.parentElement && el.parentElement.closest('[data-wd-se-candidate]')) continue;
      var type = null;
      if(el.localName === 'img' && el.getAttribute('src') && !el.closest('picture')) type = 'img';
      else if(textCandidate(el)) type = 'text';
      if(!type) continue;
      var fp = type === 'img' ? imgFp(el, location.href, imgAlias.get(el)) : textFp(el);
      el.setAttribute('data-wd-se-candidate', '');
      found.push({ el:el, type:type, fp:fp });
      live.set(fp, (live.get(fp) || 0) + 1);
    }

    var claimed = new Set();
    var editable = 0;
    found.forEach(function(item){
      item.el.removeAttribute('data-wd-se-candidate');
      if(live.get(item.fp) !== 1) return;
      var hit = srcMap.get(item.fp);
      var target = null, overlay = false;
      if(hit && hit.length === 1) target = hit[0];
      else if(mainMap){
        var m = mainMap.get(item.fp);
        if(m && m.length === 1){
          var d = byPath(src.doc, pathOf(m[0]));
          if(d && d.localName === m[0].localName){ target = d; overlay = true; }
        }
      }
      if(!target || claimed.has(target) || !src.index.has(target)) return;
      if(item.type === 'text' && !(CANDIDATE[target.localName] && inlineOnly(target))) return;
      claimed.add(target);
      meta.set(item.el, { src:target, index:src.index.get(target), type:item.type, paired:false, baseline:null });
      item.el.setAttribute('data-wd-se', item.type);
      if(overlay) showDraftVersion(item.el, target, item.type);
      editable++;
    });
    state.counts = { editable:editable, locked:found.length - editable };
  }

  /* The page on screen is the deployed version. When the draft already has a
     saved change for an element, show the draft version while editing. */
  function showDraftVersion(el, target, type){
    if(type === 'img'){
      var srcValue = target.getAttribute('src');
      el.setAttribute('src', new URL(srcValue, sourceBase(state.source.file)).href);
      imgAlias.set(el, srcValue);
      if(target.hasAttribute('srcset')) el.setAttribute('srcset', target.getAttribute('srcset'));
      else el.removeAttribute('srcset');
      el.setAttribute('alt', target.getAttribute('alt') || '');
    }else{
      el.innerHTML = target.innerHTML;
    }
  }

  /* Pair each descendant on screen with its source element so saved HTML keeps
     the source attributes (page scripts rewrite links and add attributes at
     runtime; those must not leak into the file). */
  function pair(el, m){
    var live = el.getElementsByTagName('*');
    var src = m.src.getElementsByTagName('*');
    var same = live.length === src.length;
    for(var i = 0; same && i < live.length; i++) if(live[i].localName !== src[i].localName) same = false;
    if(!same){
      el.innerHTML = m.src.innerHTML;
      live = el.getElementsByTagName('*');
    }
    for(var j = 0; j < live.length; j++) attrSrc.set(live[j], attrsOf(src[j]));
    m.paired = true;
    m.baseline = serialize(el);
  }

  function serialize(el){
    var clone = el.cloneNode(true);
    var live = el.getElementsByTagName('*');
    var copy = clone.getElementsByTagName('*');
    for(var i = 0; i < live.length; i++){
      var attrs = userAttr.has(live[i]) ? attrsOf(live[i]) : (attrSrc.get(live[i]) || attrsOf(live[i]));
      var target = copy[i];
      while(target.attributes.length) target.removeAttribute(target.attributes[0].name);
      attrs.forEach(function(a){ if(!isInternalAttr(a[0])) target.setAttribute(a[0], a[1]); });
    }
    return clone.innerHTML;
  }

  /* ---------- editing ---------- */

  function markChanged(el){
    var m = meta.get(el);
    var dirty = !!state.attrEdits.get(el) || !!(m && m.paired && serialize(el) !== m.baseline);
    if(dirty){ state.changes.add(el); el.setAttribute('data-wd-se-changed', ''); }
    else{ state.changes.delete(el); el.removeAttribute('data-wd-se-changed'); }
    render();
  }

  function activate(el, event){
    if(state.active === el) return;
    deactivate();
    var m = meta.get(el);
    if(!m) return;
    if(!m.paired) pair(el, m);
    state.active = el;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-wd-se-active', '');
    el.focus({ preventScroll:true });
    var range = null;
    if(event && document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
    else if(event && document.caretPositionFromPoint){
      var pos = document.caretPositionFromPoint(event.clientX, event.clientY);
      if(pos){ range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
    }
    if(range && el.contains(range.startContainer)){
      var sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    showToolbar();
  }

  function deactivate(){
    var el = state.active;
    if(!el) return;
    state.active = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-wd-se-active');
    hideToolbar();
    markChanged(el);
  }

  function setAttrEdit(el, name, value){
    var edits = state.attrEdits.get(el) || {};
    edits[name] = value;
    state.attrEdits.set(el, edits);
    if(value == null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function anchorAtSelection(){
    var el = state.active;
    var sel = getSelection();
    if(!el || !sel.rangeCount) return null;
    var node = sel.getRangeAt(0).commonAncestorContainer;
    if(node.nodeType !== 1) node = node.parentElement;
    var a = node && node.closest('a');
    return a && el.contains(a) && a !== el ? a : null;
  }

  function onDocClick(e){
    if(!state.editing || isOurs(e.target)) return;
    var el = e.target.closest && e.target.closest('[data-wd-se]');
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if(state.active && state.active.contains(e.target)) return;
    if(!el){ deactivate(); return; }
    if(el.getAttribute('data-wd-se') === 'img'){ deactivate(); openImagePanel(el); }
    else activate(el, e);
  }
  function onDocKey(e){
    var mod = e.metaKey || e.ctrlKey;
    if(state.editing && mod && (e.key === 's' || e.key === 'S')){ e.preventDefault(); save(); return; }
    if(!state.active || !state.active.contains(e.target)) return;
    e.stopPropagation();
    if(e.key === 'Escape'){ e.preventDefault(); deactivate(); return; }
    if(e.key === 'Enter'){
      /* Single-line items finish on Enter. Paragraph-like items get a line
         break instead of a new block, which keeps the element's structure. */
      e.preventDefault();
      var tag = state.active.localName;
      if(SINGLE_LINE[tag] || (tag === 'li' && !e.shiftKey)) deactivate();
      else document.execCommand('insertLineBreak');
    }
  }
  function onPaste(e){
    if(!state.active || !state.active.contains(e.target)) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }
  function blockEvent(e){
    if(state.editing && !isOurs(e.target)){ e.preventDefault(); e.stopPropagation(); }
  }
  function onInput(e){
    if(e && isOurs(e.target)) return;
    if(state.active){ state.changes.add(state.active); state.active.setAttribute('data-wd-se-changed', ''); render(); }
    positionToolbar();
  }

  function startEditing(){
    if(state.busy) return;
    if(!state.session || state.session.configured === false){
      toast('The site editor needs setup first: add SITE_EDITOR_GITHUB_TOKEN in Vercel.', 'error');
      return;
    }
    state.busy = true;
    render('Loading this page from GitHub…');
    api('source', { pathname:location.pathname }).then(function(data){
      state.source = parseSource(data);
      state.editing = true;
      document.documentElement.classList.add('wd-se-on');
      scan();
      state.busy = false;
      render();
      toast(state.counts.editable
        ? state.counts.editable + ' items on this page are editable. Anything built by page scripts is locked.'
        : 'Nothing on this page could be matched to its source file, so nothing is editable here yet.');
    }).catch(function(err){
      state.busy = false;
      render();
      toast(err.message, 'error');
    });
  }

  function stopEditing(){
    deactivate();
    if(state.changes.size){
      confirmBox('Throw away unsaved changes?', 'You have ' + state.changes.size + ' unsaved change' + (state.changes.size === 1 ? '' : 's') + '. The page will reload.', 'Throw away', function(){
        state.changes.clear();
        location.reload();
      });
      return;
    }
    state.editing = false;
    document.documentElement.classList.remove('wd-se-on');
    clearMarks();
    render();
  }

  function collectEdits(){
    var edits = [];
    var usedUploads = new Set();
    state.changes.forEach(function(el){
      var m = meta.get(el);
      if(!m) return;
      var base = { index:m.index, tag:m.src.localName, text:normText(m.src.textContent) };
      if(m.type === 'text' && m.paired){
        var html = serialize(el);
        if(html !== m.baseline) edits.push(Object.assign({ kind:'content', html:html }, base));
      }
      var attrs = state.attrEdits.get(el) || {};
      Object.keys(attrs).forEach(function(name){
        var value = attrs[name];
        if(typeof value === 'string' && value.indexOf('upload:') === 0) usedUploads.add(value.slice(7));
        edits.push(Object.assign({ kind:'attr', name:name, value:value }, base));
      });
    });
    var uploads = [];
    usedUploads.forEach(function(id){ if(state.uploads.has(id)) uploads.push(state.uploads.get(id)); });
    return { edits:edits, uploads:uploads };
  }

  function save(){
    if(state.busy || !state.editing) return;
    deactivate();
    var batch = collectEdits();
    if(!batch.edits.length){ toast('No changes to save.'); return; }
    state.busy = true;
    render('Saving to the draft branch…');
    api('save', {
      pathname:location.pathname,
      pageUrl:location.origin + location.pathname,
      file:state.source.file,
      sha:state.source.sha,
      edits:batch.edits,
      uploads:batch.uploads
    }).then(function(data){
      var uploadPaths = data.uploads || {};
      state.changes.forEach(function(el){
        var attrs = state.attrEdits.get(el);
        if(attrs && attrs.src){
          var v = attrs.src;
          imgAlias.set(el, v.indexOf('upload:') === 0 ? uploadPaths[v.slice(7)] : v);
        }
      });
      state.changes.clear();
      state.attrEdits.clear();
      state.uploads.clear();
      state.source = parseSource({ file:state.source.file, sha:data.sha, html:data.html, mainHtml:null });
      scan();
      state.busy = false;
      toast(data.saved ? 'Saved to the draft. Publish when you are ready.' : 'Nothing changed in the source, so nothing was saved.', 'ok');
      return refreshSession();
    }).catch(function(err){
      state.busy = false;
      render();
      toast(err.message, 'error');
    });
  }

  function publish(){
    var pending = state.session && state.session.pending;
    if(!pending || !pending.files.length){ toast('There are no draft changes to publish.'); return; }
    if(state.changes.size){ toast('Save or throw away your unsaved changes before publishing.', 'error'); return; }
    var list = pending.files.map(function(f){ return '<li><code>' + esc(f.file) + '</code></li>'; }).join('');
    confirmBox('Publish draft to main?', 'This merges these files into <code>' + esc(state.session.base) + '</code> through a pull request:<ul>' + list + '</ul>The live site changes after your next deploy.', 'Publish', function(){
      state.busy = true;
      render('Publishing…');
      api('publish').then(function(data){
        state.busy = false;
        if(data.merged) toast('Published. <a href="' + esc(data.prUrl) + '" target="_blank" rel="noopener">View the pull request</a>. Deploy to make it live.', 'ok', true);
        else toast(esc(data.message) + (data.prUrl ? ' <a href="' + esc(data.prUrl) + '" target="_blank" rel="noopener">Open the pull request</a>' : ''), data.prUrl ? 'error' : '', true);
        return refreshSession();
      }).catch(function(err){
        state.busy = false;
        render();
        toast(err.message, 'error');
      });
    }, true);
  }

  function discardDraft(){
    confirmBox('Discard the whole draft?', 'This deletes the draft branch and every saved change that has not been published. This cannot be undone.', 'Discard draft', function(){
      state.busy = true;
      render('Discarding draft…');
      api('discard').then(function(){
        state.changes.clear();
        location.reload();
      }).catch(function(err){
        state.busy = false;
        render();
        toast(err.message, 'error');
      });
    });
  }

  function refreshSession(){
    return api('session').then(function(data){
      state.session = data;
      render();
    }).catch(function(){ render(); });
  }

  /* ---------- UI (shadow DOM keeps page CSS out) ---------- */

  var ui = {};
  var PAGE_CSS = [
    'html.wd-se-on body{padding-bottom:calc(var(--wd-se-bar-h,72px) + 24px)!important}',
    'html.wd-se-on [data-wd-se]{outline:1px dashed rgba(37,99,235,.55)!important;outline-offset:2px!important;cursor:text!important}',
    'html.wd-se-on [data-wd-se="img"]{cursor:pointer!important}',
    'html.wd-se-on [data-wd-se]:hover{outline:2px solid rgba(37,99,235,.9)!important}',
    'html.wd-se-on [data-wd-se-changed]{outline:2px solid #d97706!important}',
    'html.wd-se-on [data-wd-se-active]{outline:2px solid #2563eb!important;outline-offset:3px!important;background-color:rgba(37,99,235,.06)!important;cursor:text!important;-webkit-user-modify:read-write}'
  ].join('\n');
  var UI_CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}',
    '.bar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:max-content;max-width:calc(100vw - 24px);padding:8px;border-radius:16px;background:#0f1f38;color:#fff;box-shadow:0 12px 40px rgba(2,12,27,.35)}',
    '.brand{display:flex;align-items:center;gap:8px;padding:0 6px;font-size:14px;font-weight:700;white-space:nowrap}',
    '.dot{width:10px;height:10px;border-radius:50%;background:#38bdf8;flex:none}',
    '.bar.editing .dot{background:#f59e0b}',
    '.mini-dot{display:inline-block;margin-right:8px;vertical-align:middle}',
    '.status{font-size:13px;color:#c7d4e6;padding:0 4px;max-width:340px;line-height:1.35}',
    'button{font:inherit;font-size:14px;font-weight:600;min-height:44px;min-width:44px;padding:0 14px;border-radius:11px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}',
    'button:hover{background:rgba(255,255,255,.16)}',
    'button:focus-visible,input:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}',
    'button.primary{background:#2563eb;border-color:#2563eb}',
    'button.primary:hover{background:#1d4ed8}',
    'button.warn{background:#b45309;border-color:#b45309}',
    'button[disabled]{opacity:.5;cursor:default}',
    '.menu{position:fixed;z-index:2147483001;bottom:calc(var(--bar-h,64px) + 20px);left:50%;transform:translateX(-50%);display:grid;gap:4px;min-width:240px;padding:6px;border-radius:14px;background:#fff;color:#10294b;box-shadow:0 12px 40px rgba(2,12,27,.3)}',
    '.menu button,.menu a{display:flex;align-items:center;width:100%;text-align:left;background:none;border:0;color:#10294b;border-radius:9px;font-size:14px;font-weight:600;min-height:44px;padding:0 12px;text-decoration:none}',
    '.menu button:hover,.menu a:hover{background:#eef3fb}',
    '.menu .danger{color:#b91c1c}',
    '.mini{position:fixed;left:12px;bottom:12px;z-index:2147483000;border-radius:999px;background:#0f1f38;box-shadow:0 8px 24px rgba(2,12,27,.3)}',
    '.tools{position:fixed;z-index:2147483001;display:flex;gap:4px;padding:4px;border-radius:12px;background:#0f1f38;box-shadow:0 8px 24px rgba(2,12,27,.35)}',
    '.tools button{min-width:44px;padding:0 10px}',
    '.backdrop{position:fixed;inset:0;z-index:2147483002;background:rgba(2,12,27,.45);display:flex;align-items:center;justify-content:center;padding:16px}',
    '.card{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#10294b;border-radius:18px;padding:20px;box-shadow:0 20px 60px rgba(2,12,27,.35)}',
    '.card h2{margin:0 0 8px;font-size:18px}',
    '.card p,.card li{font-size:14px;line-height:1.5;color:#334155}',
    '.card ul{padding-left:20px;margin:8px 0}',
    '.card code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f1f5f9;padding:1px 4px;border-radius:4px;word-break:break-all}',
    '.card label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px;color:#10294b}',
    '.card input[type=text],.card input[type=url]{width:100%;min-height:44px;padding:8px 12px;font-size:16px;border:1px solid #cbd5e1;border-radius:10px;color:#10294b;background:#fff}',
    '.card .check{display:flex;align-items:center;gap:8px;font-weight:500;min-height:44px}',
    '.card .check input{width:20px;height:20px}',
    '.card .preview{display:block;max-width:100%;max-height:160px;margin:4px 0;border-radius:10px;border:1px solid #e2e8f0;object-fit:contain;background:#f8fafc}',
    '.card .hint{font-size:12px;color:#64748b;margin:4px 0 0}',
    '.row{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:18px}',
    '.card button{color:#10294b;background:#fff;border-color:#cbd5e1}',
    '.card button:hover{background:#f1f5f9}',
    '.card button.primary{color:#fff;background:#2563eb;border-color:#2563eb}',
    '.card button.danger{color:#fff;background:#b91c1c;border-color:#b91c1c}',
    '.toast{position:fixed;left:50%;bottom:calc(var(--bar-h,64px) + 20px);transform:translateX(-50%);z-index:2147483001;width:max-content;max-width:calc(100vw - 24px);padding:12px 16px;border-radius:12px;background:#fff;color:#10294b;font-size:14px;line-height:1.4;box-shadow:0 12px 40px rgba(2,12,27,.3);border-left:5px solid #2563eb}',
    '.toast.ok{border-left-color:#16a34a}',
    '.toast.error{border-left-color:#b91c1c}',
    '.toast a{color:#1d4ed8;font-weight:600}',
    '@media (max-width:560px){.brand .label{display:none}.status{flex-basis:100%;order:9;padding:0 6px 2px;max-width:none}.bar{justify-content:center}}',
    '@media (max-width:400px){.bar{gap:6px;padding:6px}.brand{padding:0 2px}.bar button{padding:0 10px;font-size:13px}}'
  ].join('\n');

  function el(tag, attrs, html){
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function(k){ node.setAttribute(k, attrs[k]); });
    if(html != null) node.innerHTML = html;
    return node;
  }

  function mount(){
    var pageStyle = el('style', { id:'wd-site-editor-page-style' });
    pageStyle.textContent = PAGE_CSS;
    document.head.appendChild(pageStyle);

    ui.host = el('div', { id:'wd-site-editor-host' });
    document.body.appendChild(ui.host);
    ui.root = ui.host.attachShadow({ mode:'open' });
    var style = el('style');
    style.textContent = UI_CSS;
    ui.root.appendChild(style);
    ui.bar = el('div', { class:'bar', role:'toolbar', 'aria-label':'Site editor' });
    ui.root.appendChild(ui.bar);
    ui.bar.addEventListener('click', onBarClick);

    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onDocKey, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('submit', blockEvent, true);
    document.addEventListener('drop', blockEvent, true);
    window.addEventListener('scroll', positionToolbar, { passive:true });
    window.addEventListener('resize', function(){ positionToolbar(); if(ui.bar) syncBarHeight(); }, { passive:true });
    window.addEventListener('beforeunload', function(e){
      if(state.changes.size){ e.preventDefault(); e.returnValue = ''; }
    });
  }

  function minimized(){ try{ return localStorage.getItem(MIN_KEY) === '1'; }catch(_){ return false; } }
  function setMinimized(v){ try{ localStorage.setItem(MIN_KEY, v ? '1' : '0'); }catch(_){} render(); }

  function statusText(busyText){
    if(busyText) return busyText;
    var s = state.session;
    if(!s) return 'Checking access…';
    if(s.configured === false) return 'Setup needed: add SITE_EDITOR_GITHUB_TOKEN in Vercel.';
    if(state.editing){
      var n = state.changes.size;
      return n ? n + ' unsaved change' + (n === 1 ? '' : 's') : 'Click any outlined item to edit it.';
    }
    var files = s.pending && s.pending.files.length || 0;
    return files ? 'Draft: ' + files + ' file' + (files === 1 ? '' : 's') + ' waiting to publish' : 'No unpublished changes';
  }

  function render(busyText){
    if(!ui.bar) return;
    closeMenu();
    if(minimized() && !state.editing){
      ui.bar.className = 'mini';
      // content-architecture: dynamic — developer-only editor chrome inside its own shadow root, re-rendered from editor state (minimized, editing, busy, draft count); never shown to customers.
      ui.bar.innerHTML = '<button type="button" data-act="restore" aria-label="Open site editor"><span class="dot mini-dot"></span>Edit</button>';
      return;
    }
    var files = state.session && state.session.pending ? state.session.pending.files.length : 0;
    var busy = state.busy ? ' disabled' : '';
    ui.bar.className = 'bar' + (state.editing ? ' editing' : '');
    var buttons = state.editing
      ? '<button type="button" class="primary" data-act="save"' + busy + (state.changes.size ? '' : ' disabled') + '>Save draft</button>' +
        '<button type="button" data-act="done"' + busy + '>Exit editor</button>'
      : '<button type="button" class="primary" data-act="edit"' + busy + '>Edit page</button>' +
        '<button type="button" data-act="publish"' + busy + (files ? '' : ' disabled') + '>Publish' + (files ? ' (' + files + ')' : '') + '</button>';
    ui.bar.innerHTML =
      '<span class="brand"><span class="dot" aria-hidden="true"></span><span class="label">Site editor</span></span>' +
      '<span class="status" role="status" aria-live="polite">' + esc(statusText(busyText)) + '</span>' +
      buttons +
      '<button type="button" data-act="more" aria-label="More site editor options" aria-haspopup="menu">•••</button>';
    syncBarHeight();
  }

  /* Popups sit above the bar and the page gets room to scroll past it, even
     when the bar wraps onto two rows on phones. */
  function syncBarHeight(){
    var h = ui.bar.offsetHeight + 12;
    ui.host.style.setProperty('--bar-h', h + 'px');
    document.documentElement.style.setProperty('--wd-se-bar-h', h + 'px');
  }

  function onBarClick(e){
    var btn = e.target.closest('button');
    if(!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    if(act === 'edit') startEditing();
    else if(act === 'done') stopEditing();
    else if(act === 'save') save();
    else if(act === 'publish') publish();
    else if(act === 'restore') setMinimized(false);
    else if(act === 'more') toggleMenu();
  }

  function closeMenu(){ if(ui.menu){ ui.menu.remove(); ui.menu = null; } }
  function toggleMenu(){
    if(ui.menu){ closeMenu(); return; }
    var s = state.session || {};
    var files = s.pending && s.pending.files.length;
    ui.menu = el('div', { class:'menu', role:'menu' },
      (s.compareUrl && files ? '<a role="menuitem" href="' + esc(s.compareUrl) + '" target="_blank" rel="noopener">See draft changes on GitHub</a>' : '') +
      (files ? '<button type="button" role="menuitem" class="danger" data-act="discard">Discard draft…</button>' : '') +
      (state.editing ? '' : '<button type="button" role="menuitem" data-act="minimize">Minimize editor</button>') +
      '<button type="button" role="menuitem" data-act="close">Close menu</button>');
    ui.root.appendChild(ui.menu);
    ui.menu.addEventListener('click', function(e){
      var b = e.target.closest('button');
      if(!b) return;
      var act = b.getAttribute('data-act');
      closeMenu();
      if(act === 'discard') discardDraft();
      else if(act === 'minimize') setMinimized(true);
    });
    var first = ui.menu.querySelector('a,button');
    if(first) first.focus();
  }

  var toastTimer = null;
  function toast(message, kind, isHtml){
    if(ui.toast) ui.toast.remove();
    ui.toast = el('div', { class:'toast' + (kind ? ' ' + kind : ''), role:kind === 'error' ? 'alert' : 'status' });
    if(isHtml) ui.toast.innerHTML = message;
    else ui.toast.textContent = message;
    ui.root.appendChild(ui.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ if(ui.toast){ ui.toast.remove(); ui.toast = null; } }, isHtml ? 12000 : 6000);
  }

  function dialog(html, onReady){
    var back = el('div', { class:'backdrop' });
    var card = el('div', { class:'card', role:'dialog', 'aria-modal':'true' }, html);
    back.appendChild(card);
    ui.root.appendChild(back);
    var lastFocus = document.activeElement;
    function close(){
      back.remove();
      if(lastFocus && lastFocus.focus) try{ lastFocus.focus({ preventScroll:true }); }catch(_){}
    }
    back.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } });
    back.addEventListener('mousedown', function(e){ if(e.target === back) close(); });
    var focusable = card.querySelector('input,button');
    if(focusable) focusable.focus();
    if(onReady) onReady(card, close);
    return close;
  }

  function confirmBox(title, bodyHtml, okLabel, onOk, primary){
    dialog('<h2>' + esc(title) + '</h2><p>' + bodyHtml + '</p><div class="row"><button type="button" data-x="cancel">Cancel</button><button type="button" class="' + (primary ? 'primary' : 'danger') + '" data-x="ok">' + esc(okLabel) + '</button></div>', function(card, close){
      card.querySelector('[data-x=cancel]').addEventListener('click', close);
      card.querySelector('[data-x=ok]').addEventListener('click', function(){ close(); onOk(); });
      card.querySelector('[data-x=cancel]').focus();
    });
  }

  /* ---------- text toolbar ---------- */

  function showToolbar(){
    if(!ui.tools){
      ui.tools = el('div', { class:'tools', role:'toolbar', 'aria-label':'Text formatting' },
        '<button type="button" data-t="bold" aria-label="Bold"><b>B</b></button>' +
        '<button type="button" data-t="italic" aria-label="Italic"><i>I</i></button>' +
        '<button type="button" data-t="link">Link</button>' +
        '<button type="button" data-t="unlink">Unlink</button>' +
        '<button type="button" data-t="done" class="primary">Done</button>');
      /* Keep the text selection when a toolbar button is pressed. */
      ui.tools.addEventListener('mousedown', function(e){ e.preventDefault(); });
      ui.tools.addEventListener('click', onToolClick);
      ui.root.appendChild(ui.tools);
    }
    ui.tools.style.display = 'flex';
    var isLink = state.active && state.active.localName === 'a';
    ui.tools.querySelector('[data-t=unlink]').style.display = isLink ? 'none' : '';
    positionToolbar();
  }
  function hideToolbar(){ if(ui.tools) ui.tools.style.display = 'none'; }
  function positionToolbar(){
    if(!ui.tools || !state.active || ui.tools.style.display === 'none') return;
    var r = state.active.getBoundingClientRect();
    var w = ui.tools.offsetWidth || 260;
    var top = r.top - 58;
    if(top < 8) top = r.bottom + 8;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    ui.tools.style.top = top + 'px';
    ui.tools.style.left = left + 'px';
  }
  function onToolClick(e){
    var b = e.target.closest('button');
    if(!b || !state.active) return;
    var t = b.getAttribute('data-t');
    if(t === 'bold' || t === 'italic'){ document.execCommand(t); onInput(); }
    else if(t === 'link') openLinkPanel();
    else if(t === 'unlink'){
      var a = anchorAtSelection();
      if(!a){ toast('Put the cursor inside a link first.'); return; }
      while(a.firstChild) a.parentNode.insertBefore(a.firstChild, a);
      a.remove();
      onInput();
    }
    else if(t === 'done') deactivate();
  }

  function openLinkPanel(){
    var root = state.active;
    var sel = getSelection();
    var range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    var target = root.localName === 'a' ? root : anchorAtSelection();
    if(!target && (!range || range.collapsed)){ toast('Select the words you want to turn into a link first.'); return; }
    var href = target ? target.getAttribute('href') || '' : '';
    var newTab = target ? target.getAttribute('target') === '_blank' : false;
    dialog('<h2>' + (target ? 'Edit link' : 'Add link') + '</h2>' +
      '<label for="se-href">Link address</label><input id="se-href" type="url" inputmode="url" autocomplete="off" placeholder="/dashboard or https://…" value="' + esc(href) + '">' +
      '<p class="hint">Use clean Watchdog paths like <code>/insights</code> for pages on this site.</p>' +
      '<label class="check"><input id="se-tab" type="checkbox"' + (newTab ? ' checked' : '') + '> Open in a new tab</label>' +
      '<div class="row"><button type="button" data-x="cancel">Cancel</button><button type="button" class="primary" data-x="ok">Apply</button></div>',
    function(card, close){
      var input = card.querySelector('#se-href');
      input.focus();
      input.select();
      card.querySelector('[data-x=cancel]').addEventListener('click', close);
      function apply(){
        var url = input.value.trim();
        var tab = card.querySelector('#se-tab').checked;
        if(!url){ input.focus(); return; }
        if(/^\s*(javascript|vbscript|data):/i.test(url)){ toast('That kind of link is not allowed.', 'error'); return; }
        close();
        if(target === root){
          setAttrEdit(root, 'href', url);
          setAttrEdit(root, 'target', tab ? '_blank' : null);
          setAttrEdit(root, 'rel', tab ? 'noopener' : null);
          markChanged(root);
          return;
        }
        if(target){
          target.setAttribute('href', url);
          if(tab){ target.setAttribute('target', '_blank'); target.setAttribute('rel', 'noopener'); }
          else{ target.removeAttribute('target'); target.removeAttribute('rel'); }
          userAttr.add(target);
        }else{
          root.focus({ preventScroll:true });
          var s = getSelection();
          s.removeAllRanges();
          s.addRange(range);
          document.execCommand('createLink', false, url);
          Array.prototype.forEach.call(root.querySelectorAll('a'), function(a){
            if(!attrSrc.has(a) && !userAttr.has(a) && a.getAttribute('href') === url){
              if(tab){ a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
              userAttr.add(a);
            }
          });
        }
        onInput();
      }
      card.querySelector('[data-x=ok]').addEventListener('click', apply);
      input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); apply(); } });
    });
  }

  /* ---------- images ---------- */

  function openImagePanel(img){
    var pendingUpload = null;
    dialog('<h2>Edit image</h2>' +
      '<img class="preview" alt="" src="' + esc(img.currentSrc || img.src) + '">' +
      '<label for="se-alt">Alt text (describes the image for screen readers)</label><input id="se-alt" type="text" value="' + esc(img.getAttribute('alt') || '') + '">' +
      '<label for="se-src">Image address</label><input id="se-src" type="url" autocomplete="off" value="' + esc(imgAlias.get(img) || img.getAttribute('src') || '') + '">' +
      '<label for="se-file">Or upload a new image</label><input id="se-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">' +
      '<p class="hint">PNG, JPEG, WebP, GIF, or AVIF up to 2.5 MB. Uploads are saved to <code>property/assets/site-editor/</code>.</p>' +
      '<div class="row"><button type="button" data-x="cancel">Cancel</button><button type="button" class="primary" data-x="ok">Apply</button></div>',
    function(card, close){
      var preview = card.querySelector('.preview');
      var srcInput = card.querySelector('#se-src');
      var startSrc = srcInput.value;
      card.querySelector('[data-x=cancel]').addEventListener('click', close);
      card.querySelector('#se-file').addEventListener('change', function(e){
        var file = e.target.files && e.target.files[0];
        if(!file) return;
        if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)){ toast('Pick a PNG, JPEG, WebP, GIF, or AVIF image.', 'error'); return; }
        if(file.size > MAX_UPLOAD){ toast('That image is over 2.5 MB. Please use a smaller one.', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function(){
          var dataUrl = String(reader.result);
          pendingUpload = { id:uid(), name:file.name, type:file.type, data:dataUrl.slice(dataUrl.indexOf(',') + 1), preview:dataUrl };
          preview.src = dataUrl;
          srcInput.value = '';
          srcInput.placeholder = 'Using uploaded file: ' + file.name;
        };
        reader.readAsDataURL(file);
      });
      card.querySelector('[data-x=ok]').addEventListener('click', function(){
        var alt = card.querySelector('#se-alt').value;
        var src = srcInput.value.trim();
        if(src && /^\s*(javascript|vbscript|data):/i.test(src)){ toast('That image address is not allowed.', 'error'); return; }
        close();
        var m = meta.get(img);
        if(alt !== (img.getAttribute('alt') || '')) setAttrEdit(img, 'alt', alt);
        var newSrc = null, display = null;
        if(pendingUpload){
          state.uploads.set(pendingUpload.id, { id:pendingUpload.id, name:pendingUpload.name, type:pendingUpload.type, data:pendingUpload.data });
          newSrc = 'upload:' + pendingUpload.id;
          display = pendingUpload.preview;
        }else if(src && src !== startSrc){
          newSrc = src;
          display = src;
        }
        if(newSrc){
          setAttrEdit(img, 'src', newSrc);
          img.setAttribute('src', display);
          if(m && m.src.hasAttribute('srcset')) setAttrEdit(img, 'srcset', null);
          if(m && m.src.hasAttribute('sizes')) setAttrEdit(img, 'sizes', null);
          img.removeAttribute('srcset');
        }
        markChanged(img);
      });
    });
  }

  /* ---------- boot ---------- */

  function boot(){
    mount();
    render();
    refreshSession();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
