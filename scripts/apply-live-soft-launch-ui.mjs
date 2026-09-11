import { readFile, writeFile } from 'node:fs/promises';

async function transform(path, edits) {
  let text = await readFile(path, 'utf8');
  for (const edit of edits) {
    if (text.includes(edit.to)) continue;
    if (!text.includes(edit.from)) {
      throw new Error(`Soft-launch UI transform could not find expected source in ${path}: ${edit.label}`);
    }
    text = text.replace(edit.from, edit.to);
  }
  await writeFile(path, text, 'utf8');
}

await transform('property/js/app-shell-2027.js', [
  {
    label: 'drawer brand home link',
    from: 'function dashboardBrand(){return\'<a class="wd4-brand" href="/property/dashboard">',
    to: 'function dashboardBrand(){return\'<a class="wd4-brand" href="/property/" aria-label="Watchdog property lookup">'
  },
  {
    label: 'topbar brand home link',
    from: '<a class="wdx-brand" href="/property/dashboard">',
    to: '<a class="wdx-brand" href="/property/" aria-label="Watchdog property lookup">'
  }
]);

await transform('property/partials/sidemenu.html', [
  {
    label: 'legacy desktop brand fallback',
    from: '<a class="db-side-brand" href="/property/dashboard" aria-label="Watchdog dashboard">',
    to: '<a class="db-side-brand" href="/property/" aria-label="Watchdog property lookup">'
  },
  {
    label: 'legacy mobile brand fallback',
    from: '<header><a class="wd-mobile-menu-brand" href="/property/dashboard">',
    to: '<header><a class="wd-mobile-menu-brand" href="/property/" aria-label="Watchdog property lookup">'
  }
]);

