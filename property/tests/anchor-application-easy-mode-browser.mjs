// Browser check for Easy mode on the 2025 application.
// Serves the repo locally, replaces Supabase with an in-page fake signed-in client
// (no network, no real data), then walks a PAS-1 homeowner through Easy mode and
// checks Standard mode's Easy mode offer and inline validation message.
//
//   npm install --no-save playwright
//   node property/tests/anchor-application-easy-mode-browser.mjs [output-dir]
//
// PLAYWRIGHT_CHROMIUM_PATH can point at a preinstalled Chromium.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const ROOT = resolve('.');
const OUT = resolve(process.argv[2] || join(tmpdir(), 'watchdog-easy-mode'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf' };

const FAKE_RUNTIME = `(function(){
  var user = { id: '11111111-1111-4111-8111-111111111111', email: 'easy-mode-test@example.com' };
  window.__rpcCalls = [];
  function done(data){ return Promise.resolve({ data: data, error: null }); }
  function table(){
    var op = 'select', payload = null, one = false, b = {};
    ['select','eq','in','order','limit','range','is','gte','lte','neq','match','not','or','filter','contains'].forEach(function(k){ b[k] = function(){ return b; }; });
    b.insert = function(p){ op = 'insert'; payload = p; return b; };
    b.upsert = function(p){ op = 'upsert'; payload = p; return b; };
    b.update = function(p){ op = 'update'; payload = p; return b; };
    b.delete = function(){ op = 'delete'; return b; };
    b.single = b.maybeSingle = function(){ one = true; return b; };
    b.then = function(res, rej){
      var data = one ? null : [];
      if (op === 'insert' || op === 'upsert') {
        var now = new Date().toISOString();
        data = Array.isArray(payload) ? payload : Object.assign({ created_at: now, updated_at: now }, payload);
        if (!one && !Array.isArray(data)) data = [data];
      }
      return done(data).then(res, rej);
    };
    return b;
  }
  var client = {
    auth: {
      getUser: function(){ return done({ user: user }); },
      getSession: function(){ return done({ session: { user: user, access_token: 'test' } }); },
      onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; },
      signInWithOtp: function(){ return done({}); },
      verifyOtp: function(){ return done({ user: user }); }
    },
    from: table,
    rpc: function(name, args){ window.__rpcCalls.push({ name: name, args: args }); return done(null); },
    storage: { from: function(){ return { upload: function(){ return done({ path: 'x' }); }, remove: function(){ return done([]); }, download: function(){ return done(null); } }; } },
    functions: { invoke: function(){ return done(null); } }
  };
  window.NJPTRSupabaseRuntime = { createClient: function(){ return client; }, environment: 'test' };
  window.supabase = { createClient: function(){ return client; } };
})();`;

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch (err) {
      res.writeHead(500); res.end(String(err));
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function openPage(browser, base, viewport, mode) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      if (url.pathname === '/property/js/supabase-runtime.js') return route.fulfill({ contentType: 'text/javascript', body: FAKE_RUNTIME });
      return route.continue();
    }
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript', body: '' });
    return route.abort();
  });
  if (mode) await context.addInitScript((m) => { try { localStorage.setItem('wd_anchor_2025_mode', m); } catch (_) {} }, mode);
  await page.goto(`${base}/property/anchor/application/2025/`, { waitUntil: 'load' });
  await page.waitForSelector('.wd-step[data-step="welcome"] [data-readiness]', { timeout: 15000 });
  return { page, context, errors };
}

