import fs from 'node:fs';
import vm from 'node:vm';

const files = {
  js: 'property/js/intelligence-today.js',
  css: 'property/css/intelligence-today.css',
  page: 'property/intelligence/daily/index.html',
  migration: 'supabase/migrations/20260819113000_watchdog_intelligence_today_inbox_events.sql'
};
const read = key => fs.readFileSync(files[key], 'utf8');
const js = read('js');
const css = read('css');
const page = read('page');
const migration = read('migration');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

new vm.Script(js, { filename: files.js });

expect(page.includes('/property/js/intelligence-today.js'), 'Daily Intelligence must load the Today inbox runtime.');
expect(page.includes('/property/css/intelligence-today.css'), 'Daily Intelligence must load the Today inbox styles.');
expect(js.includes("from('intelligence_daily_digests')"), 'Today inbox must remain grounded in governed Daily Intelligence digests.');
expect(js.includes("from('intelligence_today_events')"), 'Today inbox must persist triage state as owner-scoped events.');
expect(js.includes("from('intelligence_intent_events')"), 'Today inbox actions must feed the reconstructable Context Graph event trail.');
expect(js.includes("active_job,active_job_confidence"), 'Today inbox must read the actual Intent State confidence field.');
expect(!js.includes("select('active_job,confidence"), 'Today inbox must not query the obsolete/nonexistent confidence field.');
for (const action of ['reviewed','snoozed','dismissed','reopened']) {
  expect(js.includes(`'${action}'`) || js.includes(`===\"${action}\"`), `Missing Today inbox action: ${action}.`);
  expect(migration.includes(`'${action}'`), `Migration must constrain Today event action: ${action}.`);
}
expect(js.includes('A new digest creates a new review item'), 'Handled items must become reviewable again when a new governed digest creates new evidence.');
expect(js.includes('Model score is not action certainty'), 'Today inbox must explicitly distinguish model score from action certainty.');
expect(js.includes("fact_class:'observed'"), 'Triage actions must be logged as observed user actions, not inferred intent or property truth.');
expect(js.includes("context_key:'daily-intelligence:today'"), 'Today actions need a stable Context Graph context key.');
expect(migration.includes('alter table public.intelligence_today_events enable row level security'), 'Today events must have RLS enabled.');
expect(migration.includes('using ((select auth.uid()) = user_id)'), 'Today event reads must be owner-scoped.');
expect(migration.includes('with check ((select auth.uid()) = user_id)'), 'Today event inserts must be owner-scoped.');
expect(migration.includes('revoke update, delete on table public.intelligence_today_events from authenticated'), 'Today history must remain append-only for authenticated users.');
expect(migration.includes('Never treat client-supplied metadata as property truth or model evidence'), 'Today event metadata must be explicitly non-authoritative.');
expect(css.includes('.wdi-today-stats'), 'Today inbox needs a visible triage summary.');
expect(css.includes('.wdi-today-actions'), 'Today inbox needs actionable triage controls.');
for (const [key, content] of Object.entries({ js, css, page })) {
  expect(!content.includes('?v='), `${files[key]} must not introduce ?v= asset version parameters.`);
}

console.log('Daily Intelligence Today inbox, RLS, Context Graph, triage, and safety contracts passed.');
