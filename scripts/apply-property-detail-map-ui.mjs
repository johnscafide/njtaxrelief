import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to, label) {
  let text = await readFile(path, 'utf8');
  if (text.includes(to)) return;
  if (!text.includes(from)) throw new Error(`Property detail map transform could not find ${label} in ${path}`);
  text = text.replace(from, to);
  await writeFile(path, text, 'utf8');
}

async function replaceAll(path, from, to) {
  let text = await readFile(path, 'utf8');
  if (!text.includes(from)) return;
  text = text.split(from).join(to);
  await writeFile(path, text, 'utf8');
}

for (const path of ['property/index.html', 'property-lookup.html']) {
  await replaceOnce(
    path,
    '<link rel="stylesheet" href="/property/css/lookup.css">',
    '<link rel="stylesheet" href="/property/css/lookup.css">\n  <link rel="stylesheet" href="/property/css/property-detail-map-view.css?v=20260911a">',
    'property detail map stylesheet'
  );
  await replaceOnce(
    path,
    '<script src="/property/js/lookup.js"></script>',
    '<script src="/property/js/lookup.js"></script>\n<script src="/property/js/property-detail-map-view.js?v=20260911a"></script>',
    'property detail map runtime'
  );
  await replaceAll(path, 'Have me check it properly', 'Have Watchdog check the property');
}

await replaceAll('property/js/lookup.js', 'Have me check it properly', 'Have Watchdog check the property');

console.log('Property detail map UI prepared.');
