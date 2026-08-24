import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const propertyRoot = path.resolve(here, '..');
const repoRoot = path.resolve(propertyRoot, '..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const guardPath = 'property/js/ownership-verification.js';
const guard = read(guardPath);
assert(guard.includes('__watchdogStreetViewCostGuard'), 'Street View cost guard is missing');
assert(guard.includes('maps') && guard.includes('googleapis') && guard.includes('streetview'),
  'Street View guard matcher is missing');
assert(guard.includes('data-fallback'), 'Street View guard must preserve a non-Google image fallback when available');

const freeGrid = read('property/js/free-imagery-grid-runtime.js');
const supabaseRuntime = read('property/js/supabase-runtime.js');
const lookupSource = read('property/js/lookup.js');
assert(freeGrid.includes('maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export'),
  'Passive grid imagery must resolve to official NJ Office of GIS imagery');
assert(freeGrid.includes('DOMContentLoaded') && freeGrid.includes('reinforce') && freeGrid.includes('installHooks()'),
  'Free imagery translator must reinforce after the Street View guard is installed');
assert(supabaseRuntime.includes("document.write('<script src=\"/property/js/free-imagery-grid-runtime.js\""),
  'Public lookup boot must synchronously make the free imagery translator available');
assert(lookupSource.includes("(a.lat != null && a.lon != null) ? (a.lat + ',' + a.lon)"),
  'Neighborhood cards must prefer parcel coordinates so paid Street View URLs can be translated without geocoding');
assert(lookupSource.includes('lat: c.y, lon: c.x'),
  'Neighborhood parcel rows must retain centroid coordinates for free aerial imagery');

const lookupPage = read('property/index.html');
const lookupGuard = lookupPage.indexOf('/property/js/ownership-verification.js');
const lookupRuntime = lookupPage.indexOf('/property/js/lookup.js');
assert(lookupGuard >= 0 && lookupRuntime >= 0 && lookupGuard < lookupRuntime,
  'ownership-verification.js must load before lookup.js so the cost guard is active first');

const homePage = read('property/home/index.html');
const homeGuard = homePage.indexOf('/property/js/ownership-verification.js');
const homeRuntime = homePage.indexOf('/property/js/dashboard/home/index.js');
assert(homeGuard >= 0 && homeRuntime >= 0 && homeGuard < homeRuntime,
  'ownership-verification.js must load before Property Home so the cost guard is active first');

const dashboardPage = read('property/dashboard/index.html');
const scriptPattern = /<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi;
const dashboardScripts = [];
let match;
while ((match = scriptPattern.exec(dashboardPage))) {
  const src = match[1].split('?')[0];
  if (!src.startsWith('/property/js/')) continue;
  const rel = src.replace(/^\//, '');
  const abs = path.join(repoRoot, rel);
  if (fs.existsSync(abs)) dashboardScripts.push(rel);
}

for (const rel of dashboardScripts) {
  const source = read(rel);
  assert(!source.includes('maps.googleapis.com/maps/api/streetview'),
    `Current dashboard-loaded script must not create Static Street View requests: ${rel}`);
}

console.log(`Street View spend/fallback contract passed. Lookup grids keep free NJGIN imagery while ${dashboardScripts.length} current dashboard scripts remain free of Static Street View calls.`);
