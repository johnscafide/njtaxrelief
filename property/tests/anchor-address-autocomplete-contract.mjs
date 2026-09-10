import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const estimator=read('anchor-estimator.html');
const funnel=read('anchor-funnel.js');
const bridge=read('anchor-watchdog-bridge.js');
const handoff=read('anchor-watchdog-handoff.js');
const fallback=read('anchor-address-autocomplete-fallback.js');
const acquisition=read('api/njptr-watchdog-acquisition-page.js');
const canonicalAddressRuntime=read('property/js/nj-address-autocomplete.js');

must(estimator.includes('libraries=places&callback=initAddressAutocomplete'),'ANCHOR estimator must continue loading Google Places through the shared callback.');
must(estimator.indexOf('anchor-funnel.js') < estimator.indexOf('anchor-watchdog-bridge.js'),'ANCHOR funnel validation must load before the Watchdog address bridge.');
must(bridge.includes("window.initAddressAutocomplete = function () { initSearch(); };"),'Watchdog custom NJ property search must remain the primary Google callback.');
must(bridge.includes('AutocompleteSuggestion'),'Watchdog custom autocomplete must retain the Places suggestion data API.');
must(bridge.includes('body.est-page .pac-container{display:none!important}'),'Native Google suggestions must stay hidden while the Watchdog search is healthy.');

must(funnel.includes('google.maps.places.Autocomplete'),'The proven Google Places autocomplete surface must remain available as the fallback contract.');
must(handoff.includes('/anchor-address-autocomplete-fallback.js'),'Estimator bootstrap must load the address recovery script.');
must(fallback.includes("typeof places.Autocomplete !== 'function'"),'Fallback must fail safely when legacy Google Places autocomplete is unavailable.');
must(fallback.includes('new places.Autocomplete(input'),'Fallback must bind Google Places autocomplete to the ANCHOR address field.');
must(fallback.includes("componentRestrictions: { country: 'us' }"),'Fallback must retain US address restriction before NJ validation.');
must(fallback.includes("state && state !== 'NJ'"),'Fallback must reject explicitly non-New-Jersey selections.');
must(fallback.includes("input.dataset.googleAddress = '1'"),'Fallback selection must satisfy strict verified-address state.');
must(fallback.includes('input.dataset.googlePlaceId = placeId'),'Fallback selection must retain the Google place ID required by submit validation.');
must(fallback.includes("new CustomEvent('watchdog:address-selected'"),'Fallback must preserve the Watchdog address-selected integration event.');
must(fallback.includes('body.est-page.awd-legacy-places-fallback .pac-container{display:block!important'),'Native Google suggestions must become visible only after fallback activation.');
must(fallback.includes("current.dataset.wdAnchorSearch !== '1'"),'Fallback must recover when the newer Watchdog suggestion API never binds.');
must(fallback.includes('Watchdog property search could (?:not load|not initialize)'),'Fallback must recover from explicit Watchdog search initialization/request errors.');

const adapterKey=(acquisition.match(/const WATCHDOG_MAPS_BROWSER_KEY = '([^']+)'/)||[])[1]||'';
const canonicalKey=(canonicalAddressRuntime.match(/var GMAPS_KEY='([^']+)'/)||[])[1]||'';
must(adapterKey && canonicalKey && adapterKey===canonicalKey,'NJPTR ANCHOR must use the same maintained Google Maps browser key as Watchdog NJ address search.');
must(acquisition.includes('function alignAnchorMapsKey(out)'),'NJPTR acquisition adapter must normalize the legacy estimator Maps key before serving it.');
must(acquisition.includes("if(pathname==='/anchor-estimator.html') out=alignAnchorMapsKey(out);"),'Maps-key normalization must stay scoped to the ANCHOR estimator response.');
must(acquisition.includes("if(pathname==='/anchor-estimator.html') out=injectScript(out,'/anchor-watchdog-handoff.js');"),'Existing ANCHOR handoff injection contract must remain intact.');

console.log('ANCHOR address autocomplete recovery contract passed.');