const active = '.wd-step.is-active';
async function question(page) {
  return (await page.locator(`${active} .wd-easy-q`).textContent()).trim();
}
async function expectQuestion(page, text) {
  await page.waitForFunction((t) => {
    const q = document.querySelector('.wd-step.is-active .wd-easy-q');
    return q && q.textContent.includes(t);
  }, text, { timeout: 8000 });
}
async function expectStep(page, id) {
  await page.waitForSelector(`.wd-step.is-active[data-step="${id}"]`, { timeout: 8000 });
}
async function choose(page, path, value) {
  await page.locator(`${active} [data-choice="${path}"] [data-value="${value}"]`).click();
}
async function easyNext(page) {
  await page.locator(`${active} .wd-easy-next`).click();
}
async function audit(page, name, findings) {
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const visible = (n) => { const r = n.getBoundingClientRect(); const s = getComputedStyle(n); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [], targets = [];
    document.querySelectorAll('.wd-easy-head *, .wd-easy-help *, .wd-easy-actions *, .wd-easy-bar *, .wd-easy-chooser *, .wd-easy-nudge *, .wd-easy-note, .wd-easy-step-error').forEach((n) => {
      if (!visible(n)) return;
      const own = Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim());
      if (own && parseFloat(getComputedStyle(n).fontSize) < 12) small.push(n.className || n.tagName);
      if ((n.tagName === 'BUTTON' || n.tagName === 'A') && n.getBoundingClientRect().height < 43.5) targets.push(n.className || n.textContent.trim());
    });
    const questions = Array.from(document.querySelectorAll('.wd-step.is-active .wd-easy-q')).filter(visible).length;
    return { overflow, small, targets, questions };
  });
  assert.ok(result.overflow <= 1, `${name}: page scrolls sideways by ${result.overflow}px`);
  assert.ok(result.questions <= 1, `${name}: more than one Easy mode question visible`);
  if (result.small.length) findings.push(`${name}: text under 12px: ${result.small.join(', ')}`);
  if (result.targets.length) findings.push(`${name}: touch target under 44px: ${result.targets.join(', ')}`);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  // What a phone actually shows at the bottom of the step, with fixed bars in place.
  const covered = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const btn = Array.from(document.querySelectorAll('.wd-step.is-active .wd-easy-next, .wd-step.is-active > .wd-step-actions [data-next]'))
      .find((b) => b.getBoundingClientRect().height > 0);
    if (!btn) return '';
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top && !btn.contains(top) ? (top.className || top.tagName) : '';
  });
  await page.screenshot({ path: join(OUT, `${name}-bottom.png`) });
  if (covered) findings.push(`${name}: Continue button covered by ${covered}`);
}

