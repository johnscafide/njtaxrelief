import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'property/js/nj-address-autocomplete.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function requireMatch(label, pattern) {
  if (!pattern.test(source)) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

requireMatch('uses Google Autocomplete Data API', /AutocompleteSuggestion/);
requireMatch('keeps predictions restricted to New Jersey bounds', /locationRestriction\s*:\s*NJ_BOUNDS/);
requireMatch('keeps predictions limited to US addresses before NJ filtering', /includedRegionCodes\s*:\s*\['us'\]/);
requireMatch('filters predictions through the NJ locality guard', /isNjPrediction\(p,map\)/);
requireMatch('groups results by county and shows match counts', /count\+' match'\+\(count===1\?'':'es'\)/);
requireMatch('highlights the typed address text', /highlight\(main,needle\)/);
requireMatch('uses NJ public geocoder for preview enrichment', /NJ_GEOCODE/);
requireMatch('uses NJ parcel service for preview enrichment', /NJ_PARCEL/);
requireMatch('limits preview enrichment concurrency to three', /runPool\(items,3,enrichPrediction\)/);
requireMatch('enriches at most six visible predictions', /predictions\|\|\[\]\)\.slice\(0,6\)/);
requireMatch('scores matched parcels through canonical realtime score RPC', /get_public_realtime_watchdog_scores/);
requireMatch('renders saved-property treatment', /Saved property/);
requireMatch('renders saved-property quick shortcuts', /Saved properties/);
requireMatch('renders recently-viewed quick shortcuts', /Recently viewed/);
requireMatch('retains explicit Google attribution', /Powered by Google/);
requireMatch('fetches Google place fields only after prediction selection', /selectPrediction[\s\S]*fetchFields\(\{fields:\['formattedAddress','addressComponents'\]\}\)/);
requireMatch('rejects a selected place outside New Jersey', /state!==['"]NJ['"]/);
requireMatch('retains keyboard navigation', /ArrowDown[\s\S]*ArrowUp[\s\S]*Escape[\s\S]*Enter/);
requireMatch('retains combobox semantics', /role','combobox'/);

if (process.exitCode) {
  throw new Error('NJ address autocomplete contract failed');
}

console.log('NJ address autocomplete contract passed.');
