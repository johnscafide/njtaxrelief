#!/usr/bin/env node
import fs from 'node:fs';

function must(value, message) {
  if (!value) throw new Error(message);
}

const publicNav = fs.readFileSync('property/js/public-nav.js', 'utf8');
const contactPolicy = fs.readFileSync('property/js/contact-routing-policy.js', 'utf8');
const contactSafe = fs.readFileSync('api/watchdog-index-page-contact-safe.js', 'utf8');

must(
  publicNav.includes('Never hide/translate the sheet during an anchor\'s activation event.'),
  'Public nav must preserve WebKit anchor activation semantics.'
);
must(
  !/var\s+link\s*=.*closest\(['"]a\[href\]['"]\)[\s\S]{0,120}if\s*\(link\)\s*close\s*\(/.test(publicNav),
  'Public nav must not close the profile sheet during the same anchor click.'
);

must(
  contactPolicy.includes('normalize(document, true);'),
  'Contact policy must perform one initial full-document normalization.'
);
must(
  contactPolicy.includes('scopes.forEach(function (scope) { normalize(scope, false); });'),
  'Contact policy mutation handling must be scoped to added DOM regions.'
);
must(
  !contactPolicy.includes('queueNormalize'),
  'Contact policy must not schedule full-document normalization after every DOM mutation.'
);

must(
  contactSafe.includes('function applyCanonicalRuntimeDiet(input, publicPath)'),
  'Canonical Watchdog adapter must own the bounded Index runtime diet.'
);
must(
  contactSafe.includes('watchdog-clean-route-runtime'),
  'Canonical runtime diet must strip the production-only clean-route browser runtime.'
);
must(
  contactSafe.includes('/scripts\\.js'),
  'Canonical Index asset diet must remove the historical root scripts.js runtime.'
);
must(
  contactSafe.includes('safeBody = applyCanonicalRuntimeDiet(safeBody, publicPath);'),
  'Canonical runtime diet must execute before the response is returned.'
);

console.log('Index asset diet and profile interaction contracts passed.');
