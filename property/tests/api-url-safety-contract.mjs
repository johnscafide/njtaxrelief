import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('api');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:cjs|mjs|js)$/.test(entry.name) ? [full] : [];
  });
}

const legacyPatterns = [
  { name: 'url.parse()', re: /\burl\s*\.\s*parse\s*\(/g },
  { name: "require('url').parse()", re: /require\s*\(\s*['\"]url['\"]\s*\)\s*\.\s*parse\s*\(/g },
  { name: "require('node:url').parse()", re: /require\s*\(\s*['\"]node:url['\"]\s*\)\s*\.\s*parse\s*\(/g }
];

const violations = [];
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of legacyPatterns) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(source)) violations.push(`${file}: ${pattern.name}`);
  }
}

if (violations.length) {
  console.error('Legacy Node URL parsing is prohibited in Watchdog-owned API routes. Use the WHATWG URL / URLSearchParams APIs instead.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`API URL safety contract passed across ${walk(root).length} route files.`);
