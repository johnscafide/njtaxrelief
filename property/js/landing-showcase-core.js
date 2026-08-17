(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;
  if (!document.querySelector('.pl-hero') || document.getElementById('wd-showcase')) return;

  var stylesheet = document.getElementById('wd-showcase-css');
  if (!stylesheet) {
    stylesheet = document.createElement('link');
    stylesheet.id = 'wd-showcase-css';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/property/css/landing-showcase.css';
    document.head.appendChild(stylesheet);
  }

  var footer = document.getElementById('wd-property-footer');
  var firstLegacy = document.querySelector('.lp-tools');
  firstLegacy = firstLegacy && firstLegacy.closest('section');
  if (!footer || !firstLegacy) return;

  var cursor = firstLegacy;
  while (cursor && cursor !== footer) {
    var next = cursor.nextSibling;
    if (cursor.nodeType === 1 && cursor.id !== 'pl-hood') {
      cursor.setAttribute('data-wd-legacy-landing', 'true');
      cursor.hidden = true;
    }
    cursor = next;
  }

  var main = document.createElement('main');
  main.id = 'wd-showcase';
  main.setAttribute('aria-label', 'Watchdog property intelligence platform');
  main.innerHTML = `
    <section class="wds-platform-strip" aria-label="Watchdog platform capabilities">
      <div class="wds-platform-track" aria-hidden="true">
        <span>Free property lookup</span><i></i><span>Watchdog Score</span><i></i><span>Watchlists</span><i></i><span>Town Compare</span><i></i><span>Professional Intelligence</span><i></i><span>Marketing Studio</span><i></i>
        <span>Free property lookup</span><i></i><span>Watchdog Score</span><i></i><span>Watchlists</span><i></i><span>Town Compare</span><i></i><span>Professional Intelligence</span><i></i><span>Marketing Studio</span><i></i>
      </div>
    </section>

    <section class="wds-section wds-intro wds-reveal">
      <div class="wds-wrap wds-intro-grid">
        <h2>One address.<br><em>The whole property story.</em></h2>
        <div>
          <p>Start free. Go deeper when the decision matters.</p>
          <a class="wds-text-link" href="/property/pro">See the platform <i class="fas fa-arrow-right"></i></a>
        </div>
      </div>
    </section>

    <section class="wds-section wds-story-section" id="wds-product-tour">
      <div class="wds-story-glow wds-story-glow-a"></div>
      <div class="wds-story-glow wds-story-glow-b"></div>
      <div class="wds-wrap wds-story-grid">
        <div class="wds-story-copy">
          <article class="wds-story-step active" data-screen="0">
            <span class="wds-step-no">01</span>
            <h3>Your properties,<br>finally organized.</h3>
            <p>Saved homes, changing signals and the next thing worth looking at.</p>
            <a href="/property/dashboard">Open Dashboard <i class="fas fa-arrow-right"></i></a>
          </article>

          <article class="wds-story-step" data-screen="1">
            <span class="wds-step-no">02</span>
            <h3>Open a property.<br>See what matters.</h3>
            <p>Assessment, tax history, valuation context, appeal signals and homeowner intelligence.</p>
            <a href="/property/home">Open Property Intelligence <i class="fas fa-arrow-right"></i></a>
          </article>

          <article class="wds-story-step" data-screen="2">
            <span class="wds-step-no">03</span>
            <h3>Put towns<br>side by side.</h3>
            <p>Compare fairness, assessment currency and tax direction without stitching together five tabs.</p>
            <a href="/property/town-compare">Compare towns <i class="fas fa-arrow-right"></i></a>
          </article>

          <article class="wds-story-step" data-screen="3">
            <span class="wds-step-no">04</span>
            <h3>Turn the signal<br>into a campaign.</h3>
            <p>Move from opportunity to a real direct-mail creative inside Marketing Studio.</p>
            <a href="/property/marketing-studio/design">Open Design Studio <i class="fas fa-arrow-right"></i></a>
          </article>
        </div>

        <div class="wds-stage-column">
          <div class="wds-stage-sticky">
            <div class="wds-float-chip chip-a" aria-hidden="true"><i class="fas fa-wave-square"></i><span>Signal found</span></div>
            <div class="wds-float-chip chip-b" aria-hidden="true"><i class="fas fa-bullseye"></i><span>Priority changed</span></div>
            <div class="wds-float-chip chip-c" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i><span>Next action ready</span></div>

            <div class="wds-browser" id="wds-live-browser">
              <div class="wds-browser-bar">
                <div class="wds-window-dots" aria-hidden="true"><i></i><i></i><i></i></div>
                <div class="wds-address"><i class="fas fa-lock"></i><span id="wds-browser-address">njpropertytaxrelief.com/property/dashboard</span></div>
                <span class="wds-live-badge"><i></i> Product preview</span>
              </div>

              <div class="wds-browser-tabs" role="tablist" aria-label="Product views">
                <button class="active" type="button" role="tab" aria-selected="true" data-screen-tab="0"><i class="fas fa-table-columns"></i> Dashboard</button>
                <button type="button" role="tab" aria-selected="false" data-screen-tab="1"><i class="fas fa-house"></i> Property</button>
                <button type="button" role="tab" aria-selected="false" data-screen-tab="2"><i class="fas fa-code-compare"></i> Compare</button>
                <button type="button" role="tab" aria-selected="false" data-screen-tab="3"><i class="fas fa-wand-magic-sparkles"></i> Design Studio</button>
              </div>

              <div class="wds-screen-stack" aria-hidden="true">
                <div class="wds-screen active" data-screen-panel="0">
                  <div class="wds-demo-screen wds-demo-dashboard">
                    <aside><b><i class="fas fa-dog"></i> Watchdog</b><span class="on">Properties</span><span>Watchlist</span><span>Change intelligence</span><span>Agent Intel</span><span>Research</span><span>Professional work</span></aside>
                    <div class="wds-demo-workspace">
                      <div class="wds-demo-top"><div><small>Dashboard</small><strong>Your properties</strong></div><button>+ Add property</button></div>
                      <div class="wds-demo-stats"><div><span>Watching</span><b>3</b></div><div><span>New signals</span><b>2</b></div><div><span>Needs review</span><b>1</b></div></div>
                      <div class="wds-demo-property-grid"><div class="featured"><em>PRIORITY</em><b>Sample property</b><span>Assessment moved</span><i></i></div><div><b>Sample property</b><span>Watching</span><i></i></div><div><b>Sample property</b><span>No new changes</span><i></i></div></div>
                    </div>
                  </div>
                  <iframe title="Watchdog Dashboard preview" tabindex="-1" loading="lazy" data-src="/property/dashboard" src="about:blank"></iframe>
                </div>

                <div class="wds-screen" data-screen-panel="1">
                  <div class="wds-demo-screen wds-demo-property">
                    <aside><b><i class="fas fa-dog"></i> Watchdog</b><span>Properties</span><span class="on">Watchlist</span><span>Change intelligence</span><span>Agent Intel</span><span>Research</span></aside>
                    <div class="wds-demo-workspace">
                      <div class="wds-demo-top"><div><small>Property intelligence report</small><strong>Sample property</strong></div><button>+ Add property</button></div>
                      <div class="wds-demo-property-hero"><div class="house"><i class="fas fa-house"></i></div><div><small>YOUR HOME</small><b>Sample property</b><strong>$351,000</strong><span>Estimated market value</span></div></div>
                      <div class="wds-demo-agent"><strong>Watchdog Intel</strong><p>The assessment and town signals are summarized here, with the evidence one click away.</p><div><i></i><i></i><i></i></div></div>
                    </div>
                  </div>
                  <iframe title="Watchdog Property Intelligence preview" tabindex="-1" loading="lazy" data-src="/property/home" src="about:blank"></iframe>
                </div>

                <div class="wds-screen" data-screen-panel="2">
                  <div class="wds-demo-screen wds-demo-compare">
                    <div class="wds-demo-compare-head"><small>Town Compare</small><strong>See the difference before you decide.</strong></div>
                    <div class="wds-demo-compare-cols">
                      <div><span>Town one</span><b>Washington Township</b><em>FAIRNESS</em><i style="--v:88%"></i><em>ASSESSMENT CURRENCY</em><i style="--v:72%"></i><em>TAX DIRECTION</em><i style="--v:62%"></i></div>
                      <div><span>Town two</span><b>Cherry Hill</b><em>FAIRNESS</em><i style="--v:72%"></i><em>ASSESSMENT CURRENCY</em><i style="--v:90%"></i><em>TAX DIRECTION</em><i style="--v:78%"></i></div>
                    </div>
                    <div class="wds-demo-compare-foot"><span><i class="fas fa-circle-check"></i> Same data language</span><span><i class="fas fa-arrow-trend-up"></i> Side-by-side context</span><span><i class="fas fa-location-dot"></i> New Jersey focused</span></div>
                  </div>
                  <iframe title="Watchdog Town Compare preview" tabindex="-1" loading="lazy" data-src="/property/town-compare" src="about:blank"></iframe>
                </div>

                <div class="wds-screen" data-screen-panel="3">
                  <div class="wds-demo-screen wds-demo-studio">
                    <aside><b>CAMPAIGN STEPS</b><span>1 Find area</span><span>2 Audience review</span><span class="on">3 Design</span><span>4 Customize</span><span>5 Recipients</span><span>6 Review</span></aside>
                    <div class="wds-demo-studio-main">
                      <div class="wds-demo-studio-head"><small>DESIGN STUDIO</small><strong>Choose the creative.</strong><span>Build the piece before it goes anywhere.</span></div>
                      <div class="wds-demo-studio-body">
                        <div class="wds-template-rail"><div class="on"><i></i><span>Seller value</span></div><div><i></i><span>Tax review</span></div><div><i></i><span>Local market</span></div></div>
                        <div class="wds-postcard"><small>PROPERTY INTELLIGENCE</small><strong>What is your home really telling you?</strong><p>Local property data, translated into a useful next step.</p><b>WATCHDOG</b><em>YOUR BRAND</em></div>
                        <div class="wds-editor"><span>Headline</span><i></i><span>Message</span><i class="tall"></i><button>Use this design</button></div>
                      </div>
                    </div>
                  </div>
                  <iframe title="Watchdog Marketing Studio Design preview" tabindex="-1" loading="lazy" data-src="/property/marketing-studio/design" src="about:blank"></iframe>
                </div>
              </div>
            </div>

            <div class="wds-stage-caption">
              <span><i class="fas fa-eye-slash"></i> Personal details hidden</span>
              <span><i class="fas fa-layer-group"></i> Real product structure</span>
              <span><i class="fas fa-arrows-rotate"></i> Click or scroll</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-capabilities">
      <div class="wds-wrap">
        <div class="wds-center-head wds-reveal">
          <h2>More than a lookup.<br><em>A property intelligence system.</em></h2>
        </div>

        <div class="wds-bento">
          <a class="wds-bento-card wds-bento-score wds-reveal" href="#pl-addr" data-wds-focus-search>
            <div class="wds-card-copy"><span class="wds-mini-label">Watchdog Score</span><h3>See the signal before the spreadsheet.</h3><p>A fast read with the evidence still close by.</p></div>
            <div class="wds-score-visual" aria-hidden="true"><div class="wds-score-ring"><strong>82</strong><span>/ 100</span></div><div class="wds-score-lines"><i style="--w:92%"></i><i style="--w:78%"></i><i style="--w:64%"></i><i style="--w:86%"></i></div></div>
          </a>

          <a class="wds-bento-card wds-bento-alerts wds-reveal" href="/property/dashboard">
            <div class="wds-card-copy"><span class="wds-mini-label">Watchlists</span><h3>Let the property tell you when something changes.</h3><p>Saved-home monitoring brings the right property back to the top.</p></div>
            <div class="wds-alert-stack" aria-hidden="true"><div><i class="fas fa-arrow-trend-up"></i><span><b>Assessment changed</b><small>Watchdog signal · now</small></span></div><div><i class="fas fa-file-signature"></i><span><b>New property event</b><small>Record activity · today</small></span></div><div><i class="fas fa-location-dot"></i><span><b>Town ratio updated</b><small>Municipal data · this week</small></span></div></div>
          </a>

          <a class="wds-bento-card wds-bento-relief wds-reveal" href="/anchor-estimator.html">
            <div class="wds-card-copy"><span class="wds-mini-label">Tax relief</span><h3>Free homeowner tools still come first.</h3><p>Property lookup, ANCHOR and Stay NJ guidance stay useful even if you never buy a plan.</p></div>
            <div class="wds-relief-visual" aria-hidden="true"><span>ANCHOR</span><span>Stay NJ</span><span>Senior Freeze</span><i class="fas fa-arrow-right"></i></div>
          </a>

          <a class="wds-bento-card wds-bento-pro wds-reveal" href="/property/pro">
            <div class="wds-pro-orbit" aria-hidden="true"><i></i><i></i><i></i><span><i class="fas fa-dog"></i></span></div>
            <div class="wds-card-copy"><span class="wds-mini-label">Professional intelligence</span><h3>One property record. Different professional questions.</h3><p>Real estate, lending, appraisal, legal and investor workflows share the same intelligence layer.</p></div>
          </a>

          <a class="wds-bento-card wds-bento-studio wds-reveal" href="/property/marketing-studio/design">
            <div class="wds-card-copy"><span class="wds-mini-label">Marketing Studio</span><h3>Go from opportunity to creative.</h3><p>Audience, design and campaign workflow without rebuilding the data by hand.</p></div>
            <div class="wds-studio-visual" aria-hidden="true"><div class="wds-studio-sidebar"><i></i><i></i><i></i><i></i></div><div class="wds-studio-canvas"><span></span><b></b><em></em><button>Design</button></div></div>
          </a>
        </div>
      </div>
    </section>

    <section class="wds-section wds-compare-section">
      <div class="wds-wrap">
        <div class="wds-compare-shell wds-reveal">
          <div class="wds-compare-copy">
            <h2>Compare towns.<br><em>Spot the difference.</em></h2>
            <p>Put the same signals side by side and make the tradeoffs visible.</p>
            <a href="/property/town-compare">Open Town Compare <i class="fas fa-arrow-right"></i></a>
          </div>
          <div class="wds-compare-stage" aria-label="Animated town comparison example">
            <div class="wds-compare-switch"><button class="on" type="button">Washington Twp</button><i class="fas fa-arrow-right-arrow-left"></i><button type="button">Cherry Hill</button></div>
            <div class="wds-compare-board">
              <div class="wds-town-card town-a"><span>Town 01</span><strong>Washington Township</strong><small>Example comparison view</small></div>
              <div class="wds-compare-metrics">
                <div><span>Assessment fairness</span><i style="--a:86%;--b:70%"><b></b><em></em></i></div>
                <div><span>Assessment currency</span><i style="--a:68%;--b:91%"><b></b><em></em></i></div>
                <div><span>Tax direction</span><i style="--a:61%;--b:77%"><b></b><em></em></i></div>
                <div><span>Market context</span><i style="--a:82%;--b:74%"><b></b><em></em></i></div>
              </div>
              <div class="wds-town-card town-b"><span>Town 02</span><strong>Cherry Hill</strong><small>Example comparison view</small></div>
              <div class="wds-compare-sweep" aria-hidden="true"></div>
            </div>
            <div class="wds-compare-note"><i class="fas fa-circle-info"></i> Visual example. Open Compare for current source data.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-audience-section">
      <div class="wds-wrap">
        <div class="wds-center-head wds-reveal">
          <h2>Built around the property.<br><em>Useful to everyone around it.</em></h2>
          <p>One intelligence layer, different jobs to be done.</p>
        </div>
        <div class="wds-audience-orbit wds-reveal">
          <div class="wds-orbit-ring ring-one"></div><div class="wds-orbit-ring ring-two"></div>
          <a class="wds-role r1" href="#pl-addr" data-wds-focus-search><i class="fas fa-house-user"></i><span>Homeowners</span></a>
          <a class="wds-role r2" href="/property/pro"><i class="fas fa-house-chimney-user"></i><span>Real estate</span></a>
          <a class="wds-role r3" href="/property/pro"><i class="fas fa-scale-balanced"></i><span>Attorneys</span></a>
          <a class="wds-role r4" href="/property/pro"><i class="fas fa-building-columns"></i><span>Lenders</span></a>
          <a class="wds-role r5" href="/property/pro"><i class="fas fa-ruler-combined"></i><span>Appraisers</span></a>
          <a class="wds-role r6" href="/property/pro"><i class="fas fa-chart-line"></i><span>Investors</span></a>
          <div class="wds-orbit-core"><i class="fas fa-dog"></i><b>Watchdog</b><span>Property intelligence</span></div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-flow-section">
      <div class="wds-wrap">
        <div class="wds-flow-card wds-reveal">
          <div class="wds-flow-copy">
            <h2>Search. Understand.<br>Watch. <em>Act.</em></h2>
            <p>One property can move through the whole platform without losing context.</p>
            <div class="wds-flow-actions"><a class="wds-primary" href="#pl-addr" data-wds-focus-search>Search an address <i class="fas fa-arrow-right"></i></a><a class="wds-secondary" href="/property/pro">See professional plans</a></div>
          </div>
          <div class="wds-flow-rail" aria-hidden="true">
            <div class="wds-flow-line"><i></i><b></b></div>
            <div class="wds-flow-node n1"><span>01</span><i class="fas fa-magnifying-glass"></i><b>Search</b><small>Property record</small></div>
            <div class="wds-flow-node n2"><span>02</span><i class="fas fa-wave-square"></i><b>Understand</b><small>Signals + context</small></div>
            <div class="wds-flow-node n3"><span>03</span><i class="fas fa-bell"></i><b>Watch</b><small>Saved + monitored</small></div>
            <div class="wds-flow-node n4"><span>04</span><i class="fas fa-bolt"></i><b>Act</b><small>Decision + campaign</small></div>
          </div>
        </div>
        <p class="wds-disclosure">Watchdog uses public property and tax records for educational property intelligence. It is not a government website, appraisal, legal opinion or individualized tax advice. Verify important decisions with the appropriate public agency or qualified professional.</p>
      </div>
    </section>
  `;

  footer.parentNode.insertBefore(main, footer);
  document.body.classList.add('wd-showcase-ready');

  var steps = Array.prototype.slice.call(main.querySelectorAll('.wds-story-step'));
  var panels = Array.prototype.slice.call(main.querySelectorAll('[data-screen-panel]'));
  var tabs = Array.prototype.slice.call(main.querySelectorAll('[data-screen-tab]'));
  var address = main.querySelector('#wds-browser-address');
  var browser = main.querySelector('#wds-live-browser');
  var story = main.querySelector('.wds-story-section');
  var chips = Array.prototype.slice.call(main.querySelectorAll('.wds-float-chip span'));
  var activeScreen = -1;
  var manualUntil = 0;
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

  function replacePrivateText(root) {
    if (!root || !root.ownerDocument) return;
    var doc = root.ownerDocument;
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var emailRx = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    var streetRx = /\b\d{1,6}\s+[A-Z0-9.'-]+(?:\s+[A-Z0-9.'-]+){0,4}\s+(?:STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|LANE|LN|COURT|CT|BOULEVARD|BLVD|WAY|PLACE|PL|PARKWAY|PKWY|TERRACE|TER)\b\.?/gi;
    nodes.forEach(function (node) {
      var value = node.nodeValue || '';
      if (!value.trim()) return;
      value = value.replace(emailRx, 'Watchdog workspace');
      value = value.replace(streetRx, 'Sample property');
      node.nodeValue = value;
    });
  }

  function sanitizeFrame(iframe, index) {
    var doc;
    try { doc = iframe.contentDocument || iframe.contentWindow.document; } catch (e) { return false; }
    if (!doc || !doc.body) return false;

    var style = doc.getElementById('wd-showcase-sanitize');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'wd-showcase-sanitize';
      style.textContent = '#db-avatar,#db-email,#hm-avatar,#hm-email{display:none!important}.who{gap:0!important}.who>div:first-child:empty{display:none!important}[class*="avatar"] img,[class*="profile"] img{visibility:hidden!important}';
      doc.head.appendChild(style);
    }

    var dbHi = doc.getElementById('db-hi');
    if (dbHi) dbHi.textContent = 'Your properties';
    if (doc.getElementById('db-email')) doc.getElementById('db-email').textContent = '';
    if (doc.getElementById('hm-email')) doc.getElementById('hm-email').textContent = '';
    if (doc.getElementById('db-avatar')) doc.getElementById('db-avatar').innerHTML = '';
    if (doc.getElementById('hm-avatar')) doc.getElementById('hm-avatar').innerHTML = '';
    replacePrivateText(doc.body);

    if (index === 0) {
      var dbMain = doc.getElementById('db-main');
      return !!(dbMain && getComputedStyle(dbMain).display !== 'none');
    }
    if (index === 1) {
      var hmMain = doc.getElementById('hm-main');
      return !!(hmMain && getComputedStyle(hmMain).display !== 'none');
    }
    if (index === 2) return true;
    if (index === 3) {
      var text = (doc.body.innerText || '').toLowerCase();
      return !!doc.getElementById('ms-app') && text.indexOf('sign in') === -1 && text.indexOf('opening marketing studio') === -1;
    }
    return false;
  }

  function revealLiveWhenReady(panel, iframe, index) {
    var tries = 0;
    function check() {
      tries += 1;
      var ready = sanitizeFrame(iframe, index);
      if (ready) {
        panel.classList.add('live-ready');
        return;
      }
      if (tries < 24) window.setTimeout(check, 250);
    }
    window.setTimeout(check, 150);
  }

  function loadPanel(index) {
    var panel = panels[index];
    if (!panel) return;
    var iframe = panel.querySelector('iframe');
    if (!iframe || iframe.dataset.loaded === '1') return;
    iframe.dataset.loaded = '1';
    iframe.src = iframe.getAttribute('data-src');
    iframe.addEventListener('load', function () {
      revealLiveWhenReady(panel, iframe, index);
    });
  }

  function setScreen(index) {
    index = Math.max(0, Math.min(panels.length - 1, Number(index) || 0));
    activeScreen = index;
    loadPanel(index);
    if (index < panels.length - 1) window.setTimeout(function () { loadPanel(index + 1); }, 350);

    steps.forEach(function (step, i) { step.classList.toggle('active', i === index); });
    panels.forEach(function (panel, i) { panel.classList.toggle('active', i === index); });
    tabs.forEach(function (tab, i) {
      var isActive = i === index;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (address) address.textContent = frameUrls[index];
    if (chipCopy[index]) chips.forEach(function (chip, i) { chip.textContent = chipCopy[index][i] || chip.textContent; });
    if (browser) {
      browser.classList.remove('screen-0', 'screen-1', 'screen-2', 'screen-3');
      browser.classList.add('screen-' + index);
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var index = Number(tab.getAttribute('data-screen-tab')) || 0;
      manualUntil = Date.now() + 1500;
      setScreen(index);
      var step = steps[index];
      if (step) step.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  main.addEventListener('click', function (event) {
    var link = event.target.closest('[data-wds-focus-search]');
    if (!link) return;
    event.preventDefault();
    var input = document.getElementById('pl-addr');
    var hero = document.querySelector('.pl-hero');
    if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(function () { if (input) input.focus(); }, 500);
  });

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealEls = Array.prototype.slice.call(main.querySelectorAll('.wds-reveal'));

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.13, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });

    var stepObserver = new IntersectionObserver(function (entries) {
      if (Date.now() < manualUntil) return;
      var visible = entries.filter(function (entry) { return entry.isIntersecting; }).sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      if (visible[0]) setScreen(visible[0].target.getAttribute('data-screen'));
    }, { threshold: [0.35, 0.5, 0.68], rootMargin: '-18% 0px -32% 0px' });
    steps.forEach(function (step) { stepObserver.observe(step); });

    var preloadObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadPanel(0);
        preloadObserver.disconnect();
      });
    }, { rootMargin: '520px 0px' });
    if (story) preloadObserver.observe(story);
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
    loadPanel(0);
  }

  setScreen(0);

  if (!reducedMotion && story && browser) {
    var ticking = false;
    function updateStoryMotion() {
      ticking = false;
      var rect = story.getBoundingClientRect();
      var travel = Math.max(1, rect.height - window.innerHeight);
      var progress = Math.max(0, Math.min(1, (-rect.top) / travel));
      main.style.setProperty('--wds-story-progress', progress.toFixed(4));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateStoryMotion);
    }
    updateStoryMotion();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }
})();
