/* 
     
     Hi There. I see you are checking the code. I'm sure you have reasons for such. Curiosity would be my guess. 

     My name is John. I've been building sites since I was 10. I was gifted ecommerce website software on floppy disks
     and fell in love with web developement ever since. I learned to code HTML using just notepad. I took computer science
     classes (BASIC and Visual Basic in high school). Took a few college classes learning C++, Python, Ruby and Javascript.
     My very first websites was with Angelfire and Geocities. In college I dabbed in game development, small tools, and
     graphic design. Database management with SQL by my sophmore year. Joomla and other CMS tools learned by the age of 20. 
     I have an understanding and experience writing code by hand, studing and analyzing bugs, issues, and corrections. 
     The introduction of AI is interesting. I can understand the worry and fear. I also see the memes of "Hey I can make 
     your job obsolete" then show a localhost:3000. haha. But I do believe, if you understand how to use the tools, it's
     no different than templates, hiring a local kid, outsourcing your work to fivrr or an agency. I code, I understand the
     backend and frontend. I'm not an expert by all means. But I do have insights. Watchdog was built on real research.
     Watchdog & it's companion, NJPropertyTaxRelief.com, is from years of listening to real people with real needs in NJ.
     I hope these sites and tools have benefit to you and/or your business. If you found them useful, the least I ask of
     you is to share. Sure, I have paid plan options for members, but majority of the site is free to use. I'm a real estate
     agent, licensed tax professional, and a big fan of the state of New Jersey. It's a great state, but not without its
     flaws. The idea is to educate more New Jerseyians about their benefits and property taxes in the state. It's possible
     one day this site will exceed some of the bigger natonal sites. Who knows. But for now, I present to you, Watchdog
     Property Intelligence.

     */

(function(){
  var body=document.body;
  var feed=document.getElementById('now-feed');
  var posts=[].slice.call(document.querySelectorAll('.np'));
  var townFilter='';
  var toastTimer=0;

  function toast(msg){
    var t=document.getElementById('now-toast');
    t.textContent=msg;t.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show');},1800);
  }

  function townName(slug){
    var el=document.querySelector('.st[data-town="'+slug+'"] .st-name');
    return el?el.textContent:slug;
  }

  function apply(){
    var tab=body.getAttribute('data-tab')||'all';
    var shown=0;
    posts.forEach(function(p){
      var ok=true;
      if(tab==='saved')ok=p.querySelector('.np-save.on')!==null;
      else if(tab!=='all')ok=p.getAttribute('data-type')===tab;
      if(ok&&townFilter)ok=p.getAttribute('data-town')===townFilter;
      p.hidden=!ok;if(ok)shown++;
    });
    document.getElementById('now-empty').hidden=shown>0;
    var trend=document.querySelector('.now-inline-trend');
    if(trend)trend.hidden=tab!=='all'||!!townFilter;
    var f=document.getElementById('now-filter');
    f.hidden=!townFilter;
    if(townFilter)document.getElementById('now-filter-name').textContent=townName(townFilter);
    document.querySelectorAll('.st[data-town]').forEach(function(s){s.classList.toggle('on',s.getAttribute('data-town')===townFilter);});
  }

  function setTab(tab){
    body.setAttribute('data-tab',tab);
    document.querySelectorAll('[data-tab]').forEach(function(b){
      if(b===body)return;
      var on=b.getAttribute('data-tab')===tab;
      b.classList.toggle('on',on);
      if(b.getAttribute('role')==='tab')b.setAttribute('aria-selected',on?'true':'false');
    });
    apply();
  }

  function setTown(slug){
    townFilter=townFilter===slug?'':slug;
    apply();
    var top=feed.getBoundingClientRect().top+window.scrollY-10;
    if(window.scrollY>top)window.scrollTo({top:top});
  }

  window.nowClearTown=function(){townFilter='';apply();};
  window.nowFocusSearch=function(){
    var q=document.getElementById('now-q');
    if(!q)return;
    if(q.offsetParent===null)body.classList.add('now-searching');
    window.scrollTo({top:0});
    q.focus();
  };
  document.getElementById('now-q').addEventListener('blur',function(){if(!this.value)body.classList.remove('now-searching');});
  window.nowSearch=function(e){
    e.preventDefault();
    var v=(document.getElementById('now-q').value||'').trim();
    if(v)toast('Search for "'+v.slice(0,40)+'" is coming soon');
    return false;
  };

  document.addEventListener('click',function(e){
    var b=e.target.closest('button,a');
    if(!b)return;
    if(b.hasAttribute('data-tab')){e.preventDefault();setTab(b.getAttribute('data-tab'));window.scrollTo({top:Math.min(window.scrollY,feed.offsetTop)});return;}
    if(b.hasAttribute('data-town')){e.preventDefault();setTown(b.getAttribute('data-town'));return;}
    if(b.classList.contains('np-like')){
      var n=parseInt(b.getAttribute('data-n'),10)||0;
      var on=!b.classList.contains('on');
      b.classList.toggle('on',on);
      b.querySelector('i').className=on?'fas fa-heart':'far fa-heart';
      b.querySelector('span').textContent=String(n+(on?1:0));
      return;
    }
    if(b.classList.contains('np-save')){
      var s=!b.classList.contains('on');
      b.classList.toggle('on',s);
      b.querySelector('i').className=s?'fas fa-bookmark':'far fa-bookmark';
      toast(s?'Saved':'Removed from saved');
      if(body.getAttribute('data-tab')==='saved')apply();
      return;
    }
    if(b.classList.contains('np-follow')){
      var f=!b.classList.contains('on');
      b.classList.toggle('on',f);b.textContent=f?'Following':'Follow';
      return;
    }
    if(b.classList.contains('np-btn')){
      b.classList.toggle('on');b.textContent=b.classList.contains('on')?'Reminder set':'Remind me';
      return;
    }
    if(b.classList.contains('np-share')){
      var url=location.origin+'/now';
      if(navigator.share){navigator.share({title:'Watchdog NOW',url:url}).catch(function(){});}
      else if(navigator.clipboard){navigator.clipboard.writeText(url).then(function(){toast('Link copied');},function(){});}
      return;
    }
    if(b.getAttribute('href')==='#'){e.preventDefault();}
  });

  apply();
})();
