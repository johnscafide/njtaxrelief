(function () {
  'use strict';

  var pagePath = (window.location.pathname || '').replace(/\/+$/, '');
  if (pagePath !== '/property' && pagePath !== '/property/index.html') return;

  var attempts = 0;
  function boot() {
    var main = document.getElementById('wd-showcase');
    if (!main) {
      attempts += 1;
      if (attempts < 80) window.setTimeout(boot, 75);
      return;
    }
    if (main.getAttribute('data-wd-polish') === '1') return;
    main.setAttribute('data-wd-polish', '1');

    injectStyles();
    injectProfessionalWow(main);
    injectCompetitorCompare(main);
    installStorySync(main);
    installReveal(main);
  }

  function injectStyles() {
    if (document.getElementById('wd-landing-polish-css')) return;
    var style = document.createElement('style');
    style.id = 'wd-landing-polish-css';
    style.textContent = `
      /* NJW-189 landing polish */
      #wd-showcase{
        overflow-x:clip!important;
        overflow-y:visible!important;
      }
      #wd-showcase .wds-platform-strip{
        margin-top:34px;
      }
      #wd-showcase .wds-story-section{
        overflow:visible;
      }
      #wd-showcase .wds-story-grid{
        align-items:stretch!important;
      }
      #wd-showcase .wds-stage-column{
        align-self:stretch!important;
        height:auto!important;
      }
      #wd-showcase .wds-stage-sticky{
        position:sticky!important;
        top:86px;
      }

      .wds-wow-section{
        padding-top:128px;
        padding-bottom:112px;
      }
      .wds-wow-head{
        display:grid;
        grid-template-columns:minmax(0,1.05fr) minmax(300px,.55fr);
        gap:70px;
        align-items:end;
        margin-bottom:48px;
      }
      .wds-wow-head h2,
      .wds-rivals-head h2{
        margin:0;
        font:500 clamp(48px,5vw,76px)/.97 "Plus Jakarta Sans",sans-serif;
        letter-spacing:-.062em;
      }
      .wds-wow-head h2 em,
      .wds-rivals-head h2 em{
        font-family:"Playfair Display",serif;
        font-weight:400;
        font-style:italic;
        letter-spacing:-.035em;
      }
      .wds-wow-head p{
        margin:0;
        color:#6f7580;
        font-size:18px;
        line-height:1.55;
        max-width:500px;
      }
      .wds-wow-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:18px;
      }
      .wds-wow-card{
        position:relative;
        min-height:365px;
        overflow:hidden;
        border-radius:28px;
        background:#fff;
        box-shadow:0 14px 44px rgba(24,31,42,.06);
        padding:34px;
        display:flex;
        flex-direction:column;
        text-decoration:none!important;
        transition:transform .28s ease,box-shadow .28s ease;
      }
      .wds-wow-card:hover{
        transform:translateY(-4px);
        box-shadow:0 22px 60px rgba(24,31,42,.11);
      }
      .wds-wow-card:nth-child(2){background:linear-gradient(145deg,#fff,#f5f1ff)}
      .wds-wow-card:nth-child(3){background:linear-gradient(145deg,#fff,#eef6fb)}
      .wds-wow-card:nth-child(4){background:linear-gradient(145deg,#fff,#f3f7ef)}
      .wds-wow-role{
        display:flex;
        align-items:center;
        gap:10px;
        color:#66717e;
        font:800 10px/1 "Plus Jakarta Sans",sans-serif;
        letter-spacing:.09em;
        text-transform:uppercase;
      }
      .wds-wow-role i{
        width:34px;
        height:34px;
        border-radius:11px;
        background:#e7f4f2;
        color:#078486;
        display:grid;
        place-items:center;
        font-size:12px;
      }
      .wds-wow-card h3{
        margin:30px 0 0;
        max-width:610px;
        font:700 clamp(28px,2.6vw,43px)/1.02 "Plus Jakarta Sans",sans-serif;
        letter-spacing:-.052em;
        color:#101318;
      }
      .wds-wow-card p{
        margin:17px 0 0;
        max-width:600px;
        color:#69727e;
        font-size:15px;
        line-height:1.53;
      }
      .wds-wow-foot{
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:18px;
        margin-top:auto;
        padding-top:30px;
      }
      .wds-wow-name{
        color:#10294b;
        font:800 13px/1 "Plus Jakarta Sans",sans-serif;
      }
      .wds-wow-go{
        width:42px;
        height:42px;
        border-radius:50%;
        display:grid;
        place-items:center;
        background:#10294b;
        color:#fff;
        font-size:12px;
        transition:transform .2s ease;
      }
      .wds-wow-card:hover .wds-wow-go{transform:translateX(4px)}
      .wds-wow-visual{
        position:absolute;
        right:-16px;
        bottom:-22px;
        width:220px;
        height:145px;
        opacity:.92;
        pointer-events:none;
      }
      .wds-wow-queue{
        display:grid;
        gap:7px;
        transform:rotate(-5deg);
      }
      .wds-wow-queue span{
        display:flex;
        align-items:center;
        gap:8px;
        width:190px;
        padding:10px 12px;
        border-radius:11px;
        background:#f7fbfb;
        border:1px solid #dceae8;
        box-shadow:0 8px 20px rgba(25,47,54,.07);
        color:#4f5c68;
        font:800 8px/1 "Plus Jakarta Sans",sans-serif;
      }
      .wds-wow-queue span:before{
        content:"";
        width:7px;height:7px;border-radius:50%;background:#078486;
      }
      .wds-wow-evidence{
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:7px;
        transform:rotate(4deg);
      }
      .wds-wow-evidence span{
        height:105px;
        border-radius:12px;
        background:linear-gradient(180deg,#fff,#ece8f6);
        border:1px solid #ddd7ee;
        box-shadow:0 8px 20px rgba(46,40,78,.07);
        position:relative;
      }
      .wds-wow-evidence span:before,
      .wds-wow-evidence span:after{
        content:"";
        position:absolute;
        left:11px;right:11px;
        height:6px;border-radius:999px;background:#cfc7e6;
      }
      .wds-wow-evidence span:before{top:18px}
      .wds-wow-evidence span:after{top:33px;right:25px}
      .wds-wow-payment{
        padding:16px;
        border-radius:16px;
        background:#fff;
        border:1px solid #dae6ee;
        box-shadow:0 10px 24px rgba(24,53,70,.08);
        transform:rotate(-3deg);
      }
      .wds-wow-payment b{
        display:block;
        color:#10294b;
        font:800 23px/1 "Plus Jakarta Sans",sans-serif;
      }
      .wds-wow-payment small{
        display:block;margin-top:5px;color:#8694a0;font-size:8px;font-weight:800;
      }
      .wds-wow-payment i{
        display:block;height:7px;margin-top:13px;border-radius:999px;
        background:linear-gradient(90deg,#70cfc4 0 63%,#dce6eb 63%);
      }
      .wds-wow-cost{
        display:grid;
        grid-template-columns:repeat(4,1fr);
        gap:6px;
        align-items:end;
        height:126px;
        padding:12px;
        border-radius:16px;
        background:#fff;
        border:1px solid #dde7d9;
        box-shadow:0 10px 24px rgba(42,67,31,.07);
        transform:rotate(3deg);
      }
      .wds-wow-cost span{
        display:block;
        border-radius:8px 8px 3px 3px;
        background:linear-gradient(180deg,#9ad3a6,#4d8b5b);
      }
      .wds-wow-cost span:nth-child(1){height:38%}
      .wds-wow-cost span:nth-child(2){height:59%}
      .wds-wow-cost span:nth-child(3){height:78%}
      .wds-wow-cost span:nth-child(4){height:92%}

      .wds-rivals-section{
        padding-top:112px;
        padding-bottom:126px;
      }
      .wds-rivals-shell{
        padding:64px;
        border-radius:34px;
        background:#fff;
        box-shadow:0 16px 54px rgba(24,31,42,.06);
      }
      .wds-rivals-head{
        display:flex;
        align-items:flex-end;
        justify-content:space-between;
        gap:50px;
        margin-bottom:42px;
      }
      .wds-rivals-head>div{max-width:900px}
      .wds-rivals-head p{
        margin:18px 0 0;
        max-width:700px;
        color:#6f7580;
        font-size:17px;
        line-height:1.52;
      }
      .wds-rivals-all{
        flex:0 0 auto;
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:13px 16px;
        border-radius:999px;
        background:#10294b;
        color:#fff!important;
        font:800 11px/1 "Plus Jakarta Sans",sans-serif;
      }
      .wds-rivals-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
      .wds-rival-card{
        position:relative;
        min-height:220px;
        padding:24px;
        border-radius:20px;
        background:#f7f8f9;
        border:1px solid rgba(16,19,24,.06);
        display:flex;
        flex-direction:column;
        text-decoration:none!important;
        transition:transform .22s ease,background .22s ease,box-shadow .22s ease;
      }
      .wds-rival-card:hover{
        transform:translateY(-3px);
        background:#fff;
        box-shadow:0 15px 32px rgba(24,31,42,.08);
      }
      .wds-rival-versus{
        display:flex;
        align-items:center;
        gap:8px;
      }
      .wds-rival-versus span{
        display:inline-flex;
        align-items:center;
        min-height:30px;
        padding:0 10px;
        border-radius:999px;
        background:#10294b;
        color:#fff;
        font:800 8px/1 "Plus Jakarta Sans",sans-serif;
        letter-spacing:.04em;
        text-transform:uppercase;
      }
      .wds-rival-versus span:last-child{
        background:#fff;
        color:#535d69;
        border:1px solid #dfe4e8;
      }
      .wds-rival-versus i{color:#a5adb5;font-size:8px}
      .wds-rival-card h3{
        margin:20px 0 0;
        font:800 21px/1.08 "Plus Jakarta Sans",sans-serif;
        letter-spacing:-.035em;
        color:#17202b;
      }
      .wds-rival-card p{
        margin:10px 0 0;
        color:#737c86;
        font-size:13.5px;
        line-height:1.48;
      }
      .wds-rival-card>i{
        margin-top:auto;
        align-self:flex-end;
        color:#078486;
        font-size:11px;
      }
      .wds-rivals-note{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        margin:25px auto 0;
        color:#808892;
        font-size:11px;
        line-height:1.45;
        text-align:center;
      }
      .wds-rivals-note i{color:#078486}

      .wds-polish-reveal{
        opacity:0;
        transform:translateY(28px);
        transition:opacity .68s cubic-bezier(.2,.75,.25,1),transform .68s cubic-bezier(.2,.75,.25,1);
      }
      .wds-polish-reveal.is-visible{
        opacity:1;
        transform:none;
      }

      @media(max-width:900px){
        #wd-showcase{
          overflow:hidden!important;
        }
        #wd-showcase .wds-platform-strip{margin-top:26px}
        #wd-showcase .wds-story-grid{align-items:start!important}
        #wd-showcase .wds-stage-column{align-self:auto!important}
        #wd-showcase .wds-stage-sticky{position:relative!important;top:auto}
        .wds-wow-head{grid-template-columns:1fr;gap:22px}
        .wds-wow-grid{grid-template-columns:1fr}
        .wds-wow-card{min-height:325px}
        .wds-rivals-shell{padding:42px 28px}
        .wds-rivals-head{display:block}
        .wds-rivals-all{margin-top:22px}
        .wds-rivals-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:640px){
        #wd-showcase .wds-platform-strip{margin-top:22px}
        .wds-wow-section{padding-top:90px;padding-bottom:82px}
        .wds-wow-head h2,.wds-rivals-head h2{font-size:42px}
        .wds-wow-head p,.wds-rivals-head p{font-size:15px}
        .wds-wow-card{padding:25px;min-height:310px;border-radius:22px}
        .wds-wow-card h3{font-size:30px}
        .wds-wow-visual{width:180px;opacity:.6}
        .wds-rivals-section{padding-top:80px;padding-bottom:90px}
        .wds-rivals-shell{padding:30px 18px;border-radius:24px}
        .wds-rivals-grid{grid-template-columns:1fr}
        .wds-rival-card{min-height:190px}
      }
      @media(prefers-reduced-motion:reduce){
        .wds-polish-reveal,.wds-wow-card,.wds-rival-card{transition:none!important}
        .wds-polish-reveal{opacity:1!important;transform:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function injectProfessionalWow(main) {
    if (main.querySelector('.wds-wow-section')) return;
    var anchor = main.querySelector('.wds-compare-section');
    if (!anchor) return;

    var section = document.createElement('section');
    section.className = 'wds-section wds-wow-section';
    section.innerHTML = `
      <div class="wds-wrap">
        <div class="wds-wow-head wds-polish-reveal">
          <h2>The moment each professional says,<br><em>“I need this.”</em></h2>
          <p>Same New Jersey property intelligence. Four very different reasons it becomes part of the daily workflow.</p>
        </div>

        <div class="wds-wow-grid">
          <a class="wds-wow-card wds-polish-reveal" href="/property/agent-desk">
            <div class="wds-wow-role"><i class="fas fa-house-chimney-user"></i><span>Real estate agents</span></div>
            <h3>Know who in your sphere became worth calling today.</h3>
            <p>Opportunity Desk moves the right homeowners to the top when property and engagement signals change, and shows you why the contact deserves attention.</p>
            <div class="wds-wow-foot"><span class="wds-wow-name">Opportunity Desk</span><span class="wds-wow-go"><i class="fas fa-arrow-right"></i></span></div>
            <div class="wds-wow-visual wds-wow-queue" aria-hidden="true"><span>Property signal changed</span><span>Priority moved up</span><span>Follow-up ready</span></div>
          </a>

          <a class="wds-wow-card wds-polish-reveal" href="/property/pro">
            <div class="wds-wow-role"><i class="fas fa-scale-balanced"></i><span>Attorneys</span></div>
            <h3>Find the strongest appeal cases before intake starts.</h3>
            <p>Appeal Prospect Scanner turns a territory into a ranked evidence queue, so high-value, supportable cases surface before hours are spent sorting weak ones.</p>
            <div class="wds-wow-foot"><span class="wds-wow-name">Appeal Prospect Scanner</span><span class="wds-wow-go"><i class="fas fa-arrow-right"></i></span></div>
            <div class="wds-wow-visual wds-wow-evidence" aria-hidden="true"><span></span><span></span><span></span></div>
          </a>

          <a class="wds-wow-card wds-polish-reveal" href="/property/pro">
            <div class="wds-wow-role"><i class="fas fa-building-columns"></i><span>Mortgage &amp; financial</span></div>
            <h3>Catch the tax number that can change the payment.</h3>
            <p>See billed tax, assessment, equalization context and town direction together before a payment model, refinance conversation or property review goes out.</p>
            <div class="wds-wow-foot"><span class="wds-wow-name">Tax reality check</span><span class="wds-wow-go"><i class="fas fa-arrow-right"></i></span></div>
            <div class="wds-wow-visual wds-wow-payment" aria-hidden="true"><b>$8,420</b><small>PROPERTY TAX CONTEXT</small><i></i></div>
          </a>

          <a class="wds-wow-card wds-polish-reveal" href="/property/pro">
            <div class="wds-wow-role"><i class="fas fa-chart-line"></i><span>Investors</span></div>
            <h3>See the carry-cost problem before it becomes the deal.</h3>
            <p>Put the property’s tax burden beside its assessment and municipal direction before you underwrite the return, not after the acquisition.</p>
            <div class="wds-wow-foot"><span class="wds-wow-name">Acquisition tax screen</span><span class="wds-wow-go"><i class="fas fa-arrow-right"></i></span></div>
            <div class="wds-wow-visual wds-wow-cost" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          </a>
        </div>
      </div>
    `;
    anchor.parentNode.insertBefore(section, anchor);
  }

  function injectCompetitorCompare(main) {
    if (main.querySelector('.wds-rivals-section')) return;
    var anchor = main.querySelector('.wds-audience-section');
    if (!anchor) return;

    var rivals = [
      ['ATTOM', '/property/compare/attom', 'Strong nationwide infrastructure versus New Jersey-specific property intelligence.'],
      ['BatchData', '/property/compare/batchdata', 'Bulk data and enrichment versus owner-centered analysis and action.'],
      ['PropertyRadar', '/property/compare/propertyradar', 'Prospecting power versus statewide homeowner intelligence.'],
      ['PropertyShark', '/property/compare/propertyshark', 'Deep property reports versus interpreted New Jersey workflows.'],
      ['PropStream', '/property/compare/propstream', 'National investor prospecting versus New Jersey tax and ownership context.'],
      ['Regrid', '/property/compare/regrid', 'Parcel infrastructure versus assessment and decision intelligence.']
    ];

    var cards = rivals.map(function (r) {
      return '<a class="wds-rival-card wds-polish-reveal" href="' + r[1] + '">' +
        '<div class="wds-rival-versus"><span>Watchdog</span><i class="fas fa-xmark"></i><span>' + r[0] + '</span></div>' +
        '<h3>Watchdog vs. ' + r[0] + '</h3>' +
        '<p>' + r[2] + '</p>' +
        '<i class="fas fa-arrow-right"></i>' +
      '</a>';
    }).join('');

    var section = document.createElement('section');
    section.className = 'wds-section wds-rivals-section';
    section.innerHTML = `
      <div class="wds-wrap">
        <div class="wds-rivals-shell">
          <div class="wds-rivals-head wds-polish-reveal">
            <div>
              <h2>Watchdog vs.<br><em>the other guys.</em></h2>
              <p>A direct look at where the major property-data platforms are strongest, where they are not, and where Watchdog fits.</p>
            </div>
            <a class="wds-rivals-all" href="/property/compare">See every comparison <i class="fas fa-arrow-right"></i></a>
          </div>
          <div class="wds-rivals-grid">${cards}</div>
          <div class="wds-rivals-note wds-polish-reveal"><i class="fas fa-circle-info"></i><span>The best tool depends on the job. Watchdog is built around New Jersey-specific interpretation, monitoring and action.</span></div>
        </div>
      </div>
    `;
    anchor.parentNode.insertBefore(section, anchor);
  }

  function installStorySync(main) {
    var story = main.querySelector('.wds-story-section');
    var steps = Array.prototype.slice.call(main.querySelectorAll('.wds-story-step'));
    var panels = Array.prototype.slice.call(main.querySelectorAll('[data-screen-panel]'));
    var tabs = Array.prototype.slice.call(main.querySelectorAll('[data-screen-tab]'));
    var browser = main.querySelector('#wds-live-browser');
    var address = main.querySelector('#wds-browser-address');
    var chips = Array.prototype.slice.call(main.querySelectorAll('.wds-float-chip span'));
    if (!story || !steps.length || !panels.length) return;

    var frameUrls = [
      'njpropertytaxrelief.com/property/dashboard',
      'njpropertytaxrelief.com/property/home',
      'njpropertytaxrelief.com/property/town-compare',
      'njpropertytaxrelief.com/property/marketing-studio/design'
    ];
    var chipCopy = [
      ['Signal found', 'Priority changed', 'Next action ready'],
      ['Assessment signal', 'Property context', 'Evidence ready'],
      ['Town comparison', 'Tradeoff visible', 'Context aligned'],
      ['Audience ready', 'Creative selected', 'Design ready']
    ];
    var active = -1;
    var ticking = false;
    var tabLockUntil = 0;

    function sync(index) {
      index = Math.max(0, Math.min(panels.length - 1, Number(index) || 0));
      if (active === index &&
          steps[index].classList.contains('active') &&
          panels[index].classList.contains('active')) return;
      active = index;

      steps.forEach(function (step, i) {
        step.classList.toggle('active', i === index);
      });
      panels.forEach(function (panel, i) {
        panel.classList.toggle('active', i === index);
      });
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (address && frameUrls[index]) address.textContent = frameUrls[index];
      if (chipCopy[index]) {
        chips.forEach(function (chip, i) {
          if (chipCopy[index][i]) chip.textContent = chipCopy[index][i];
        });
      }
      if (browser) {
        browser.classList.remove('screen-0', 'screen-1', 'screen-2', 'screen-3');
        browser.classList.add('screen-' + index);
      }
    }

    function nearestStep() {
      if (window.innerWidth <= 900) return active < 0 ? 0 : active;
      var storyRect = story.getBoundingClientRect();
      if (storyRect.bottom <= 0 || storyRect.top >= window.innerHeight) return -1;

      var target = Math.max(150, Math.min(window.innerHeight * 0.48, window.innerHeight - 150));
      var best = 0;
      var bestDistance = Infinity;
      steps.forEach(function (step, i) {
        var rect = step.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var distance = Math.abs(center - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      });
      return best;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        if (Date.now() < tabLockUntil) return;
        var index = nearestStep();
        if (index >= 0) sync(index);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var index = Number(tab.getAttribute('data-screen-tab')) || 0;
        tabLockUntil = Date.now() + 1250;
        window.setTimeout(function () { sync(index); }, 0);
        window.setTimeout(function () {
          var step = steps[index];
          if (step) step.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 20);
      });
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.setTimeout(function () {
      var index = nearestStep();
      sync(index >= 0 ? index : 0);
    }, 50);
  }

  function installReveal(main) {
    var nodes = Array.prototype.slice.call(main.querySelectorAll('.wds-polish-reveal'));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window) ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
