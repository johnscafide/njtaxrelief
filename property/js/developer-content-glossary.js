(function(){
  'use strict';
  var state={entries:[],owner:'all',query:''};
  var search=document.getElementById('cg-search');
  var results=document.getElementById('cg-results');
  var status=document.getElementById('cg-status');
  var filters=document.getElementById('cg-filters');
  var GH='https://github.com/johnscafide/njtaxrelief/blob/main/';

  function esc(value){return String(value||'').replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function highlight(value,query){var text=esc(value);if(!query)return text;var safe=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return text.replace(new RegExp('('+safe+')','ig'),'<mark>$1</mark>');}
  function matches(entry){if(state.owner!=='all'&&entry.owner!==state.owner)return false;if(!state.query)return true;var hay=[entry.text,entry.file,entry.owner,entry.contentClass,entry.guidance].join(' ').toLowerCase();return hay.includes(state.query.toLowerCase());}
  function badgeClass(owner){return owner==='JS'?' js':(owner==='DATA'?' data':(owner==='CMS'?' cms':''));}
  function render(){
    var all=state.entries.filter(matches);
    var list=all.slice(0,250);
    var suffix=state.query?' for “'+state.query+'”':'';
    status.textContent=list.length+(all.length>250?' of '+all.length:'')+' matching entries'+suffix;
    // content-architecture: dynamic — empty-state markup is conditional search-result UI, not static page copy ownership.
    if(!list.length){results.innerHTML='<div class="cg-empty">No matching content. Try a shorter phrase or search by file name.</div>';return;}
    // content-architecture: dynamic — result cards are rendered from generated glossary data and cannot be static HTML instances.
    results.innerHTML=list.map(function(entry){var line=entry.line?' · line '+entry.line:'';var github=entry.file.indexOf('property/')===0?GH+entry.file+(entry.line?'#L'+entry.line:''):'';return '<article class="cg-result"><div class="cg-result-top"><div class="cg-text">'+highlight(entry.text,state.query)+'</div><span class="cg-badge'+badgeClass(entry.owner)+'">'+esc(entry.owner)+'</span></div><div class="cg-meta"><span class="cg-path">'+highlight(entry.file,state.query)+'</span><span class="cg-line">'+esc(entry.contentClass)+line+'</span></div><div class="cg-guidance">'+esc(entry.guidance)+'</div><div class="cg-actions">'+(github?'<a href="'+esc(github)+'" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> Open source</a>':'')+'<button type="button" data-copy="'+esc(entry.file+(entry.line?':'+entry.line:''))+'"><i class="fas fa-copy"></i> Copy location</button></div></article>';}).join('');
  }
  function setMetrics(data){document.getElementById('cg-entry-count').textContent=(data.entryCount||0).toLocaleString();document.getElementById('cg-file-count').textContent=(data.sourceFileCount||0).toLocaleString();document.getElementById('cg-html-count').textContent=((data.owners||{}).HTML||0).toLocaleString();document.getElementById('cg-js-count').textContent=((data.owners||{}).JS||0).toLocaleString();document.getElementById('cg-data-count').textContent=((data.owners||{}).DATA||0).toLocaleString();}
  fetch('/api/content-glossary',{cache:'no-store'})
    .then(function(res){if(!res.ok)throw new Error('Glossary data unavailable');return res.json();})
    .then(function(data){state.entries=Array.isArray(data.entries)?data.entries:[];setMetrics(data);render();})
    .catch(function(error){
      status.textContent='Glossary could not load: '+error.message;
      // content-architecture: dynamic — this diagnostic appears only when the generated build artifact is unavailable.
      results.innerHTML='<div class="cg-empty">The generated glossary is unavailable on this deployment.</div>';
    });
  search.addEventListener('input',function(){state.query=search.value.trim();render();});
  filters.addEventListener('click',function(event){var button=event.target.closest('[data-owner]');if(!button)return;state.owner=button.getAttribute('data-owner');filters.querySelectorAll('button').forEach(function(item){item.classList.toggle('active',item===button);});render();});
  results.addEventListener('click',function(event){var button=event.target.closest('[data-copy]');if(!button)return;navigator.clipboard&&navigator.clipboard.writeText(button.getAttribute('data-copy'));var old=button.innerHTML;button.innerHTML='<i class="fas fa-check"></i> Copied';setTimeout(function(){button.innerHTML=old;},1000);});
})();
