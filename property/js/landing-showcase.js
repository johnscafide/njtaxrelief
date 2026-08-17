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
  main.setAttribute('aria-label', 'Watchdog platform overview');
  main.innerHTML = `
    <section class="wds-section wds-intro wds-reveal">
      <div class="wds-wrap">
        <div class="wds-kicker"><span></span> Built for New Jersey property decisions</div>
        <div class="wds-intro-grid">
          <h2>See the <em>actual product</em>, not a mockup.</h2>
          <div>
            <p>Watchdog connects the property record, your saved homes, professional intelligence and campaign tools into one workspace. The screens below are live views of the product.</p>
            <a class="wds-text-link" href="/property/dashboard">Open your dashboard <i class="fas fa-arrow-right"></i></a>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-story-section" id="wds-product-tour">
      <div class="wds-story-glow wds-story-glow-a"></div>
      <div class="wds-story-glow wds-story-glow-b"></div>
      <div class="wds-wrap wds-story-grid">
        <div class="wds-story-copy">
          <div class="wds-story-label">One platform, three working views</div>

          <article class="wds-story-step active" data-screen="0">
            <span class="wds-step-no">01</span>
            <h3>Start with the dashboard.</h3>
            <p>Saved properties, Watchdog signals, assessment movement and the next action are organized around the homes you are actually watching.</p>
            <a href="/property/dashboard">Explore Dashboard <i class="fas fa-arrow-right"></i></a>
          </article>

          <article class="wds-story-step" data-screen="1">
            <span class="wds-step-no">02</span>
            <h3>Open a property and go deeper.</h3>
            <p>Move from a simple address to a working property record with tax history, valuation context, appeal intelligence and homeowner tools.</p>
            <a href="/property/home">Explore Property Intelligence <i class="fas fa-arrow-right"></i></a>
          </article>

          <article class="wds-story-step" data-screen="2">
            <span class="wds-step-no">03</span>
            <h3>Turn intelligence into action.</h3>
            <p>Agent accounts can move from an opportunity to audience building and creative inside Marketing Studio without leaving Watchdog.</p>
            <a href="/property/marketing-studio/audience">Explore Marketing Studio <i class="fas fa-arrow-right"></i></a>
          </article>
        </div>

        <div class="wds-stage-column">
          <div class="wds-stage-sticky">
            <div class="wds-float-chip chip-a" aria-hidden="true"><i class="fas fa-chart-line"></i><span>Assessment signal</span></div>
            <div class="wds-float-chip chip-b" aria-hidden="true"><i class="fas fa-bullseye"></i><span>Opportunity found</span></div>
            <div class="wds-float-chip chip-c" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i><span>Creative ready</span></div>

            <div class="wds-browser" id="wds-live-browser">
              <div class="wds-browser-bar">
                <div class="wds-window-dots" aria-hidden="true"><i></i><i></i><i></i></div>
                <div class="wds-address"><i class="fas fa-lock"></i><span id="wds-browser-address">njpropertytaxrelief.com/property/dashboard</span></div>
                <span class="wds-live-badge"><i></i> Live product</span>
              </div>

              <div class="wds-browser-tabs" role="tablist" aria-label="Product views">
                <button class="active" type="button" role="tab" aria-selected="true" data-screen-tab="0"><i class="fas fa-table-columns"></i> Dashboard</button>
                <button type="button" role="tab" aria-selected="false" data-screen-tab="1"><i class="fas fa-house"></i> Property</button>
                <button type="button" role="tab" aria-selected="false" data-screen-tab="2"><i class="fas fa-wand-magic-sparkles"></i> Marketing Studio</button>
              </div>

              <div class="wds-screen-stack" aria-hidden="true">
                <div class="wds-screen active" data-screen-panel="0">
                  <div class="wds-screen-loader"><i class="fas fa-dog"></i><span>Loading Dashboard</span></div>
                  <iframe title="Live Watchdog Dashboard preview" tabindex="-1" loading="lazy" data-src="/property/dashboard" src="about:blank"></iframe>
                </div>
                <div class="wds-screen" data-screen-panel="1">
                  <div class="wds-screen-loader"><i class="fas fa-dog"></i><span>Loading Property Intelligence</span></div>
                  <iframe title="Live Watchdog Property Intelligence preview" tabindex="-1" loading="lazy" data-src="/property/home" src="about:blank"></iframe>
                </div>
                <div class="wds-screen" data-screen-panel="2">
                  <div class="wds-screen-loader"><i class="fas fa-dog"></i><span>Loading Marketing Studio</span></div>
                  <iframe title="Live Watchdog Marketing Studio preview" tabindex="-1" loading="lazy" data-src="/property/marketing-studio/audience" src="about:blank"></iframe>
                </div>
              </div>
            </div>

            <div class="wds-stage-caption">
              <span><i class="fas fa-circle-check"></i> Real Watchdog pages</span>
              <span><i class="fas fa-rotate"></i> Updates with the product</span>
              <span><i class="fas fa-user-shield"></i> Uses your current session</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="wds-section wds-capabilities">
      <div class="wds-wrap">
        <div class="wds-center-head wds-reveal">
          <div class="wds-kicker"><span></span> More than a property lookup</div>
          <h2>From one address to a <em>working intelligence layer.</em></h2>
          <p>Each tool is designed to answer a practical question, then hand the answer to the next part of the workflow.</p>
        </div>

        <div class="wds-bento">
          <a class="wds-bento-card wds-bento-score wds-reveal" href="#pl-addr" data-wds-focus-search>
            <div class="wds-card-copy"><span class="wds-mini-label">Watchdog Score</span><h3>See the signal before the spreadsheet.</h3><p>A fast read on the property with the evidence still one click away.</p></div>
            <div class="wds-score-visual" aria-hidden="true">
              <div class="wds-score-ring"><strong>82</strong><span>/ 100</span></div>
              <div class="wds-score-lines"><i style="--w:92%"></i><i style="--w:78%"></i><i style="--w:64%"></i><i style="--w:86%"></i></div>
            </div>
          </a>

          <a class="wds-bento-card wds-bento-map wds-reveal" href="/property/town-compare">
            <div class="wds-card-copy"><span class="wds-mini-label">Town intelligence</span><h3>Compare the market around the property.</h3><p>Fairness, assessment currency and tax direction across New Jersey.</p></div>
            <div class="wds-map-visual" aria-hidden="true">
              <i class="pin p1"></i><i class="pin p2"></i><i class="pin p3"></i><i class="pin p4"></i>
              <svg viewBox="0 0 520 220" preserveAspectRatio="none"><path d="M0 180 C80 110 120 160 190 108 S315 70 390 112 S460 62 520 40"/></svg>
            </div>
          </a>

          <a class="wds-bento-card wds-bento-alerts wds-reveal" href="/property/dashboard">
            <div class="wds-card-copy"><span class="wds-mini-label">Watchlists</span><h3>Let the property tell you when something changes.</h3><p>Signals and saved-home monitoring bring the right properties back to the top.</p></div>
            <div class="wds-alert-stack" aria-hidden="true">
              <div><i class="fas fa-arrow-trend-up"></i><span><b>Assessment changed</b><small>Watchdog signal · now</small></span></div>
              <div><i class="fas fa-file-signature"></i><span><b>New property event</b><small>Record activity · today</small></span></div>
              <div><i class="fas fa-location-dot"></i><span><b>Town ratio updated</b><small>Municipal data · this week</small></span></div>
            </div>
          </a>

          <a class="wds-bento-card wds-bento-pro wds-reveal" href="/property/pro">
            <div class="wds-pro-orbit" aria-hidden="true"><i></i><i></i><i></i><span><i class="fas fa-dog"></i></span></div>
            <div class="wds-card-copy"><span class="wds-mini-label">Professional intelligence</span><h3>One property record, different professional questions.</h3><p>Real estate, lending, appraisal, legal and investor workflows can use the same underlying data layer.</p></div>
          </a>

          <a class="wds-bento-card wds-bento-studio wds-reveal" href="/property/marketing-studio/audience">
            <div class="wds-card-copy"><span class="wds-mini-label">Marketing Studio</span><h3>Go from opportunity to campaign.</h3><p>Discover, build the audience and move into creative without rebuilding the data by hand.</p></div>
            <div class="wds-studio-visual" aria-hidden="true">
              <div class="wds-studio-sidebar"><i></i><i></i><i></i><i></i></div>
              <div class="wds-studio-canvas"><span></span><b></b><em></em><button>Generate</button></div>
            </div>
          </a>
        </div>
      </div>
    </section>

    <section class="wds-section wds-flow-section">
      <div class="wds-wrap">
        <div class="wds-flow-card wds-reveal">
          <div class="wds-flow-copy">
            <div class="wds-kicker light"><span></span> The Watchdog flow</div>
            <h2>Search. Understand. Watch. <em>Act.</em></h2>
            <p>The product is built so each step creates context for the next one instead of sending you into another disconnected tool.</p>
            <div class="wds-flow-actions">
              <a class="wds-primary" href="#pl-addr" data-wds-focus-search>Search an address <i class="fas fa-arrow-right"></i></a>
              <a class="wds-secondary" href="/property/pro">See professional plans</a>
            </div>
          </div>
          <div class="wds-flow-rail" aria-hidden="true">
            <div><span>01</span><b>Property</b><small>Official record</small></div>
            <i class="fas fa-arrow-right"></i>
            <div><span>02</span><b>Intelligence</b><small>Signals + context</small></div>
            <i class="fas fa-arrow-right"></i>
            <div><span>03</span><b>Watch</b><small>Saved + monitored</small></div>
            <i class="fas fa-arrow-right"></i>
            <div><span>04</span><b>Action</b><small>Decision + campaign</small></div>
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
  var activeScreen = -1;
  var frameUrls = [
    'njpropertytaxrelief.com/property/dashboard',
    'njpropertytaxrelief.com/property/home',
    'njpropertytaxrelief.com/property/marketing-studio/audience'
  ];

  function loadPanel(index) {
    var panel = panels[index];
    if (!panel) return;
    var iframe = panel.querySelector('iframe');
    if (!iframe || iframe.dataset.loaded === '1') return;
    iframe.dataset.loaded = '1';
    iframe.src = iframe.getAttribute('data-src');
    iframe.addEventListener('load', function () {
      panel.classList.add('loaded');
    }, { once: true });
  }

  function setScreen(index) {
    index = Math.max(0, Math.min(panels.length - 1, Number(index) || 0));
    if (index === activeScreen) return;
    activeScreen = index;
    loadPanel(index);
    steps.forEach(function (step, i) {
      step.classList.toggle('active', i === index);
    });
    panels.forEach(function (panel, i) {
      panel.classList.toggle('active', i === index);
    });
    tabs.forEach(function (tab, i) {
      var isActive = i === index;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (address) address.textContent = frameUrls[index];
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setScreen(tab.getAttribute('data-screen-tab'));
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
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { revealObserver.observe(el); });

    var stepObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setScreen(entry.target.getAttribute('data-screen'));
      });
    }, { threshold: 0.46, rootMargin: '-22% 0px -38% 0px' });
    steps.forEach(function (step) { stepObserver.observe(step); });

    var preloadObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadPanel(0);
        preloadObserver.disconnect();
      });
    }, { rootMargin: '400px 0px' });
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
