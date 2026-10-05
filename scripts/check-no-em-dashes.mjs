import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TEXT = /\.(html?|css|js|mjs|cjs|json|svg|xml|txt|md|py|ts|tsx|swift|ya?ml|webmanifest|csv|tsv)$/i;
const SKIP = /(^|\/)(node_modules|__pycache__|supabase\/migrations)\/|\.sql$|^scripts\/check-no-em-dashes\.mjs$/;
const DASH = /\u2014|&mdash;|&#8212;|&#x2014;/i;

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((f) => TEXT.test(f) && !SKIP.test(f));
const hits = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (!DASH.test(text)) continue;
  text.split('\n').forEach((line, i) => { if (DASH.test(line)) hits.push(`${file}:${i + 1}`); });
}
if (hits.length) {
  console.error(`[no-em-dashes] ${hits.length} em dash(es) found. Use a comma, colon, period or hyphen instead:`);
  for (const hit of hits.slice(0, 200)) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`[no-em-dashes] PASS: ${files.length} files checked`);
