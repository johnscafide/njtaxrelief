import fs from 'node:fs';

const source = fs.readFileSync('anchor-address-autocomplete-fallback.js','utf8');
function must(value,message){ if(!value) throw new Error(message); }

must(source.includes("var NJ_GEOCODE = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates'"),'NJ GIS geocoder endpoint must remain explicit.');
must(source.includes("maxLocations: '8'"),'Fallback should request multiple candidates.');
must(source.includes("(Number(candidate.score) || 0) >= 70"),'Fallback should keep a confidence floor.');
must(source.includes("input.dataset.addressSource = 'nj_ogis'"),'Selected fallback addresses must record NJ GIS provenance.');
must(source.includes("return 'njogis:'"),'Fallback IDs must be namespaced and must not impersonate Google place IDs.');
must(source.includes("source: 'nj_ogis'"),'Selection event must identify NJ GIS provenance.');
must(source.includes("queueSearch();"),'Fallback must search typed input after activation.');
must(source.includes("credentials: 'omit'"),'Public geocoder fetch must not send user credentials.');

console.log('ANCHOR NJ GIS fallback contract passed.');
