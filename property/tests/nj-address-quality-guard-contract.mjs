import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('property/js/nj-address-quality-guard.js', 'utf8');
let recentListener = null;
const document = {
  querySelectorAll() { return []; },
  getElementById() { return null; },
  addEventListener(name, fn) { if (name === 'watchdog:recent-property') recentListener = fn; },
  title: 'Watchdog'
};
const rpcClient = {
  rpc(name) {
    if (name === 'get_public_realtime_watchdog_scores') {
      return Promise.resolve({ data: [{ pams_pin:'x', watchdog_score:null, score_source:'insufficient_canonical_evidence' }], error:null });
    }
    return Promise.resolve({ data:[] });
  }
};
const calls = [];
async function baseFetch(input) {
  const url = String(input);
  calls.push(url);
  if (url.includes('findAddressCandidates')) {
    return new Response(JSON.stringify({ candidates:[{ address:'185 Indiana Ave, Blackwood, NJ', score:100, location:{ x:-75, y:39.8 } }] }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  if (url.includes('geometryType=esriGeometryPoint')) {
    return new Response(JSON.stringify({ features:[{ attributes:{ PAMS_PIN:'wrong', PROP_LOC:'189 INDIANA AVENUE' } }] }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  if (url.includes('geometryType=esriGeometryEnvelope')) {
    return new Response(JSON.stringify({ features:[{ attributes:{ PAMS_PIN:'right', PROP_LOC:'185 INDIANA AVENUE' } }, { attributes:{ PAMS_PIN:'wrong', PROP_LOC:'189 INDIANA AVENUE' } }] }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  throw new Error('Unexpected fetch: ' + url);
}

const location = { href:'https://njpropertytaxrelief.com/property/', pathname:'/property/', search:'', hash:'' };
const sandbox = {
  window:{
    fetch:baseFetch,
    NJPTRSupabaseRuntime:{ createClient(){ return rpcClient; } },
    plLookup(){ }
  },
  document,
  location,
  history:{ replaceState(){} },
  URL, URLSearchParams, Response, Headers, JSON, Number, String, Object, Array, Date, Promise, Math,
  setTimeout, clearTimeout, setInterval, clearInterval, console
};
sandbox.window.window = sandbox.window;
sandbox.window.document = document;
sandbox.window.location = location;

vm.runInNewContext(source, sandbox, { filename:'nj-address-quality-guard.js' });

const score = await rpcClient.rpc('get_public_realtime_watchdog_scores', { p_rows:[] });
assert.equal(Number.isNaN(score.data[0].watchdog_score), true, 'missing canonical score must stay non-numeric');

const geo = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates?SingleLine=' + encodeURIComponent('185 Indiana Ave, Blackwood, NJ') + '&outSR=4326&f=json';
await sandbox.window.fetch(geo).then(r => r.json());
await new Promise(resolve => setTimeout(resolve, 0));

const point = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query?geometry=' + encodeURIComponent(JSON.stringify({ x:-75, y:39.8, spatialReference:{ wkid:4326 } })) + '&geometryType=esriGeometryPoint&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&outFields=PAMS_PIN%2CPROP_LOC&returnGeometry=true&resultRecordCount=1&f=json';
const parcel = await sandbox.window.fetch(point).then(r => r.json());
assert.equal(parcel.features[0].attributes.PAMS_PIN, 'right', 'neighbor parcel must be replaced by exact nearby address');
assert.equal(calls.some(url => url.includes('geometryType=esriGeometryEnvelope')), true, 'exact parcel fallback must query a bounded nearby envelope');
assert.equal(typeof recentListener, 'function', 'render mismatch guard must be installed');

console.log('NJ address quality guard contract passed.');
