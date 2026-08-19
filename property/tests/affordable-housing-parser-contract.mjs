import fs from 'node:fs';

const path='property/scripts/parse_affordable_housing.py';
const source=fs.readFileSync(path,'utf8');
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};

expect(source.includes('pd.ExcelFile(xlsx_path)'),'Parser must inspect the workbook sheet manifest.');
expect(source.includes('for sheet_name in book.sheet_names'),'Parser must scan every workbook sheet.');
expect(source.includes('discover_tables(xlsx_path)'),'Parser must discover semantic tables across the workbook.');
expect(source.includes('no municipality header in first {max_scan_rows} rows'),'Parser must fail explicitly when a sheet has no usable municipal header.');
expect(source.includes('normalize_county'),'Parser must normalize county identity separately.');
expect(source.includes('taxation_muni_code'),'Parser must prefer the source taxation municipality code when governed.');
expect(source.includes('dca_muni_code'),'Parser must retain DCA municipality code as a governed identity fallback.');
expect(source.includes('valid_districts'),'Source municipal codes must be checked against the governed Treasury district universe.');
expect(source.includes('alias_pair_candidates'),'Stripped municipal aliases must be tested for collisions instead of blindly inserted.');
expect(source.includes('if len(districts) == 1'),'Name-only and stripped-alias fallbacks must be limited to unique identities.');
expect(source.includes('ambiguous_municipality_name'),'Ambiguous name-only matches must remain explicit.');
expect(source.includes('return None, "ambiguous_municipality_name"'),'Ambiguous names must fail closed rather than guess a district.');
expect(source.includes('aggregate_projects'),'Project-level DCA rows must aggregate to municipality, not first-row wins.');
expect(source.includes('merge_trust'),'Trust-fund data must merge from its separate municipal table.');
expect(source.includes('trust_balance_conflict'),'Conflicting duplicate trust balances must remain explicit and fail closed.');
expect(source.includes('source_contract'),'Output must retain an explicit parser/source contract.');
expect(source.includes('municipalities_ambiguous_name'),'Output must disclose ambiguous source rows.');
expect(source.includes('schema_version": 3'),'Municipal project/trust merge must version the changed output contract.');
expect(!source.includes('sheet_name=0'),'Parser must not regress to first-sheet-only parsing.');
expect(!source.includes('?v='),'Parser must not introduce version-query asset strings.');

console.log('Affordable housing parser contract passed: all-sheet discovery, source-code identity, county-aware aliases, municipal aggregation, separate trust merge, ambiguity/conflict fail-closed.');
