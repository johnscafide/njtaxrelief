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
(function (w, d) {
  'use strict';
  if (w.__WD_HOME_BOARD__) return;
  w.__WD_HOME_BOARD__ = true;

  var GROUPS = [
    { id: 'appeal', label: 'Appeal & fairness', icon: 'fa-scale-balanced', sub: 'Is this assessment in line with the market and with the rest of town?', keys: ['fair', 'kept', 'file', 'reval'] },
    { id: 'taxes', label: 'Taxes & town', icon: 'fa-receipt', sub: 'What you pay, where it is heading, and how the town is doing.', keys: ['town', 'trend', 'history', 'statewide'] },
    { id: 'owed', label: 'Money you may be owed', icon: 'fa-hand-holding-dollar', sub: 'Relief programs this property may qualify for.', keys: ['owed'] },
    { id: 'market', label: 'Buying & market', icon: 'fa-house-circle-check', sub: 'Costs to buy, land use, and how this place compares.', keys: ['buy', 'compare', 'farmland'] },
    { id: 'pro', label: 'For professionals', icon: 'fa-briefcase', sub: 'Due diligence and professional intelligence.', keys: ['diligence', 'broker', 'decision'] }
  ];
  var CARD_TONES = ['score', 'changes', 'status', 'value'];
  var DECO = {
    score: '<svg class="hb-deco hb-deco--shield" viewBox="0 0 100 116" aria-hidden="true" focusable="false"><path d="M50 2 94 18v34c0 30-19 52-44 62C25 104 6 82 6 52V18Z" stroke="none"/><path d="m30 58 14 14 28-30" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    changes: '<svg class="hb-deco hb-deco--house" viewBox="0 0 100 92" aria-hidden="true" focusable="false"><path d="M50 4 96 42h-12v46H62V62H38v26H16V42H4Z"/></svg>',
    status: '<svg class="hb-deco hb-deco--magnifier" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="42" cy="42" r="28" stroke-width="14"/><path d="m64 64 26 26" stroke-width="16" stroke-linecap="round"/></svg>',
    value: '<svg class="hb-deco hb-deco--pin" viewBox="0 0 80 100" aria-hidden="true" focusable="false"><path d="M40 2C19 2 4 17 4 37c0 26 36 61 36 61s36-35 36-61C76 17 61 2 40 2Z"/><circle cx="40" cy="37" r="13"/></svg>'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sourceName(m) {
    var s = String(m && m.source_id || '');
    if (s === 'nj-parcels-modiv') return 'NJ parcel / MOD-IV public record';
    if (s === 'nj-sr1a') return 'NJ Division of Taxation verified sales';
    if (s === 'nj-cod') return 'NJ assessment-uniformity data';
    if (s === 'nj-dca-budget') return 'NJ DCA municipal budget and levy data';
    if (s === 'nj-tax-court-appeals') return 'NJ property-tax appeal outcome data';
    if (s.indexOf('njdep-') === 0) return 'NJDEP public GIS record';
    return m && m.origin === 'watchdog-derived' ? 'Watchdog methodology' : 'Public record';
  }
  function sourceFor(markerId) {
    var mc = w.WatchdogMarkerContent, reg = mc && typeof mc.registry === 'function' ? mc.registry() : null;
    var m = reg && Array.isArray(reg.markers) ? reg.markers.filter(function (x) { return x.id === markerId; })[0] : null;
    if (m) return sourceName(m);
    if (/^watchdog\./.test(markerId)) return 'Watchdog methodology';
    if (/^uniformity\./.test(markerId)) return 'NJ assessment-uniformity data';
    if (/^sales\./.test(markerId)) return 'NJ Division of Taxation verified sales';
    return 'Public record';
  }

  function arrangeCards(wrap) {
    var cards = wrap.querySelector(':scope > .sc-cards');
    if (!cards) return null;
    if (!cards.classList.contains('hb-cards')) {
      cards.classList.add('hb-cards');
      Array.prototype.forEach.call(cards.querySelectorAll(':scope > .sc-c'), function (card, i) {
        var tone = CARD_TONES[i % CARD_TONES.length];
        card.classList.add('hb-card', 'hb-card--' + tone);
        card.insertAdjacentHTML('afterbegin', DECO[tone]);
        var link = card.querySelector(':scope > .sc-data');
        if (link) {
          var foot = d.createElement('div');
          foot.className = 'hb-foot';
          foot.innerHTML = '<span class="hb-src"></span>';
          card.insertBefore(foot, link);
          foot.appendChild(link);
          link.classList.add('hb-why');
          link.innerHTML = '<i class="fas fa-circle-question" aria-hidden="true"></i><span>Why this?</span>';
          link.setAttribute('aria-label', 'Why this number? Source and method for ' + ((card.querySelector('.sc-l') || {}).textContent || 'this figure'));
        }
      });
    }
    Array.prototype.forEach.call(cards.querySelectorAll('.hb-card'), function (card) {
      var src = card.querySelector('.hb-src'), text = 'Source: ' + sourceFor(card.getAttribute('data-marker-id') || '');
      if (src && src.textContent !== text) src.textContent = text;
    });
    if (wrap.firstElementChild !== cards) wrap.insertBefore(cards, wrap.firstElementChild);
    return cards;
  }

  function arrangeFigures(wrap, after) {
    var figs = wrap.querySelector(':scope > .hm-figs');
    if (!figs) return after;
    figs.classList.add('hb-figs');
    var want = after ? after.nextElementSibling : wrap.firstElementChild;
    if (want !== figs) {
      if (after) after.insertAdjacentElement('afterend', figs);
      else wrap.insertBefore(figs, wrap.firstElementChild);
    }
    return figs;
  }

  function arrangeGroups(wrap) {
    var explore = wrap.querySelector(':scope > .hm-explore-card');
    if (!explore || explore.getAttribute('data-hb-grouped') === '1') return explore;
    var bar = explore.querySelector(':scope > .hm-secbar');
    var anchor = bar || null, used = {};
    GROUPS.concat([{ id: 'more', label: 'More analysis', icon: 'fa-layer-group', sub: '', keys: null }]).forEach(function (g) {
      var list = [];
      if (g.keys) g.keys.forEach(function (k) { var s = d.getElementById('sec-' + k); if (s && s.parentNode === explore) { list.push(s); used[k] = 1; } });
      else Array.prototype.forEach.call(explore.querySelectorAll(':scope > section.sec2'), function (s) { list.push(s); });
      if (!list.length) return;
      var box = d.createElement('div');
      box.className = 'hb-group';
      box.id = 'hb-group-' + g.id;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-labelledby', 'hb-group-title-' + g.id);
      box.innerHTML = '<div class="hb-group-head"><span class="hb-group-icon" aria-hidden="true"><i class="fas ' + g.icon + '"></i></span><div><h3 id="hb-group-title-' + g.id + '">' + esc(g.label) + '</h3>' + (g.sub ? '<p>' + esc(g.sub) + '</p>' : '') + '</div></div>';
      list.forEach(function (s) { box.appendChild(s); });
      if (anchor) anchor.insertAdjacentElement('afterend', box); else explore.insertBefore(box, explore.firstElementChild);
      anchor = box;
    });
    explore.setAttribute('data-hb-grouped', '1');
    return explore;
  }

  function navItems(wrap) {
    var items = [];
    var intel = wrap.querySelector('#wd-home-voice-entry') || wrap.querySelector(':scope > .ai');
    if (intel) items.push({ target: intel, label: 'Watchdog Intelligence', icon: 'fa-wand-magic-sparkles' });
    var tax = d.getElementById('hm-current-tax-evidence');
    if (tax) items.push({ target: tax, label: 'Tax evidence', icon: 'fa-file-invoice-dollar' });
    GROUPS.forEach(function (g) { var box = d.getElementById('hb-group-' + g.id); if (box) items.push({ target: box, label: g.label, icon: g.icon }); });
    var graph = d.getElementById('wd-property-data-graph');
    if (graph) items.push({ target: graph, label: 'Evidence graph', icon: 'fa-diagram-project' });
    return items;
  }

  function arrangeNav(wrap, after) {
    var nav = wrap.querySelector(':scope > .hb-nav');
    var items = navItems(wrap);
    var key = items.map(function (x) { return x.label; }).join('|');
    if (!nav) {
      nav = d.createElement('nav');
      nav.className = 'hb-nav';
      nav.setAttribute('aria-label', 'Property Home sections');
    }
    if (nav.getAttribute('data-key') !== key) {
      nav.setAttribute('data-key', key);
      nav.innerHTML = items.map(function (x, i) {
        return '<button type="button" data-hb-jump="' + i + '"><i class="fas ' + x.icon + '" aria-hidden="true"></i>' + esc(x.label) + '</button>';
      }).join('');
      nav.__hbTargets = items.map(function (x) { return x.target; });
    } else {
      nav.__hbTargets = items.map(function (x) { return x.target; });
    }
    var want = after ? after.nextElementSibling : wrap.firstElementChild;
    if (want !== nav) {
      if (after) after.insertAdjacentElement('afterend', nav);
      else wrap.insertBefore(nav, wrap.firstElementChild);
    }
    return nav;
  }

  var busy = false;
  function apply() {
    if (busy) return;
    var wrap = d.querySelector('#hm-body .hm-wrap');
    if (!wrap) return;
    busy = true;
    try {
      d.body.classList.add('hb-board');
      var cards = arrangeCards(wrap);
      var figs = arrangeFigures(wrap, cards);
      arrangeGroups(wrap);
      arrangeNav(wrap, figs || cards);
    } catch (error) {
      console.warn('Watchdog Home board layout skipped:', error);
    }
    busy = false;
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (w.requestAnimationFrame || w.setTimeout)(function () { queued = false; apply(); });
  }

  d.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('[data-hb-jump]') : null;
    if (!btn) return;
    var nav = btn.closest('.hb-nav'), target = nav && nav.__hbTargets && nav.__hbTargets[Number(btn.getAttribute('data-hb-jump'))];
    if (!target || !target.isConnected) return;
    Array.prototype.forEach.call(nav.querySelectorAll('[data-hb-jump]'), function (b) { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-current', b === btn ? 'true' : 'false'); });
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    var heading = target.querySelector('h2,h3,button');
    if (heading && typeof heading.focus === 'function') {
      if (!heading.hasAttribute('tabindex') && !/^(BUTTON|A)$/.test(heading.tagName)) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  });

  function boot() {
    var body = d.getElementById('hm-body');
    if (!body) return;
    if (w.MutationObserver) new MutationObserver(schedule).observe(body, { childList: true, subtree: true });
    schedule();
    [1500, 4000].forEach(function (ms) { w.setTimeout(schedule, ms); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);