async function easyWalkthrough(browser, base, viewport, label, findings) {
  const { page, context, errors } = await openPage(browser, base, viewport);
  const shot = (n) => audit(page, `${label}-${n}`, findings);
  await withDiagnostics(page, errors, label, async () => {

  // Welcome: choose Easy mode.
  await page.waitForSelector('.wd-easy-chooser');
  await shot('01-welcome');
  await page.locator('.wd-easy-chooser input[value="easy"]').check();
  assert.equal(await page.evaluate(() => localStorage.getItem('wd_anchor_2025_mode')), 'easy');
  assert.ok(await page.evaluate(() => document.body.classList.contains('wd-easy-mode')));
  for (const box of await page.locator('.wd-step[data-step="welcome"] [data-readiness]').all()) await box.check();
  await page.locator(`${active} [data-next]`).click();

  // Account and vault keep their own buttons, with plain-language help added.
  await expectStep(page, 'account');
  assert.ok(await page.locator(`${active} .wd-easy-help`).isVisible());
  await shot('02-account');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await expectStep(page, 'vault');
  await page.locator('#wd-recovery-confirm').check();
  await page.locator(`${active} [data-next]:not([disabled])`).click();

  // One question at a time.
  await expectQuestion(page, 'How did you file');
  assert.equal(await page.locator(`${active} .wd-field-error`).count(), 0, 'a new step starts without error messages');
  await page.locator(`${active} .wd-why-button[data-why-step="profile"]`).waitFor({ state: 'visible' });
  await shot('03-filing-status');
  await easyNext(page);
  assert.match(await page.locator(`${active} .wd-easy-note`).textContent(), /filing status/i, 'empty answer should explain what is missing');
  await page.selectOption('#filing-status', 'A');
  await easyNext(page);
  await expectQuestion(page, 'What year were you born');
  assert.equal(await page.locator(`${active} .wd-why-button[data-why-step="profile"]`).isVisible(), false, 'help button stays with its own question');
  await page.fill('#birth-self', '1955');
  await easyNext(page);

  await expectQuestion(page, 'Social Security Disability');
  await shot('04-disability');
  // Back from the first question of a step lands on the last question of the previous step.
  await page.locator(`${active} .wd-easy-back`).click();
  await expectQuestion(page, 'What year were you born');
  await easyNext(page);
  await expectQuestion(page, 'Social Security Disability');
  await choose(page, 'applicant.ssd_2025', 'no');
  await easyNext(page);
  await expectQuestion(page, 'Railroad Retirement');
  await choose(page, 'applicant.railroad_disability_2025', 'no');
  await easyNext(page);

  await expectStep(page, 'route');
  await page.waitForFunction(() => /PAS-1/.test(document.querySelector('#wd-route-badge').textContent));
  assert.equal(await page.locator(`${active} .wd-easy-nudge`).count(), 0, 'no Easy mode offer while already in Easy mode');
  await shot('05-route');
  await page.locator(`${active} [data-next]`).click();

  await expectQuestion(page, 'full name');
  // Switching Easy mode off shows the whole step again; switching back resumes.
  await page.locator('.wd-easy-switch').click();
  assert.equal(await page.locator(`${active} .wd-easy-off`).count(), 0, 'Standard mode shows every field');
  assert.ok(await page.locator(`${active} > .wd-step-actions`).isVisible());
  await page.locator('.wd-easy-switch').click();
  await expectQuestion(page, 'full name');
  await page.fill('input[name="applicant.first"]', 'Pat');
  await page.fill('input[name="applicant.last"]', 'Sample');
  await easyNext(page);

  await expectQuestion(page, 'address of your New Jersey home');
  await page.fill('input[name="mailing.address"]', '1 Sample Street');
  await page.fill('input[name="mailing.city"]', 'Sampletown');
  await page.fill('input[name="mailing.zip"]', '08000');
  await easyNext(page);
  await expectQuestion(page, '4-digit code');
  await shot('06-town-code');
  await page.fill('input[name="mailing.municipality_code"]', '0408');
  await easyNext(page);
  await expectQuestion(page, 'October 1, 2025, did you live');
  await choose(page, 'oct1.different', 'no');
  await easyNext(page);

  await expectQuestion(page, 'Social Security number');
  await page.fill('#ssn-self', '12345');
  await easyNext(page);
  assert.match(await page.locator(`${active} .wd-easy-note`).textContent(), /9-digit/);
  await page.fill('#ssn-self', '123456789');
  await shot('07-ssn');
  await easyNext(page);

  await expectQuestion(page, 'main home on October 1');
  await choose(page, 'resident_oct1', 'yes');
  await easyNext(page);
  await expectQuestion(page, 'own or rent');
  await page.locator(`${active} [data-value="homeowner"]`).click();
  await easyNext(page);

  await expectQuestion(page, 'same New Jersey home for all of 2025');
  // A Yes opens follow-up questions, which must not appear on this screen.
  await choose(page, 'pas.owned_same_home_all_2025', 'yes');
  assert.equal(await page.locator(`${active} [data-choice="pas.same_home_last_year"]`).isVisible(), false, 'follow-up waits for its own screen');
  await shot('08-home-history');
  await easyNext(page);
  await expectQuestion(page, 'last time you got property tax relief');
  await choose(page, 'pas.same_home_last_year', 'yes');
  await easyNext(page);
  await expectQuestion(page, 'December 31, 2022');
  await choose(page, 'pas.same_home_as_2022', 'yes');
  await easyNext(page);
  await expectQuestion(page, 'during 2023');
  await choose(page, 'pas.moved_to_current_home_2023', 'no');
  await easyNext(page);

  await expectQuestion(page, 'Block and Lot');
  await shot('09-block-lot');
  await page.fill('input[name="property.block"]', '12');
  await page.fill('input[name="property.lot"]', '3');
  await easyNext(page);
  await expectQuestion(page, 'own part of this home in 2024 or 2025');
  await choose(page, 'property.shared_ownership_2024', 'no');
  await easyNext(page);
  assert.match(await page.locator(`${active} .wd-easy-note`).textContent(), /choose an answer/i);
  await choose(page, 'property.shared_ownership_2025', 'no');
  await easyNext(page);
  await expectQuestion(page, 'more than one unit');
  await choose(page, 'property.multiple_units_2024', 'no');
  await choose(page, 'property.multiple_units_2025', 'no');
  await easyNext(page);
  await expectQuestion(page, 'more than one lot');
  await choose(page, 'property.additional_lots', 'no');
  await easyNext(page);
  await expectQuestion(page, 'property tax was billed');
  await shot('10-property-tax');
  await page.fill('[data-form-only-inline="pas-1"] input[name="property.tax_2024"]', '5200');
  await page.fill('[data-form-only-inline="pas-1"] input[name="property.tax_2025"]', '5400.50');
  await easyNext(page);
  await expectQuestion(page, 'PILOT');
  await choose(page, 'property.pilot_agreement', 'no');
  await easyNext(page);
  await expectQuestion(page, 'co-op');
  await easyNext(page);

  const income = { a: ['30000', '31000'], b: ['0', '0'], c: ['0', '0'], d: ['0', '0'], e: ['18000', '18500'] };
  await expectQuestion(page, 'total income in 2024 and in 2025');
  await shot('11-income');
  for (const [line, [y24, y25]] of Object.entries(income)) {
    await page.fill(`input[name="income_2024.${line}"]`, y24);
    await page.fill(`input[name="income_2025.${line}"]`, y25);
    await easyNext(page);
  }

  await expectQuestion(page, 'How can the State reach you');
  await easyNext(page);
  await expectQuestion(page, 'passed away');
  await easyNext(page);
  await expectQuestion(page, 'Who is filling out');
  await shot('12-preparer');
  await easyNext(page);

  await expectStep(page, 'review');
  assert.ok(await page.locator(`${active} .wd-easy-help`).isVisible());
  await shot('13-review');

  const events = await page.evaluate(() => window.__rpcCalls.filter((c) => c.name === 'record_my_anchor_funnel_event').map((c) => c.args.p_event_name));
  for (const e of ['easy_mode_used', 'step_profile', 'step_property', 'step_pas_income', 'step_finish']) {
    assert.ok(events.includes(e), `${label}: expected funnel event ${e}`);
  }
  assert.deepEqual(errors, [], `${label}: page errors`);
  });
  await context.close();
}