await transform('property/pro/index.html', [
  {
    label: 'soft-launch stylesheet',
    from: '  <link rel="stylesheet" href="/property/css/pro-buying-path.css">',
    to: '  <link rel="stylesheet" href="/property/css/pro-buying-path.css">\n  <link rel="stylesheet" href="/property/css/pro-soft-launch.css?v=20260911c">'
  },
  {
    label: 'hero billing note',
    from: '<p class="pro-fast-price-note">Annual plans cost the equivalent of ten monthly payments.</p>',
    to: '<p class="pro-fast-price-note">Monthly, annual and limited Founding Lifetime options are available.</p>'
  },
  {
    label: 'pricing heading and cadence',
    from: '<div class="pro-price-head pro-reveal"><span class="pro-kicker">Professional plans</span><h2>Choose the level that fits your work.</h2><p>Annual billing includes two months free compared with monthly billing for 12 months.</p><div class="pro-cadence" role="group" aria-label="Billing cadence"><button type="button" class="active" data-cadence="yearly" aria-pressed="true">Annual <span>2 months free</span></button><button type="button" data-cadence="monthly" aria-pressed="false">Monthly</button></div></div>',
    to: '<div class="pro-soft-launch-bar pro-reveal is-visible"><span class="pro-soft-launch-stamp"><i></i> Soft launch live</span><strong>Paid plans are open now.</strong><small>Founding Lifetime is limited and may be retired as Watchdog grows.</small></div><div class="pro-price-head pro-reveal"><span class="pro-kicker">Soft launch · enrollment open</span><h2>Choose how you want to pay.</h2><p>Monthly, annual, or a limited Founding Lifetime option. Same plan limits.</p><div class="pro-cadence" role="group" aria-label="Billing cadence"><button type="button" class="active" data-cadence="yearly" aria-pressed="true">Annual <span>2 months free</span></button><button type="button" data-cadence="monthly" aria-pressed="false">Monthly</button><button type="button" data-cadence="lifetime" aria-pressed="false">Lifetime <span>Founding</span></button></div></div>'
  },
  {
    label: 'agent live checkout CTA',
    from: '<a class="pro-price-cta" href="#launch-list" data-demo-plan="agent" data-demo-cadence="yearly">Join Agent launch list <i class="fas fa-arrow-right"></i></a>',
    to: '<a class="pro-price-cta" href="#" data-demo-plan="agent" data-demo-cadence="yearly" data-billing-plan="agent" data-billing-cadence="yearly">Choose Agent <i class="fas fa-arrow-right"></i></a>'
  },
  {
    label: 'pro live checkout CTA',
    from: '<a class="pro-price-cta" href="#launch-list" data-demo-plan="pro" data-demo-cadence="yearly">Join Pro launch list <i class="fas fa-arrow-right"></i></a>',
    to: '<a class="pro-price-cta" href="#" data-demo-plan="pro" data-demo-cadence="yearly" data-billing-plan="pro" data-billing-cadence="yearly">Choose Pro <i class="fas fa-arrow-right"></i></a>'
  },
  {
    label: 'pro plus live checkout CTA',
    from: '<a class="pro-price-cta" href="#launch-list" data-demo-plan="pro_plus" data-demo-cadence="yearly">Join Pro+ launch list <i class="fas fa-arrow-right"></i></a>',
    to: '<a class="pro-price-cta" href="#" data-demo-plan="pro_plus" data-demo-cadence="yearly" data-billing-plan="pro_plus" data-billing-cadence="yearly">Choose Pro+ <i class="fas fa-arrow-right"></i></a>'
  },
  {
    label: 'open enrollment note',
    from: '<p class="pro-checkout-note"><i class="fas fa-calendar-check"></i>Paid enrollment is scheduled to open September 16. Join the launch list to be notified.</p>',
    to: '<p class="pro-checkout-note"><i class="fas fa-circle-check"></i>Paid enrollment is open for Agent, Pro and Pro+. Teams stays request-only.</p>'
  },
  {
    label: 'plan fit FAQ',
    from: '<article class="pro-faq-card pro-reveal"><i class="fas fa-comments"></i><h3>Not sure which plan fits?</h3><p>Tell us your role and approximate property volume when you join the launch list.</p></article>',
    to: '<article class="pro-faq-card pro-reveal"><i class="fas fa-comments"></i><h3>Not sure which plan fits?</h3><p>Start with your expected property volume, or send us a plan question below.</p></article>'
  },
  {
    label: 'trial FAQ',
    from: '<article class="pro-faq-card new-buyer-question pro-reveal" data-faq-added="trial"><i class="fas fa-hourglass-half"></i><h3>Is there a free trial?</h3><p>Not yet. Property lookup remains free.</p></article>',
    to: '<article class="pro-faq-card new-buyer-question pro-reveal" data-faq-added="trial"><i class="fas fa-hourglass-half"></i><h3>Is there a free trial?</h3><p>Property lookup is free. Paid professional plans start when you check out.</p></article>'
  },
  {
    label: 'plan help section copy',
    from: '<section class="pro-section pro-demo" id="demo"><div class="pro-wrap pro-demo-grid">\n      <div class="pro-demo-copy pro-reveal"><span class="pro-kicker">September 16 launch list</span><h2>Get the launch notice.</h2><p>Tell us your role and plan interest. We will email you when paid enrollment opens.</p><div class="pro-demo-proof"><span><i class="fas fa-lock"></i> No payment required</span><span><i class="fas fa-layer-group"></i> Agent · Pro · Pro+</span><span><i class="fas fa-envelope"></i> Launch notice by email</span></div><a href="/property/">Run a property first <i class="fas fa-arrow-right"></i></a></div>',
    to: '<section class="pro-section pro-demo is-soft-launch" id="demo"><div class="pro-wrap pro-demo-grid">\n      <div class="pro-demo-copy pro-reveal"><span class="pro-kicker">Need help choosing?</span><h2>Ask a plan question.</h2><p>Tell us what you do and roughly how many properties you work with. We will point you to the closest fit.</p><div class="pro-demo-proof"><span><i class="fas fa-circle-info"></i> Straight answer</span><span><i class="fas fa-layer-group"></i> Agent · Pro · Pro+</span><span><i class="fas fa-envelope"></i> Reply by email</span></div><a href="/property/">Run a property first <i class="fas fa-arrow-right"></i></a></div>'
  },
  {
    label: 'plan help source',
    from: '<input type="hidden" name="source" value="paid-launch-list">',
    to: '<input type="hidden" name="source" value="paid-soft-launch-plan-help">'
  },
  {
    label: 'plan help submit',
    from: '<button type="submit" class="pro-demo-submit">Join the launch list <i class="fas fa-arrow-right"></i></button>',
    to: '<button type="submit" class="pro-demo-submit">Ask about plans <i class="fas fa-arrow-right"></i></button>'
  },
  {
    label: 'plan help privacy',
    from: '<p class="pro-form-privacy">By submitting, you agree to be contacted about Watchdog paid-plan availability. No payment information is collected here.</p>',
    to: '<p class="pro-form-privacy">We use this only to reply about Watchdog plans. No payment information is collected here.</p>'
  }
]);

await transform('property/js/pro.js', [
  {
    label: 'lifetime cadence owned by lifetime controller',
    from: "buttons.forEach(function(b){b.addEventListener('click',function(){set(b.dataset.cadence,true);});});set('yearly',false);",
    to: "buttons.forEach(function(b){b.addEventListener('click',function(){if(b.dataset.cadence==='lifetime')return;set(b.dataset.cadence,true);});});set('yearly',false);"
  },
  {
    label: 'soft-launch plan question success',
    from: "setStatus('You are on the launch list.','success');",
    to: "setStatus('Thanks. We will reply about the best-fit plan.','success');"
  }
]);

console.log('Live soft-launch UI prepared.');
