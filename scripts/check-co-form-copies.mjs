#!/usr/bin/env node
// Weekly check for the town CO forms Watchdog keeps a saved copy of (property/data/co-forms/).
// Fails when a town's live form no longer matches the saved copy, so the map and copy get redone.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const forms = JSON.parse(readFileSync(new URL('../property/data/co-application-forms.json', import.meta.url), 'utf8')).forms;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WatchdogCO/1.0 (+https://www.watchdogindex.com/co)';
const changed = [];
for (const [code, f] of Object.entries(forms)) {
  if (!f.saved_copy) continue;
  try {
    const r = await fetch(f.url, { redirect: 'follow', headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!r.ok) console.log(`${code}: town site returned ${r.status}, can't check`);
    else if (digest !== f.sha256) changed.push(`${code}: ${f.title} changed (${f.url})`);
    else console.log(`${code}: unchanged`);
  } catch (e) {
    console.log(`${code}: town site didn't answer (${e.message}), can't check`);
  }
}
if (changed.length) { console.error(changed.join('\n')); process.exit(1); }
