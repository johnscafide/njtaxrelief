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
  if (w.__watchdogEasterEggs) return;
  w.__watchdogEasterEggs = true;
  try { if (w.top !== w.self) return; } catch (_) { return; }

  var CSS_HREF = '/property/css/watchdog-easter-eggs.css?v=20261005a';
  var PARTIAL_URL = '/property/partials/watchdog-easter-eggs.html?v=20261005a';
  var BEAGLE = [
    '                               ___',
    '                            .-\'   \'-.',
    '                           /   o     \'-.___',
    '          _               |               @)',
    '         ( )             /|\\    .-----.___.\'',
    '          \\ \\___________/ | \\   |',
    '           \\              |  \'--\'',
    '            |                /',
    '            |  .--------.   |',
    '            |  |        |   |',
    '            |__|        |___|'
  ].join('\n');

  function reducedMotion() {
    return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function store(kind) {
    try { return w[kind]; } catch (_) { return null; }
  }
  function read(kind, key) {
    var s = store(kind);
    try { return s ? s.getItem(key) : null; } catch (_) { return null; }
  }
  function write(kind, key, value) {
    var s = store(kind);
    try { if (s) { if (value === null) s.removeItem(key); else s.setItem(key, value); } } catch (_) {}
  }

  var cssLoaded = false;
  function loadCss() {
    if (cssLoaded || d.querySelector('link[data-watchdog-easter-eggs]')) { cssLoaded = true; return; }
    cssLoaded = true;
    var link = d.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    link.setAttribute('data-watchdog-easter-eggs', '1');
    (d.head || d.documentElement).appendChild(link);
  }

  var partial = null;
  function parts() {
    if (!partial) {
      partial = w.fetch(PARTIAL_URL, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('partial'); return r.text(); })
        .then(function (text) { return new DOMParser().parseFromString(text, 'text/html'); })
        .catch(function (error) { partial = null; throw error; });
    }
    return partial;
  }
  function part(doc, id) {
    var tpl = doc.getElementById(id);
    return tpl ? d.importNode(tpl.content, true) : null;
  }

  function greet() {
    if (!w.console || typeof w.console.log !== 'function') return;
    var mono = 'font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.25;color:#8a531f';
    var big = 'font:800 20px/1.3 "Plus Jakarta Sans",Inter,system-ui,sans-serif;color:#16140f';
    var body = 'font:500 13px/1.6 Inter,system-ui,sans-serif;color:#4a463d';
    var tip = 'font:600 13px/1.6 Inter,system-ui,sans-serif;color:#0b6e6e';
    console.log('%c' + BEAGLE, mono);
    console.log('%cWoof. You found the back room.', big);
    console.log('%cWatchdog was built by John, in New Jersey. Curious people are our favorite people.', body);
    console.log('%cInsert Disk 2 of 3 to continue...  type  watchdog.disk2()', tip);
    console.log('%cPsst. There is a trail of treats hidden in this site. Clue 1 of 3: stylesheets can keep secrets too. Check the :root of this page.', body);
  }

  var api = w.watchdog && typeof w.watchdog === 'object' ? w.watchdog : {};
  api.disk2 = function () {
    console.log('%cReading Disk 2 of 3...', 'font:600 13px/1.6 Menlo,Consolas,monospace;color:#0b6e6e');
    parts().then(function (doc) {
      var story = part(doc, 'wd-egg-story');
      console.log('%c' + (story ? story.textContent.trim() : ''), 'font:500 13px/1.6 Inter,system-ui,sans-serif;color:#16140f');
      console.log('%cInsert Disk 3 of 3 to finish setup...  type  watchdog.disk3()', 'font:600 13px/1.6 Menlo,Consolas,monospace;color:#0b6e6e');
    }, function () {
      console.log('%cDisk 2 of 3 could not be read. Try again in a moment.', 'font:600 13px/1.6 Menlo,Consolas,monospace;color:#8a531f');
    });
    return 'Reading Disk 2 of 3...';
  };
  api.disk3 = function () {
    console.log('%cSetup complete. Watchdog Property Info has been installed.\nIf it helped you, the least you can do is share it. Press any key to continue.', 'font:600 13px/1.6 Menlo,Consolas,monospace;color:#0b6e6e');
    return 'Disk 3 of 3 OK';
  };
  api.konami = function () { chase(); return 'Fetch!'; };
  api.geocities = function () { setRetro(!d.documentElement.classList.contains('wd-1999')); return 'Welcome to 1999'; };
  try { w.watchdog = api; } catch (_) {}

  var chasing = false;
  function chase() {
    if (chasing || !d.body) return;
    chasing = true;
    loadCss();
    parts().then(function (doc) {
      var frag = part(doc, 'wd-egg-chase');
      var stage = frag && frag.querySelector('.wd-egg-chase');
      if (!stage || !d.body) { chasing = false; return; }
      play(stage);
    }, function () { chasing = false; });
  }

  function play(stage) {
    d.body.appendChild(stage);
    var dog = stage.querySelector('.wd-egg-dog');
    var treat = stage.querySelector('.wd-egg-treat');
    var bubble = stage.querySelector('.wd-egg-bubble');

    function done() {
      stage.classList.add('is-leaving');
      w.setTimeout(function () { if (stage.parentNode) stage.parentNode.removeChild(stage); chasing = false; }, 400);
    }

    if (reducedMotion()) {
      stage.classList.add('is-still');
      dog.setAttribute('data-frame', 'front');
      bubble.classList.add('is-on');
      w.setTimeout(done, 2400);
      return;
    }

    var vw = w.innerWidth || 1024;
    var F = dog.offsetWidth || 220;
    var MOUTH_X = 345 / 600, MOUTH_UP = 250 / 600, PAW = 470 / 600;
    var SIDE_MOUTH_X = 0.77, SIDE_MOUTH_UP = 0.39;
    var landX = Math.round(vw * 0.64);
    var tossFrom = Math.round(vw * 0.06);
    var target = landX - (PAW + 0.07) * F;
    var leapAt = target - Math.min(0.72 * F, 0.24 * vw);
    var runSpeed = Math.max(480, vw * 0.7);
    var x = -F, y = 0, treatX = tossFrom, treatUp = F * 0.5, tilt = 0;
    var landed = false, state = 'run', stateAt = 0, clock = 0, last = 0, from = 0;

    function frame(name) { if (dog.getAttribute('data-frame') !== name) dog.setAttribute('data-frame', name); }
    function paint() {
      dog.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (-y).toFixed(1) + 'px,0)';
      treat.style.transform = 'translate3d(' + treatX.toFixed(1) + 'px,' + (-treatUp).toFixed(1) + 'px,0) translateX(-50%) rotate(' + tilt.toFixed(1) + 'deg)';
    }
    function set(next, t) { state = next; stateAt = t; }
    function gallop(dt) {
      clock += dt;
      var up = Math.floor(clock / 110) % 2;
      frame(up ? 'b' : 'leap');
      y = up ? 0 : 0.04 * F;
    }

    function tick(t) {
      if (!last) { last = t; stateAt = t; tick.start = t; }
      var dt = Math.min(48, t - last);
      last = t;
      var since = t - stateAt;

      if (!landed) {
        var p = Math.min(1, (t - tick.start) / 950);
        treatX = tossFrom + (landX - tossFrom) * p;
        treatUp = Math.max(0, Math.sin(Math.PI * p) * Math.min(260, vw * 0.16) + (1 - p) * F * 0.5);
        tilt = 720 * p;
        if (p >= 1) { landed = true; treatX = landX; treatUp = 0; tilt = 0; }
      }

      if (state === 'run') {
        gallop(dt);
        x = Math.min(leapAt, x + runSpeed * dt / 1000);
        if (x >= leapAt) {
          if (landed) { from = x; set('leap', t); }
          else { y = 0; frame('front'); clock = 0; }
        }
      } else if (state === 'leap') {
        frame('leap');
        var q = Math.min(1, since / 380);
        var ease = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
        x = from + (target - from) * ease;
        y = Math.sin(Math.PI * q) * 0.14 * F;
        if (q >= 1) { x = target; y = 0; frame('front'); set('grab', t); }
      } else if (state === 'grab') {
        var g = Math.min(1, since / 200), ge = 1 - Math.pow(1 - g, 3);
        treatX = landX + (x + MOUTH_X * F - landX) * ge;
        treatUp = (MOUTH_UP - 0.042) * F * ge;
        tilt = -7 * ge;
        if (g >= 1) {
          set('hold', t);
          bubble.style.left = Math.round(x + MOUTH_X * F) + 'px';
          bubble.style.bottom = Math.round(F * 0.62 + 24) + 'px';
          bubble.classList.add('is-on');
        }
      } else if (state === 'hold') {
        y = Math.sin(Math.min(1, since / 240) * Math.PI) * 0.02 * F;
        treatX = x + MOUTH_X * F;
        treatUp = (MOUTH_UP - 0.042) * F + y;
        if (since >= 1400) { bubble.classList.remove('is-on'); clock = 0; set('exit', t); }
      } else if (state === 'exit') {
        gallop(dt);
        x += runSpeed * 1.15 * dt / 1000;
        treatX = x + SIDE_MOUTH_X * F;
        treatUp = SIDE_MOUTH_UP * F + y;
        tilt = -4;
        if (x > vw + 0.2 * F) { paint(); done(); return; }
      }
      paint();
      w.requestAnimationFrame(tick);
    }
    paint();
    w.requestAnimationFrame(tick);
  }

  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  var konamiAt = 0;
  var typed = '';

  function typingInField(target) {
    if (!target) return false;
    var tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!target.isContentEditable;
  }

  function onKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (typingInField(event.target)) return;
    var key = String(event.key || '').toLowerCase();
    if (key === KONAMI[konamiAt]) {
      konamiAt += 1;
      if (konamiAt === KONAMI.length) { konamiAt = 0; chase(); }
    } else {
      konamiAt = key === KONAMI[0] ? 1 : 0;
    }
    if (key.length === 1 && /[a-z]/.test(key)) {
      typed = (typed + key).slice(-12);
      if (/geocities$/.test(typed)) { typed = ''; setRetro(!d.documentElement.classList.contains('wd-1999')); }
    }
  }

  var SWIPES = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'tap', 'tap'];
  var swipeAt = 0, touchStart = null;
  function onTouchStart(event) {
    if (!event.touches || event.touches.length !== 1) { touchStart = null; return; }
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now() };
  }
  function onTouchEnd(event) {
    if (!touchStart || !event.changedTouches || !event.changedTouches.length) return;
    var dx = event.changedTouches[0].clientX - touchStart.x;
    var dy = event.changedTouches[0].clientY - touchStart.y;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    var move = 'none';
    if (ax < 12 && ay < 12 && Date.now() - touchStart.t < 400) move = 'tap';
    else if (ay > 40 && ay > ax * 1.5) move = dy < 0 ? 'up' : 'down';
    else if (ax > 40 && ax > ay * 1.5) move = dx < 0 ? 'left' : 'right';
    touchStart = null;
    if (move === SWIPES[swipeAt]) {
      swipeAt += 1;
      if (swipeAt === SWIPES.length) { swipeAt = 0; chase(); }
    } else if (move !== 'none') {
      swipeAt = move === SWIPES[0] ? 1 : 0;
    }
  }

  var RETRO_KEY = 'watchdog:1999';
  var WEBRING = ['/', '/dashboard', '/insights', '/town-compare', '/fairness', '/data-center', '/robust', '/faq', '/co'];
  function setRetro(on) {
    var root = d.documentElement;
    var old = d.getElementById('wd-1999');
    if (!on) {
      root.classList.remove('wd-1999');
      if (old) old.parentNode.removeChild(old);
      write('sessionStorage', RETRO_KEY, null);
      return;
    }
    if (!d.body) return;
    loadCss();
    root.classList.add('wd-1999');
    write('sessionStorage', RETRO_KEY, '1');
    if (old) return;
    var visits = parseInt(read('localStorage', 'watchdog:1999-visits') || '0', 10) + 1;
    write('localStorage', 'watchdog:1999-visits', String(visits));
    var here = w.location.pathname.replace(/\/+$/, '') || '/';
    var i = WEBRING.indexOf(here);
    var prev = WEBRING[(i < 0 ? 0 : i - 1 + WEBRING.length) % WEBRING.length];
    var next = WEBRING[(i < 0 ? 1 : i + 1) % WEBRING.length];
    parts().then(function (doc) {
      if (d.getElementById('wd-1999') || !root.classList.contains('wd-1999')) return;
      var frag = part(doc, 'wd-egg-1999');
      var box = frag && frag.querySelector('#wd-1999');
      if (!box || !d.body) return;
      var digitBox = box.querySelector('.wd-1999-digits');
      ('000000' + visits).slice(-6).split('').forEach(function (n) {
        var b = d.createElement('b');
        b.textContent = n;
        digitBox.appendChild(b);
      });
      box.querySelector('.wd-1999-counter').setAttribute('aria-label', 'You have visited ' + visits + ' times in 1999 mode');
      box.querySelector('.wd-1999-prev').setAttribute('href', prev);
      box.querySelector('.wd-1999-next').setAttribute('href', next);
      d.body.appendChild(box);
      box.querySelector('.wd-1999-exit').addEventListener('click', function () { setRetro(false); });
    }, function () {});
  }

  var STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico'
  };
  var STATE_NAMES = {};
  Object.keys(STATES).forEach(function (code) { STATE_NAMES[STATES[code].toUpperCase()] = code; });
  STATE_NAMES['DISTRICT OF COLUMBIA'] = 'DC';

  function stateIn(text) {
    var t = text.trim();
    if (!t) return null;
    if (t.length === 2 && STATES[t]) return t;
    if (STATE_NAMES[t]) return STATE_NAMES[t];
    return null;
  }
  function stateAtEnd(text) {
    var words = text.trim().split(' ');
    for (var n = Math.min(3, words.length); n >= 1; n -= 1) {
      var code = stateIn(words.slice(-n).join(' '));
      if (code) return code;
    }
    return null;
  }

  function outOfState(value) {
    var s = String(value || '').toUpperCase().replace(/[^A-Z0-9,\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length < 6 || !/[A-Z]/.test(s)) return null;
    s = s.replace(/[ ,]*\b(USA|US|UNITED STATES)$/, '');
    var zipMatch = s.match(/[ ,](\d{5})(?:-\d{4})?$/);
    var zip = zipMatch ? zipMatch[1] : '';
    if (/^0[78]/.test(zip)) return null;
    if (zip) s = s.slice(0, zipMatch.index).replace(/[ ,]+$/, '');
    var segments = s.split(',').map(function (part) { return part.trim(); }).filter(Boolean);
    var code = null;
    if (zip) code = stateAtEnd(segments[segments.length - 1] || '');
    else if (segments.length >= 3) code = stateIn(segments[segments.length - 1]);
    if (code === 'NJ') return null;
    if (code) return { code: code, name: STATES[code] };
    if (zip && segments.length >= 2) return { code: 'ZIP', name: '' };
    return null;
  }

  function addressField(input) {
    if (!input || (input.tagName || '').toLowerCase() !== 'input') return false;
    var type = (input.getAttribute('type') || 'text').toLowerCase();
    if (type !== 'text' && type !== 'search') return false;
    var auto = (input.getAttribute('autocomplete') || '').toLowerCase();
    if (/street|address-line|shipping|billing|postal/.test(auto)) return false;
    var hint = [input.id, input.name, input.getAttribute('placeholder'), input.getAttribute('aria-label')].join(' ');
    if (type !== 'search' && !/addr|search|lookup|property|command|query/i.test(hint)) return false;
    var form = input.form;
    if (form && form.querySelectorAll('input[type="text"],input:not([type]),input[type="email"],input[type="tel"],textarea').length > 2) return false;
    return true;
  }

  var oosOpen = false, oosLast = '', oosLastAt = 0;
  function checkAddress(input) {
    if (!addressField(input) || oosOpen) return;
    var value = input.value;
    var hit = outOfState(value);
    if (!hit) return;
    var now = Date.now();
    if (value === oosLast && now - oosLastAt < 4000) return;
    oosLast = value;
    oosLastAt = now;
    showOutOfState(hit, input);
  }

  function showOutOfState(hit, input) {
    if (!d.body) return;
    oosOpen = true;
    loadCss();
    parts().then(function (doc) {
      var frag = part(doc, 'wd-egg-oos');
      var lines = part(doc, 'wd-egg-oos-lines');
      var box = frag && frag.querySelector('#wd-oos');
      if (!box || !lines || !d.body) { oosOpen = false; return; }
      var line = lines.querySelector('[data-state="' + hit.code + '"]') || lines.querySelector('[data-state="*"]');
      var label = hit.code === 'ZIP' ? 'Not NJ?' : (hit.code === 'DC' ? 'DC?' : hit.name + '?');
      box.querySelector('.wd-oos-stamp').textContent = label;
      box.querySelector('.wd-oos-title').textContent = line.getAttribute('data-head').replace('{state}', hit.name);
      box.querySelector('.wd-oos-body').textContent = line.textContent.trim();
      openOutOfState(box, lines, input);
    }, function () { oosOpen = false; });
  }

  function openOutOfState(box, lines, input) {
    var back = d.activeElement;
    var quiz = box.querySelector('.wd-oos-quiz');
    var quizTimer = 0;
    function buttons() { return Array.prototype.slice.call(box.querySelectorAll('button')).filter(function (b) { return b.offsetParent !== null; }); }
    function close(retry) {
      w.clearTimeout(quizTimer);
      d.removeEventListener('keydown', onBoxKey, true);
      box.classList.remove('is-on');
      w.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); oosOpen = false; }, reducedMotion() ? 0 : 200);
      if (retry && input) { input.value = ''; try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {} input.focus(); }
      else if (back && typeof back.focus === 'function') { try { back.focus(); } catch (_) {} }
    }
    function onBoxKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); return; }
      if (event.key === 'Tab') {
        var list = buttons();
        if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (event.shiftKey && d.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && d.activeElement === last) { event.preventDefault(); first.focus(); }
        else if (list.indexOf(d.activeElement) < 0) { event.preventDefault(); first.focus(); }
      }
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    }
    box.addEventListener('click', function (event) {
      if (event.target === box) { close(false); return; }
      var action = event.target.closest('[data-oos]');
      if (action) { close(action.getAttribute('data-oos') === 'retry'); return; }
      var answer = event.target.closest('[data-oos-answer]');
      if (answer) {
        var key = answer.getAttribute('data-oos-answer');
        var reply = lines.querySelector('[data-answer="' + key + '"]');
        box.querySelectorAll('[data-oos-answer]').forEach(function (b) { b.setAttribute('aria-pressed', b === answer ? 'true' : 'false'); });
        box.querySelector('.wd-oos-answer').textContent = reply ? reply.textContent.trim() : '';
      }
    });
    d.body.appendChild(box);
    d.addEventListener('keydown', onBoxKey, true);
    w.requestAnimationFrame(function () { box.classList.add('is-on'); });
    var primary = box.querySelector('[data-oos="close"]');
    if (primary) primary.focus();
    quizTimer = w.setTimeout(function () { quiz.hidden = false; }, 2500);
  }

  function onAddressKey(event) {
    if (event.key === 'Enter' && !event.isComposing) checkAddress(event.target);
  }
  function onAddressSubmit(event) {
    var form = event.target;
    if (!form || !form.querySelectorAll) return;
    Array.prototype.forEach.call(form.querySelectorAll('input'), checkAddress);
  }
  function onAddressClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('button,[type="submit"],[role="button"]') : null;
    if (!button || button.closest('#wd-oos')) return;
    var scope = button.closest('form,[role="search"],.ssearch,.wdh-search,[class*="search"]');
    if (!scope) return;
    var inputs = scope.querySelectorAll('input');
    if (inputs.length > 3) return;
    Array.prototype.forEach.call(inputs, checkAddress);
  }

  function start() {
    greet();
    d.addEventListener('keydown', onKey, true);
    d.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    d.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    d.addEventListener('keydown', onAddressKey, true);
    d.addEventListener('submit', onAddressSubmit, true);
    d.addEventListener('click', onAddressClick, true);
    if (read('sessionStorage', RETRO_KEY) === '1') setRetro(true);
    var idle = w.requestIdleCallback || function (fn) { return w.setTimeout(fn, 1500); };
    idle(loadCss);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(window, document);
