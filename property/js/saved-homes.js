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
(function () {
  'use strict';
  var client = window.__njwSB || (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.createClient && window.NJPTRSupabaseRuntime.createClient());
  if (client && !window.__njwSB) window.__njwSB = client;
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function title(s) {
    return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }
  function link(row) {
    if (row.page_path && /^\/nj\/[a-z0-9-]+\/[a-z0-9-]+$/.test(row.page_path)) return row.page_path;
    return '/nj/property/' + encodeURIComponent(row.pams_pin);
  }
  function show(id) {
    ['sh-status', 'sh-list', 'sh-empty', 'sh-gate'].forEach(function (x) { $(x).hidden = x !== id; });
  }
  function openSignIn() {
    var next = location.pathname + location.search;
    if (window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function') return window.WatchdogAuth.openSignIn(next);
    if (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.openOnboarding) return window.NJPTRSupabaseRuntime.openOnboarding(next);
    location.href = '/onboarding?next=' + encodeURIComponent(next);
  }
  function render(rows) {
    if (!rows.length) { show('sh-empty'); return; }
    $('sh-list').innerHTML = rows.map(function (row) {
      var when = new Date(row.created_at);
      var saved = isNaN(when) ? '' : when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      var place = [title(row.town), row.zip].filter(Boolean).join(', ');
      return '<li data-pin="' + esc(row.pams_pin) + '">' +
        '<a class="sh-home" href="' + esc(link(row)) + '"><i class="fas fa-house" aria-hidden="true"></i><span><b>' + esc(title(row.address) || row.pams_pin) + '</b>' +
        '<small>' + esc(place) + (saved ? ' · Saved ' + esc(saved) : '') + '</small></span></a>' +
        '<button type="button" class="sh-remove" aria-label="Remove ' + esc(title(row.address) || 'this home') + ' from saved homes"><i class="fas fa-heart" aria-hidden="true"></i></button>' +
      '</li>';
    }).join('');
    show('sh-list');
  }
  function load() {
    client.from('hearted_properties').select('pams_pin,address,town,zip,page_path,created_at').order('created_at', { ascending: false }).limit(500).then(function (res) {
      if (res.error) { $('sh-status').textContent = 'Could not load your saved homes. Try again in a minute.'; show('sh-status'); return; }
      render(res.data || []);
    });
  }
  $('sh-list').addEventListener('click', function (e) {
    var btn = e.target.closest('.sh-remove');
    if (!btn) return;
    var li = btn.closest('li'), pin = li.getAttribute('data-pin');
    btn.disabled = true;
    client.from('hearted_properties').delete().eq('pams_pin', pin).then(function (res) {
      if (res.error) { btn.disabled = false; return; }
      li.parentNode.removeChild(li);
      if (!$('sh-list').children.length) show('sh-empty');
    });
  });
  $('sh-signin').addEventListener('click', openSignIn);
  if (!client) { $('sh-status').textContent = 'Saved homes are not available right now.'; return; }
  client.auth.getSession().then(function (res) {
    var user = res && res.data && res.data.session && res.data.session.user;
    if (!user) { show('sh-gate'); return; }
    load();
  });
  client.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_IN' && session) load();
    if (event === 'SIGNED_OUT') show('sh-gate');
  });
})();
