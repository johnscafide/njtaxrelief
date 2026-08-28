import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'property/analytics/web-signals/index.html');
let html = await readFile(target, 'utf8');
const MARKER = 'data-seo-growth-ui="weekly-acquisition"';

// Keep HTML escaping correct in the deployed developer console.
html = html.replace("'\"':'&quot'", "'\"':'&quot;'");

if (!html.includes(MARKER)) {
  const anchor = '<div class="split"><div><h3>Top queries</h3><div id="gsc-queries" class="empty">—</div></div><div><h3>Top pages</h3><div id="gsc-pages" class="empty">—</div></div></div>';
  if (!html.includes(anchor)) throw new Error('Web Signals query/page split anchor missing');
  const growth = `<div class="split" ${MARKER}><div><h3>Weekly movement</h3><div id="gsc-weekly" class="notice">Building the first weekly baseline…</div></div><div><h3>Organic acquisition</h3><div id="organic-funnel" class="notice">Loading privacy-scoped organic sessions…</div></div></div>`;
  html = html.replace(anchor, growth + anchor);

  const jsAnchor = 'function renderGsc(g){';
  if (!html.includes(jsAnchor)) throw new Error('Web Signals renderGsc anchor missing');
  const growthJs = `function signed(v,d){var n=Number(v);if(!Number.isFinite(n))return '—';return (n>0?'+':'')+n.toFixed(d==null?1:d);}\nfunction renderWeekly(g){\n var out=document.getElementById('gsc-weekly'),w=g&&g.weekly_movement;if(!out)return;\n if(!w||w.available!==true){out.className='notice';out.textContent=(w&&w.note)||'Weekly movement will appear after a Search Console snapshot at least six days older exists.';return;}\n var s=w.summary||{},m=(w.queries||[]).filter(function(x){return x.position_change!=null;}).sort(function(a,b){return Math.abs(Number(b.position_change))-Math.abs(Number(a.position_change));}).slice(0,6);\n out.className='notice';out.innerHTML='<b>'+esc(w.previous_date)+' → '+esc(w.current_date)+'</b><br>'+esc(String(s.page_one_queries||0))+' page-one query rows now · '+esc(String(s.quick_win_queries||0))+' quick-win rows · '+esc(String(s.tracked_with_weekly_baseline||0))+' with weekly baseline'+(m.length?'<div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>Query</th><th>Pos</th><th>Move</th></tr></thead><tbody>'+m.map(function(x){return '<tr>'+td(x.key,'wrap')+td(num(x.position,1),'num')+td(signed(x.position_change,1),'num')+'</tr>';}).join('')+'</tbody></table></div>':'');\n}\nfunction renderOrganic(f){\n var out=document.getElementById('organic-funnel');if(!out)return;if(!f||f.status!=='ok'){out.className='notice';out.textContent=(f&&f.error)||'Organic acquisition data is not available yet.';return;}\n var t=f.totals||{};out.className='notice';out.innerHTML='<div class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))">'+[card('Organic sessions',num(t.organic_sessions),'28 days'),card('Lookup opened',num(t.property_lookup_opened_sessions),pct(t.lookup_open_rate)),card('Lookup started',num(t.property_lookup_started_sessions),pct(t.lookup_start_rate)),card('Meaningful action',num(t.meaningful_action_sessions),pct(t.meaningful_action_rate))].join('')+'</div><p class="muted">'+esc(f.range_start||'')+' → '+esc(f.range_end||'')+' · aggregate external sessions only; no address or property-search text.</p>';\n}\n`;
  html = html.replace(jsAnchor, growthJs + jsAnchor);
}

const oldInvoke = "client.functions.invoke('product-analytics-report',{body:{external_signals_only:true}})";
const newInvoke = "client.functions.invoke('seo-growth-report',{body:{}})";
if (html.includes(oldInvoke)) html = html.replace(oldInvoke, newInvoke);
else if (!html.includes(newInvoke)) throw new Error('Web Signals report invocation anchor missing');

const oldRender = 'var d=r.data.external_signals||{};renderGsc(d.search_console);renderPsi(d.pagespeed);';
const newRender = 'var d=r.data.external_signals||{};renderGsc(d.search_console);renderWeekly(d.search_console);renderOrganic(d.organic_search_funnel);renderPsi(d.pagespeed);';
if (html.includes(oldRender)) html = html.replace(oldRender, newRender);
else if (!html.includes('renderOrganic(d.organic_search_funnel)')) throw new Error('Web Signals render pipeline anchor missing');

await writeFile(target, html, 'utf8');
console.log('Web Signals SEO growth UI prepared: weekly Search Console movement + organic acquisition funnel.');
