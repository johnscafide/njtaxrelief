#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const page = read('property/dashboard/index.html');
const css = read('property/css/dashboard/dashboard-mobile-polish-20260823.css');
const mobile = read('property/js/dashboard/dashboard-mobile-polish.js');
const voice = read('property/js/watchdog-intelligence-voice.js');

assert(page.includes('/property/css/dashboard/dashboard-mobile-polish-20260823.css'), 'Dashboard must load the mobile polish stylesheet.');
assert(page.includes('/property/js/dashboard/dashboard-mobile-polish.js'), 'Dashboard must load the mobile polish runtime.');
assert(css.includes('.wd7-add-property::before'), 'Mobile Add Property must expose a visible plus affordance.');
assert(css.includes('content:"+"'), 'Mobile Add Property affordance must render a plus sign.');
assert(css.includes('.wd4-weather-chip') && css.includes('display:inline-flex!important'), 'Mobile header weather must be visible.');
assert(mobile.includes('navigator.geolocation.getCurrentPosition'), 'Mobile header weather must request device location.');
assert(mobile.includes('api.weather.gov/points/'), 'Mobile device-location weather must retain the National Weather Service path.');
assert(mobile.includes('api.open-meteo.com/v1/forecast'), 'Mobile device-location weather must retain a bounded fallback provider.');
assert(mobile.includes("wdWeatherSource='device-location'"), 'Current-location weather must identify its source in the DOM.');
assert(voice.includes('function resolveClient()'), 'Voice must lazily resolve the signed-in runtime.');
assert(voice.includes('async function waitForClient()'), 'Voice must tolerate mobile auth/runtime startup races.');
assert(voice.includes('observePanel();\n    const existing'), 'Voice panel observation must start before auth runtime resolution completes.');
assert(css.includes('.dwa-compose-row>.dwa-voice-button'), 'Mobile contextual Voice button must have an explicit visible compose layout.');

if (failures.length) {
  console.error(JSON.stringify({ passed:false, contract:'dashboard-mobile-polish-20260823', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed:true,
  contract:'dashboard-mobile-polish-20260823',
  add_property_affordance:'plus',
  header_weather:'device_location_with_saved_property_fallback',
  voice_bootstrap:'observer_before_runtime_resolution',
  mobile_target_px:44
}, null, 2));
