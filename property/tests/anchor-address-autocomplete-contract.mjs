import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const estimator=read('anchor-estimator.html');
const funnel=read('anchor-funnel.js');
const bridge=read('anchor-watchdog-bridge.js');
const handoff=read('anchor-watchdog-handoff.js');
const fallback=read('anchor-address-autocomplete-fallback.js');
const watchdogCss=read('anchor-watchdog.css');
const acquisition=read('api/njptr-watchdog-acquisition-page.js');
const canonicalAddressRuntime=read('property/js/nj-address-autocomplete.js');

must(estimator.includes('libraries=places&callback=initAddressAutocomplete'),'ANCHOR estimator must continue loading Google Places through the shared callback.');
must(estimator.indexOf('anchor-funnel.js') < estimator.indexOf('anchor-watchdog-bridge.js'),'ANCHOR funnel validation must load before the Watchdog address bridge.');
must(bridge.includes("window.initAddressAutocomplete = function () { initSearch(); };"),'Watchdog custom NJ property search must remain the primary Google callback.');
must(bridge.includes('AutocompleteSuggestion'),'Watchdog custom autocomplete must retain the Places suggestion data API.');
must(bridge.includes('body.est-page .pac-container{display:none!important}'),'Native Google suggestions must stay hidden while the Watchdog search is healthy.');
must(watchdogCss.includes('body.est-page:has(#est-address[data-anchor-places-bound="1"]:not([data-wd-anchor-search="1"])):not(.awd-njgis-address-fallback) .pac-container'),'Legacy Google suggestions must only be exposed after the Watchdog search leaves its primary bound state and while NJ GIS fallback is inactive.');
must(watchdogCss.includes('.pac-container{display:block!important;z-index:9000!important}'),'Legacy Google fallback must override the default hidden native container with a visible, correctly stacked suggestion list.');

must(funnel.includes('google.maps.places.Autocomplete'),'The existing Google Places verification surface must remain available when Google is healthy.');
must(handoff.includes('/anchor-address-autocomplete-fallback.js'),'Estimator bootstrap must load the address recovery script.');
must(fallback.includes('geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates'),'Fallback must use the NJ Office of GIS statewide geocoder when Google/Watchdog search is unavailable.');
must(fallback.includes("maxLocations: '8'"),'NJ GIS fallback must request a useful set of address candidates.');
must(fallback.includes('insideNj(candidateCoords(candidate))'),'Fallback must enforce New Jersey geographic bounds on returned candidates.');
must(fallback.includes("(Number(candidate.score) || 0) >= 70"),'Fallback must reject low-confidence NJ geocoder candidates.');
must(fallback.includes("input.dataset.googleAddress = '1'"),'Fallback selection must satisfy the existing verified-address submit state.');
must(fallback.includes("input.dataset.addressSource = 'nj_ogis'"),'Fallback must record the actual NJ GIS verification provider separately from legacy compatibility flags.');
must(fallback.includes("input.dataset.googlePlaceId = placeId"),'Fallback selection must retain a stable verification identifier required by submit validation.');
must(fallback.includes("return 'njogis:'"),'Fallback verification identifiers must be namespaced so they cannot be mistaken for real Google place IDs.');
must(fallback.includes("new CustomEvent('watchdog:address-selected'"),'Fallback must preserve the Watchdog address-selected integration event.');
must(fallback.includes("source: 'nj_ogis'"),'Fallback selection events must identify NJ GIS as the source.');
must(fallback.includes("current.dataset.wdAnchorSearch !== '1'"),'Fallback must recover when the newer Watchdog suggestion API never binds.');
must(fallback.includes('Watchdog property search could (?:not load|not initialize)'),'Fallback must recover from explicit Watchdog search initialization/request errors.');
must(fallback.includes('Google address verification could not load'),'Fallback must also recover when the base Google verification callback fails.');
must(fallback.includes('if (String(input.value || \'\').trim().length >= 3) queueSearch();'),'Fallback must immediately retry the address already typed when recovery activates.');

const adapterKey=(acquisition.match(/const WATCHDOG_MAPS_BROWSER_KEY = '([^']+)'/)||[])[1]||'';
const canonicalKey=(canonicalAddressRuntime.match(/var GMAPS_KEY='([^']+)'/)||[])[1]||'';
must(adapterKey && canonicalKey && adapterKey===canonicalKey,'NJPTR ANCHOR must use the same maintained Google Maps browser key as Watchdog NJ address search.');
must(acquisition.includes('function alignAnchorMapsKey(out)'),'NJPTR acquisition adapter must normalize the legacy estimator Maps key before serving it.');
must(acquisition.includes("if(pathname==='/anchor-estimator.html') out=alignAnchorMapsKey(out);"),'Maps-key normalization must stay scoped to the ANCHOR estimator response.');
must(acquisition.includes("if(pathname==='/anchor-estimator.html') out=injectScript(out,'/anchor-watchdog-handoff.js');"),'Existing ANCHOR handoff injection contract must remain intact.');

console.log('ANCHOR address autocomplete recovery contract passed.');
