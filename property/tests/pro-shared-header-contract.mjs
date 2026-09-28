import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const [billing, banner, partial, autocomplete, pro] = await Promise.all([
  read('property/js/billing-client.js'),
  read('property/js/paid-launch-banner.js'),
  read('property/partials/paid-launch.html'),
  read('property/js/shared-nav-address-autocomplete.js'),
  read('property/js/pro.js')
]);

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(!/September 16|Sep 16/i.test(banner + partial), 'Retired paid-launch assets must not contain the September 16 enrollment date.');
assert(/shared-nav-address-autocomplete\.js/.test(billing), 'Pro billing runtime must load the shared nav address autocomplete.');
assert(!/paid-launch-banner\.js/.test(billing), 'Pro billing runtime must not load the retired paid-launch banner.');
const proPage = await read('property/pro/index.html');
assert(!/\/property\/partials\/nav\.html/.test(pro), 'Pro uses the current public Watchdog header, not the old nav fragment.');
assert(/<header class="wd-nav" id="wd-nav">/.test(proPage) && /<body class="wd-pro-page nav-solid">/.test(proPage) && /\/property\/js\/public-nav\.js/.test(proPage), 'Pro must use the same public Watchdog header and menu as the other public pages.');
assert(/wdn-address/.test(autocomplete), 'Shared nav autocomplete must bind the canonical Watchdog nav address input.');
assert(/AutocompleteSuggestion/.test(autocomplete) && /locationRestriction:NJ_BOUNDS/.test(autocomplete), 'Shared nav autocomplete must use the custom NJ-bounded Google Places suggestion path.');
assert(/includedPrimaryTypes:\['street_address','premise','subpremise'\]/.test(autocomplete), 'Shared nav autocomplete must remain property-address scoped.');
assert(!/border-left/i.test(autocomplete), 'New shared nav autocomplete presentation must not use border-left styling.');

console.log('Pro shared header contract passed.');