async function standardChecks(browser, base, viewport, label, findings) {
  const { page, context, errors } = await openPage(browser, base, viewport, 'standard');
  await withDiagnostics(page, errors, label, async () => {
  assert.equal(await page.evaluate(() => document.body.classList.contains('wd-easy-mode')), false);
  for (const box of await page.locator('.wd-step[data-step="welcome"] [data-readiness]').all()) await box.check();
  await page.locator(`${active} [data-next]`).click();
  await expectStep(page, 'account');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await expectStep(page, 'vault');
  await page.locator('#wd-recovery-confirm').check();
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await expectStep(page, 'profile');
  await page.waitForTimeout(100);
  assert.equal(await page.locator(`${active} .wd-field-error`).count(), 0, 'a new step starts without error messages');
  await page.selectOption('#filing-status', 'A');
  await page.fill('#birth-self', '1950');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await choose(page, 'applicant.ssd_2025', 'no');
  await choose(page, 'applicant.railroad_disability_2025', 'no');
  await page.locator(`${active} [data-next]:not([disabled])`).click();

  // PAS-1 applicants in Standard mode are offered Easy mode.
  await expectStep(page, 'route');
  await page.waitForSelector(`${active} .wd-easy-nudge`);
  await audit(page, `${label}-01-route-offer`, findings);
  await page.locator(`${active} .wd-easy-nudge .wd-btn.ghost`).click();
  assert.equal(await page.locator('.wd-easy-nudge').count(), 0);
  await page.locator(`${active} [data-next]`).click();

  await page.fill('input[name="applicant.first"]', 'Pat');
  await page.fill('input[name="applicant.last"]', 'Sample');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await page.fill('input[name="mailing.address"]', '1 Sample Street');
  await page.fill('input[name="mailing.city"]', 'Sampletown');
  await page.fill('input[name="mailing.zip"]', '08000');
  await page.fill('input[name="mailing.municipality_code"]', '0408');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await page.fill('#ssn-self', '123456789');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await choose(page, 'resident_oct1', 'yes');
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await page.locator(`${active} [data-value="homeowner"]`).click();
  await page.locator(`${active} [data-next]:not([disabled])`).click();
  await choose(page, 'pas.owned_same_home_all_2025', 'yes');
  await choose(page, 'pas.same_home_last_year', 'yes');
  await choose(page, 'pas.same_home_as_2022', 'yes');
  await choose(page, 'pas.moved_to_current_home_2023', 'no');
  await page.locator(`${active} [data-next]`).click();

  // Pressing Continue with missing answers shows the reason beside the button, not only at the top.
  await expectStep(page, 'property');
  await page.locator(`${active} > .wd-step-actions [data-next]`).click();
  const inline = page.locator(`${active} .wd-easy-step-error`);
  await inline.waitFor({ state: 'visible' });
  assert.match(await inline.textContent(), /Block and Lot/);
  assert.ok(await inline.evaluate((n) => n.nextElementSibling && n.nextElementSibling.matches('.wd-step-actions')));
  await page.locator(`${active} > .wd-step-actions [data-next]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, `${label}-02-inline-error.png`) });

  assert.deepEqual(errors, [], `${label}: page errors`);
  });
  await context.close();
}

async function withDiagnostics(page, errors, label, run) {
  try {
    await run();
  } catch (err) {
    const state = await page.evaluate(() => ({
      step: (document.querySelector('.wd-step.is-active') || {}).dataset?.step,
      question: (document.querySelector('.wd-step.is-active .wd-easy-q') || {}).textContent,
      note: (document.querySelector('.wd-step.is-active .wd-easy-note') || {}).textContent,
      status: (document.querySelector('#wd-app-status') || {}).textContent,
    })).catch(() => ({}));
    await page.screenshot({ path: join(OUT, `${label}-FAILED.png`), fullPage: true }).catch(() => {});
    err.message += `\n${label} state: ${JSON.stringify(state)}\npage errors: ${JSON.stringify(errors)}`;
    throw err;
  }
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const findings = [];
try {
  for (const [label, viewport] of [['mobile-390', { width: 390, height: 844 }], ['mobile-320', { width: 320, height: 700 }], ['desktop-1440', { width: 1440, height: 900 }]]) {
    await easyWalkthrough(browser, base, viewport, `easy-${label}`, findings);
    await standardChecks(browser, base, viewport, `standard-${label}`, findings);
  }
} finally {
  await browser.close();
  server.close();
}
if (findings.length) console.log('Review findings:\n- ' + findings.join('\n- '));
console.log(`ANCHOR 2025 Easy mode browser check passed. Screenshots: ${OUT}`);
