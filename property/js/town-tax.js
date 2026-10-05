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
  var data = {};
  try { data = JSON.parse(document.getElementById('tt-data').textContent); } catch (_) {}

  function measure(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (_) {}
    try { if (typeof window.clarity === 'function') window.clarity('event', name); } catch (_) {}
  }
  function firstParty(action, status) {
    try { if (window.WatchdogAnalytics) window.WatchdogAnalytics.track('tool_open', { tool: 'tax_town', action: action, scope: data.code || data.county || '', source: data.kind || '', status: status || '' }); } catch (_) {}
  }
  function base() { return { page_kind: data.kind || '', town: data.town || '', county: data.county || '', town_code: data.code || '' }; }
  function withBase(extra) { var o = base(); Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function num(v) { var n = Number(String(v || '').replace(/[^0-9.]/g, '')); return n > 0 ? n : 0; }

  var toast = document.querySelector('.tt-toast');
  function say(t) {
    if (!toast) return;
    toast.textContent = t;
    clearTimeout(say.t);
    say.t = setTimeout(function () { toast.textContent = ''; }, 2500);
  }

  var row = document.querySelector('[data-share-row]');
  if (row) {
    var nat = row.querySelector('[data-share-native]');
    var copyBtn = row.querySelector('[data-share="copy"]');
    var link = copyBtn ? copyBtn.getAttribute('data-url') : location.href;
    if (nat && navigator.share) {
      nat.hidden = false;
      nat.addEventListener('click', function () {
        measure('tax_town_share', withBase({ method: 'native' })); firstParty('share', 'native');
        navigator.share({ title: document.title, url: link.replace('utm_medium=copy', 'utm_medium=native') }).catch(function () {});
      });
    }
    if (copyBtn) copyBtn.addEventListener('click', function () {
      measure('tax_town_share', withBase({ method: 'copy' })); firstParty('share', 'copy');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { say('Link copied'); }, function () { prompt('Copy this link', link); });
      else prompt('Copy this link', link);
    });
    [].forEach.call(row.querySelectorAll('a[data-share]'), function (a) {
      a.addEventListener('click', function () { var m = a.getAttribute('data-share'); measure('tax_town_share', withBase({ method: m })); firstParty('share', m); });
    });
  }

  var form = document.getElementById('tt-check-form');
  if (form) {
    var out = document.getElementById('tt-result');
    var mode = form.getAttribute('data-mode');
    var taxRate = Number(form.getAttribute('data-rate')) || 0;
    var pct = function (n) { return (n * 100).toFixed(1) + '%'; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var a = num(form.elements.assessed.value), v = num(form.elements.value.value);
      [form.elements.assessed, form.elements.value].forEach(function (el) { el.removeAttribute('aria-invalid'); });
      var missing = !a ? form.elements.assessed : !v ? form.elements.value : null;
      if (missing) {
        missing.setAttribute('aria-invalid', 'true');
        missing.focus();
        out.className = 'tt-result is-error';
        out.textContent = missing.getAttribute('data-missing');
        return;
      }
      var ratio = a / v, html, verdict;
      if (mode === 'reval') {
        if (ratio > 1) {
          verdict = 'high';
          html = '<b>Your assessment is ' + money(a - v) + ' more than your home\'s value.</b> You may have an appeal case. ' +
            (taxRate ? 'Bringing it down to ' + money(v) + ' would save about ' + money((a - v) * taxRate / 100) + ' a year at the current rate.' : '');
        } else {
          verdict = 'ok';
          html = '<b>Your assessment is at or below your home\'s value.</b> An appeal probably wouldn\'t lower it.';
        }
      } else {
        var avg = Number(form.getAttribute('data-average')) / 100, lo = Number(form.getAttribute('data-lower')) / 100, hi = Number(form.getAttribute('data-upper')) / 100;
        var implied = a / avg;
        if (ratio > hi) {
          verdict = 'high';
          var fixed = v * avg;
          html = '<b>Your assessment is ' + pct(ratio) + ' of your home\'s value, above the ' + pct(hi) + ' limit.</b> You may have an appeal case. A win would usually bring the assessment to about ' + money(fixed) +
            (taxRate ? ', saving about ' + money((a - fixed) * taxRate / 100) + ' a year at the current rate.' : '.');
        } else if (ratio < lo) {
          verdict = 'low';
          html = '<b>Your assessment is ' + pct(ratio) + ' of your home\'s value, below the town\'s range.</b> That\'s good for you. An appeal could actually raise it, so don\'t file one.';
        } else {
          verdict = 'ok';
          html = '<b>Your assessment is ' + pct(ratio) + ' of your home\'s value, inside the allowed range (' + pct(lo) + ' to ' + pct(hi) + ').</b> An appeal on value alone probably wouldn\'t change it.';
        }
        html += ' <span class="tt-sub">The town\'s average ratio puts your home at about ' + money(implied) + '.</span>';
      }
      out.className = 'tt-result is-' + verdict;
      out.innerHTML = html;
      measure('tax_town_check', withBase({ result: verdict })); firstParty('check', verdict);
    });
  }

  var table = document.querySelector('[data-sortable]');
  if (table) {
    var body = table.tBodies[0];
    var rows = [].slice.call(body.rows);
    var filter = document.querySelector('[data-filter]');
    if (filter) filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase();
      rows.forEach(function (r) { r.hidden = q && r.getAttribute('data-name').indexOf(q) === -1; });
    });
    var current = 'name', dir = 1;
    [].forEach.call(table.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        dir = key === current ? -dir : (key === 'name' ? 1 : -1);
        current = key;
        rows.sort(function (x, y) {
          if (key === 'name') return dir * x.getAttribute('data-name').localeCompare(y.getAttribute('data-name'));
          return dir * ((Number(x.getAttribute('data-' + key)) || 0) - (Number(y.getAttribute('data-' + key)) || 0));
        });
        rows.forEach(function (r) { body.appendChild(r); });
        [].forEach.call(table.querySelectorAll('th'), function (th) { th.removeAttribute('aria-sort'); });
        b.parentNode.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
      });
    });
  }

  measure('tax_town_view', base());
})();
