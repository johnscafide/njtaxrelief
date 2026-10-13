import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The home page loads the trimmed icon set from property/assets/icons.
// If code now uses an icon that isn't in it, point the home page back at the
// full cdnjs set for this build so nothing shows up blank, and say so.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = path.join(ROOT, 'property', 'index.html');
const SUBSET_LINK = '<link rel="stylesheet" href="/property/assets/icons/icons.css" media="print" onload="this.media=\'all\'">';
const FULL_LINK = '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" media="print" onload="this.media=\'all\'">';

const { icons, all } = JSON.parse(readFileSync(path.join(ROOT, 'property', 'assets', 'icons', 'icons.json'), 'utf8'));
const kept = new Set(icons);
const known = new Set(all);

function walk(dir, out = []) {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', '.vercel', '.next', 'pagefind'].includes(entry.name)) continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

let files;
try {
  files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  files = walk('');
}
const missing = new Map();
for (const name of files) {
  if (!/\.(js|mjs|html|css)$/.test(name) || name.includes('/tests/') || name.startsWith('property/assets/icons/')) continue;
  const file = path.join(ROOT, name);
  try {
    if (statSync(file).size > 3_000_000) continue;
  } catch {
    continue;
  }
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bfa-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
    const icon = match[1];
    if (known.has(icon) && !kept.has(icon) && !missing.has(icon)) missing.set(icon, name);
  }
}

const html = readFileSync(HOME, 'utf8');
if (!html.includes(SUBSET_LINK)) {
  console.log('Icon subset: home page does not use the trimmed icon set, nothing to check.');
} else if (missing.size) {
  writeFileSync(HOME, html.replace(SUBSET_LINK, FULL_LINK), 'utf8');
  console.warn(`Icon subset: ${missing.size} icon(s) are not in property/assets/icons, so this build uses the full Font Awesome set on the home page.`);
  for (const [icon, file] of missing) console.warn(`  fa-${icon} (${file})`);
  console.warn('Run python3 scripts/build-icon-subset.py to rebuild the trimmed set.');
} else {
  console.log(`Icon subset: all ${kept.size} icons the code uses are in the trimmed set.`);
}
