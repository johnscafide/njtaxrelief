import { readFile, writeFile } from 'node:fs/promises';

async function update(path, fn) {
  const before = await readFile(path, 'utf8');
  const after = fn(before);
  if (after !== before) await writeFile(path, after, 'utf8');
}

function ensureBefore(text, marker, addition, label, path) {
  if (text.includes(addition.trim())) return text;
  if (!text.includes(marker)) throw new Error(`Property detail map transform could not find ${label} in ${path}`);
  return text.replace(marker, `${addition}${marker}`);
}

for (const path of ['property/index.html', 'property-lookup.html']) {
  await update(path, function(text) {
    text = text.split('Have me check it properly').join('Have Watchdog check the property');
    text = ensureBefore(
      text,
      '</head>',
      '  <link rel="stylesheet" href="/property/css/property-detail-map-view.css?v=20260911a">\n',
      'closing head',
      path
    );
    text = ensureBefore(
      text,
      '</body>',
      '<script src="/property/js/property-detail-map-view.js?v=20260911a"></script>\n',
      'closing body',
      path
    );
    return text;
  });
}

await update('property/js/lookup.js', function(text) {
  return text.split('Have me check it properly').join('Have Watchdog check the property');
});

console.log('Property detail map UI prepared.');
