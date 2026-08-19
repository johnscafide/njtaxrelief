(function(){
  'use strict';
  var source='/property/docs/whitepapers/WATCHDOG-ZAPIER-INTELLIGENCE-WHITEPAPER.md';
  var article=document.getElementById('wp-article');
  var state=document.getElementById('wp-reader-state');
  var toc=document.getElementById('wp-toc-links');
  if(!article)return;

  function slugify(text){
    return String(text||'').toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  }
  function buildToc(){
    if(!toc)return;
    toc.innerHTML='';
    article.querySelectorAll('h2,h3').forEach(function(heading,index){
      var base=slugify(heading.textContent)||('section-'+index);
      var id=base,serial=2;
      while(document.getElementById(id)&&document.getElementById(id)!==heading){id=base+'-'+serial++;}
      heading.id=id;
      var link=document.createElement('a');
      link.href='#'+id;
      link.textContent=heading.textContent;
      if(heading.tagName==='H3')link.style.paddingLeft='20px';
      toc.appendChild(link);
    });
  }
  function normalizeMarkdown(md){
    return String(md||'')
      .replace(/\.\/assets\//g,'/property/docs/whitepapers/assets/')
      .replace(/https:\/\/github\.com\/johnscafide\/njtaxrelief\/blob\/main\/property\/docs\/whitepapers\/WATCHDOG-ZAPIER-INTELLIGENCE-WHITEPAPER\.md/g,source);
  }
  function render(md){
    if(!window.marked||typeof window.marked.parse!=='function')throw new Error('Markdown renderer unavailable');
    window.marked.setOptions({gfm:true,breaks:false});
    article.innerHTML=window.marked.parse(normalizeMarkdown(md));
    buildToc();
    if(state)state.hidden=true;
    article.hidden=false;
  }
  function fail(error){
    console.error('[Watchdog Whitepaper Reader]',error);
    if(state){
      state.innerHTML='<i class="fas fa-triangle-exclamation"></i><div><b>Whitepaper could not load</b><div>The canonical Markdown is still available from the source button above. Refresh this page to retry.</div></div>';
    }
  }
  function boot(){
    fetch(source,{cache:'no-store',credentials:'same-origin'})
      .then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.text();})
      .then(render)
      .catch(fail);
  }
  Promise.resolve(window.njptrAccessReady||{}).then(boot).catch(fail);
})();