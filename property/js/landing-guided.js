(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;

  var tries = 0;

  function boot() {
    var main = document.getElementById('wd-showcase');
    if (!main) {
      tries += 1;
      if (tries < 100) window.setTimeout(boot, 60);
      return;
    }
    if (main.getAttribute('data-wdg-guided') === '1') return;
    main.setAttribute('data-wdg-guided', '1');

    enhanceHero();
    tuneIntro(main);
    addCoreJobs(main);
    addEvidencePromise(main);
    simplifyAudience(main);
    tuneCapabilities(main);
    tuneClosingFlow(main);
    restoreStaticTail(main);
    installReveal(main);
    installPostPolishOrdering(main);
    installAnalytics(main);
  }

  function enhanceHero() {
    var hero = document.querySelector('.pl-hero-inner');
    var h1 = hero && hero.querySelector('h1');
    var search = hero && hero.querySelector('.pl-search-card');
    if (!hero || !h1 || !search) return;

    if (!hero.querySelector('.wdg-hero-lead')) {
      var lead = document.createElement('p');
      lead.className = 'wdg-hero-lead';
      lead.textContent = 'See assessments, taxes, sales and property signals behind the address. <br>Understand what they mean.';
      search.parentNode.insertBefore(lead, search);
    }

    if (!hero.querySelector('.wdg-hero-pro')) {
      var pro = document.createElement('a');
      pro.className = 'wdg-hero-pro';
      pro.href = '/property/pro';
      pro.innerHTML = 'Work with properties every day? See Watchdog Professional <i class="fas fa-arrow-right"></i>';
      search.insertAdjacentElement('afterend', pro);
    }
  }

  function tuneIntro(main) {
    var intro = main.querySelector('.wds-intro');
    if (!intro) return;
    var h2 = intro.querySelector('h2');
    var p = intro.querySelector('p');
    var link = intro.querySelector('.wds-text-link');
    if (h2) h2.innerHTML = 'One address.<br><em>The property record in context.</em>';
    if (p) p.textContent = 'Start with the public record. Watchdog adds the context, changes and next things worth checking.';
    if (link) {
      link.href = '#wds-product-tour';
      link.innerHTML = 'See Watchdog in action <i class="fas fa-arrow-down"></i>';
    }

    var steps = main.querySelectorAll('.wds-story-step');
    if (steps[0]) {
      var heading0 = steps[0].querySelector('h3');
      var copy0 = steps[0].querySelector('p');
      if (heading0) heading0.innerHTML = 'Keep the properties<br>that matter organized.';
      if (copy0) copy0.textContent = 'Saved homes, changing signals and the next item that deserves attention.';
    }
    if (steps[1]) {
      var heading1 = steps[1].querySelector('h3');
      if (heading1) heading1.innerHTML = 'Open a property.<br>See the record and context.';
    }
  }

  function addCoreJobs(main) {
    if (main.querySelector('.wdg-jobs')) return;
    var story = main.querySelector('.wds-story-section');
    if (!story) return;

    var section = document.createElement('section');
    section.className = 'wdg-section wdg-jobs';
    section.innerHTML = [
      '<div class="wds-wrap">',
        '<div class="wdg-reveal">',
          '<span class="wdg-eyebrow"><i class="fas fa-layer-group"></i> What Watchdog does</span>',
          '<h2 class="wdg-head">Know the property. Know what changed. Know what to do next.</h2>',
          '<p class="wdg-sub">The lookup is the starting point. Watchdog keeps the property record, the surrounding context and the next useful action in one place.</p>',
        '</div>',
        '<div class="wdg-job-grid">',
          '<article class="wdg-job wdg-reveal">',
            '<span class="wdg-job-no">01</span>',
            '<h3>Know the property</h3>',
            '<p>Start with the facts attached to the parcel instead of piecing them together from separate sites.</p>',
            '<ul><li><i class="fas fa-circle-check"></i> Assessment and tax</li><li><i class="fas fa-circle-check"></i> Sales and deed context</li><li><i class="fas fa-circle-check"></i> Block, lot and parcel record</li></ul>',
          '</article>',
          '<article class="wdg-job wdg-reveal">',
            '<span class="wdg-job-no">02</span>',
            '<h3>Know what changed</h3>',
            '<p>A static record matters more when you can see what moved around it and bring the property back when something changes.</p>',
            '<ul><li><i class="fas fa-circle-check"></i> Assessment changes</li><li><i class="fas fa-circle-check"></i> Municipal and ratio context</li><li><i class="fas fa-circle-check"></i> Saved-property monitoring</li></ul>',
          '</article>',
          '<article class="wdg-job wdg-reveal">',
            '<span class="wdg-job-no">03</span>',
            '<h3>Know what to do next</h3>',
            '<p>Use the evidence for the job in front of you, whether that is an appeal screen, a homeowner decision or professional follow-up.</p>',
            '<ul><li><i class="fas fa-circle-check"></i> Appeal and fairness research</li><li><i class="fas fa-circle-check"></i> Homeowner decisions</li><li><i class="fas fa-circle-check"></i> Professional workflows</li></ul>',
          '</article>',
        '</div>',
      '</div>'
    ].join('');
    story.insertAdjacentElement('afterend', section);
  }

  function addEvidencePromise(main) {
    if (main.querySelector('.wdg-evidence')) return;
    var jobs = main.querySelector('.wdg-jobs');
    var capabilities = main.querySelector('.wds-capabilities');
    if (!jobs || !capabilities) return;

    var section = document.createElement('section');
    section.className = 'wdg-section wdg-evidence';
    section.innerHTML = [
      '<div class="wds-wrap">',
        '<div class="wdg-evidence-shell wdg-reveal">',
          '<div class="wdg-evidence-copy">',
            '<span class="wdg-eyebrow"><i class="fas fa-fingerprint"></i> Built to show its work</span>',
            '<h2>When the evidence is thin, Watchdog says so.</h2>',
            '<p>Public-source facts, Watchdog calculations and screening signals are kept separate. Missing inputs do not quietly become zero, safe or favorable.</p>',
            '<a class="wdg-evidence-link" href="/property/data-methodology">See the data methodology <i class="fas fa-arrow-right"></i></a>',
          '</div>',
          '<div class="wdg-evidence-list">',
            '<div class="wdg-evidence-item"><i class="fas fa-link"></i><div><b>Sources stay attached</b><span>Important values remain traceable to the public source or governed formula behind them.</span></div></div>',
            '<div class="wdg-evidence-item"><i class="fas fa-calculator"></i><div><b>Calculations are labeled</b><span>A Watchdog-derived value is not presented as though a government agency published it.</span></div></div>',
            '<div class="wdg-evidence-item"><i class="fas fa-signal"></i><div><b>Confidence follows the evidence</b><span>Coverage and missing inputs affect how strongly a result should be read.</span></div></div>',
            '<div class="wdg-evidence-item"><i class="fas fa-circle-minus"></i><div><b>Only defensible values</b><span>If a defensible value cannot be produced, Watchdog can leave it unavailable instead of guessing.</span></div></div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
    capabilities.parentNode.insertBefore(section, capabilities);
  }

  function simplifyAudience(main) {
    var section = main.querySelector('.wds-audience-section');
    if (!section || section.getAttribute('data-wdg-paths') === '1') return;
    section.setAttribute('data-wdg-paths', '1');
    section.classList.add('wdg-paths');
    section.innerHTML = [
      '<div class="wds-wrap">',
        '<div class="wdg-path-head wdg-reveal">',
          '<span class="wdg-eyebrow"><i class="fas fa-route"></i> Choose your path</span>',
          '<h2 class="wdg-head">Use Watchdog for your home or for your work.</h2>',
          '<p class="wdg-sub">The same New Jersey property record can answer very different questions. Start with the path that matches why you are here.</p>',
        '</div>',
        '<div class="wdg-path-grid">',
          '<article class="wdg-path-card wdg-reveal">',
            '<span class="wdg-path-icon"><i class="fas fa-house-user"></i></span>',
            '<span class="wdg-path-label">New Jersey homeowners</span>',
            '<h3>Understand my property</h3>',
            '<p>Check the assessment, tax record and sale context, screen for an appeal, explore tax relief and keep watching the property over time.</p>',
            '<div class="wdg-tags"><span>Assessments</span><span>Tax relief</span><span>Appeals</span><span>Selling</span><span>Monitoring</span></div>',
            '<div class="wdg-path-actions"><a class="wdg-path-primary" href="#pl-addr" data-wds-focus-search>Search my property <i class="fas fa-arrow-right"></i></a><a class="wdg-path-secondary" href="/property/dashboard">Watch a property</a></div>',
          '</article>',
          '<article class="wdg-path-card pro wdg-reveal">',
            '<span class="wdg-path-icon"><i class="fas fa-briefcase"></i></span>',
            '<span class="wdg-path-label">Property professionals</span>',
            '<h3>Use property intelligence at work</h3>',
            '<p>Move from a property record into research, monitoring, opportunity discovery and professional workflows built around New Jersey data.</p>',
            '<div class="wdg-tags"><span>Real estate</span><span>Attorneys</span><span>Mortgage</span><span>Appraisal</span><span>Investment</span></div>',
            '<div class="wdg-path-actions"><a class="wdg-path-primary" href="/property/pro">See Watchdog Professional <i class="fas fa-arrow-right"></i></a><a class="wdg-path-secondary" href="/property/pro#plans">Plans &amp; pricing</a></div>',
          '</article>',
        '</div>',
      '</div>'
    ].join('');
  }

  function tuneCapabilities(main) {
    var section = main.querySelector('.wds-capabilities');
    if (!section) return;
    var head = section.querySelector('.wds-center-head h2');
    if (head) head.innerHTML = 'Explore the tools inside Watchdog.';
  }

  function tuneClosingFlow(main) {
    var flow = main.querySelector('.wds-flow-section');
    if (!flow) return;
    var h2 = flow.querySelector('.wds-flow-copy h2');
    var p = flow.querySelector('.wds-flow-copy p');
    var actions = flow.querySelector('.wds-flow-actions');
    if (h2) h2.innerHTML = 'Start with an address.<br><em>Keep watching what matters.</em>';
    if (p) p.textContent = 'Look up a property free, save what matters, and go deeper only when the decision calls for it.';
    if (actions) {
      actions.innerHTML = '<a class="wds-primary" href="#pl-addr" data-wds-focus-search>Search an address <i class="fas fa-arrow-right"></i></a><a class="wds-secondary" href="/property/dashboard">Watch a property</a><a class="wds-secondary" href="/property/pro">For professionals</a>';
    }
  }

  function restoreStaticTail(main) {
    var footer = document.getElementById('wd-property-footer');
    if (!footer || !footer.parentNode) return;

    var faq = document.querySelector('.landing-faq');
    var insightsNode = document.querySelector('.ins-grid');
    var sponsorNode = document.querySelector('.gt-banner');
    var insights = insightsNode && insightsNode.closest('section');
    var sponsor = sponsorNode && sponsorNode.closest('section');
    var sections = [faq, insights, sponsor].filter(function (section, index, all) {
      return section && all.indexOf(section) === index;
    });

    sections.forEach(function (section) {
      section.hidden = false;
      section.removeAttribute('hidden');
      section.classList.add('wdg-tail-restored');
      footer.parentNode.insertBefore(section, footer);
    });
  }

  function installReveal(main) {
    var nodes = Array.prototype.slice.call(main.querySelectorAll('.wdg-reveal'));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      nodes.forEach(function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  function installPostPolishOrdering(main) {
    var attempts = 0;
    function arrange() {
      attempts += 1;
      var flow = main.querySelector('.wds-flow-section');
      var wow = main.querySelector('.wds-wow-section');
      var rivals = main.querySelector('.wds-rivals-section');
      if (wow) {
        var h2 = wow.querySelector('.wds-wow-head h2');
        if (h2) h2.innerHTML = 'How professionals use Watchdog.';
      }
      if (flow && wow && rivals) {
        flow.parentNode.insertBefore(wow, flow);
        flow.parentNode.insertBefore(rivals, flow);
        return;
      }
      if (attempts < 40) window.setTimeout(arrange, 75);
    }
    window.setTimeout(arrange, 80);
  }

  function installAnalytics(main) {
    function track(name, detail) {
      try {
        if (typeof window.gtag === 'function') window.gtag('event', name, detail || {});
      } catch (e) {}
    }

    main.addEventListener('click', function (event) {
      var pathCard = event.target.closest('.wdg-path-card a');
      if (pathCard) {
        track('landing_path_click', {
          destination: pathCard.getAttribute('href') || '',
          path_type: pathCard.closest('.wdg-path-card.pro') ? 'professional' : 'homeowner'
        });
      }
      var methodology = event.target.closest('.wdg-evidence-link');
      if (methodology) track('landing_methodology_click', { destination: '/property/data-methodology' });
    });

    var heroPro = document.querySelector('.wdg-hero-pro');
    if (heroPro) heroPro.addEventListener('click', function () {
      track('landing_professional_entry', { placement: 'hero' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
