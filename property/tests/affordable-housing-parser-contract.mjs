import fs from 'node:fs';

const path='property/scripts/parse_affordable_housing.py';
const source=fs.readFileSync(path,'utf8');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};

expect(source.includes('pd.ExcelFile(xlsx_path)'),'Parser must inspect the workbook sheet manifest.');
expect(source.includes('for sheet_name in book.sheet_names'),'Parser must scan every workbook sheet.');
expect(source.includes('best_header_candidate(raw)'),'Parser must choose a table by semantic header evidence.');
expect(source.includes('no municipality header in first 40 rows'),'Parser must fail explicitly when a sheet has no usable municipal header.');
expect(source.includes('normalize_county'),'Parser must normalize county identity separately.');
expect(source.includes('by_pair: dict[tuple[str, str], str]'),'Crosswalk must support municipality + county identity.');
expect(source.includes('districts_by_name: dict[str, set[str]]'),'Parser must detect statewide duplicate municipality aliases.');
expect(source.includes('if len(districts) == 1'),'Name-only fallback must be limited to unique statewide aliases.');
expect(source.includes('ambiguous_municipality_name'),'Ambiguous name-only matches must remain explicit.');
expect(source.includes('return None, "ambiguous_municipality_name"'),'Ambiguous names must fail closed rather than guess a district.');
expect(source.includes('identity_match'),'Output must retain how municipal identity was resolved.');
expect(source.includes('municipalities_ambiguous_name'),'Output must disclose ambiguous source rows.');
expect(source.includes('schema_version": 2'),'Hardened output must version the changed identity contract.');
expect(!source.includes('sheet_name=0'),'Parser must not regress to first-sheet-only parsing.');
expect(!source.includes('?v='),'Parser must not introduce version-query asset strings.');

console.log('Affordable housing parser contract passed: all-sheet discovery, county-aware identity, ambiguous-name fail-closed, explicit lineage.');
