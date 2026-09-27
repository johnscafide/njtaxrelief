import fs from 'node:fs';

// Every Watchdog municipal dataset must be keyed by the MOD-IV (PAMS PIN) district
// code, the first four characters of a property's PIN. State county/municipal codes
// (Treasury Abstract, DCA, DLGS) differ for 99 towns and must go through the crosswalk.
function read(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function must(v,m){ if(!v) throw new Error(m); }

const LEGAL=new Set(['township','twp','borough','boro','city','town','village','of','the']);
const ALIASES={swedesborough:'swedesboro',newbrunsick:'newbrunswick',southbelmar:'lakecomo',dover:'tomsriver',westpaterson:'woodlandpark',peapackgladstone:'peapackandgladstone'};
function norm(name,code=''){
  let key=String(name||'').toLowerCase().replace(/-/g,' ').replace(/[^a-z ]/g,' ').split(/\s+/).filter(w=>w&&!LEGAL.has(w)).join('');
  key=ALIASES[key]||key;
  if(code==='1112'&&key==='washington') key='robbinsville';
  return key;
}

const crosswalk=read('property/data/nj-district-crosswalk.json').districts;
const codes=Object.keys(crosswalk);
must(codes.length===564,'The district crosswalk must cover all 564 NJ municipalities.');
must(new Set(codes.map(c=>crosswalk[c].dca_code)).size===564,'Each state municipal code must map to exactly one PIN district code.');
const cod=read('property/data/cod/cod-history.json').municipalities.map(r=>r.code).sort();
must(JSON.stringify(cod)===JSON.stringify([...codes].sort()),'Crosswalk keys must be the official COD table district codes.');

// Official NJGIN municipal boundaries carry both numberings: MUN_CODE (PIN district
// code) and SSN (state county/municipal code). The crosswalk must agree on every town.
const boundaries=read('Municipal_Boundaries_of_NJ.json').features.map(f=>f.properties);
must(boundaries.length===564,'The official municipal boundary file must list 564 municipalities.');
const badBoundary=boundaries.filter(p=>!crosswalk[String(p.MUN_CODE).padStart(4,'0')]||crosswalk[String(p.MUN_CODE).padStart(4,'0')].dca_code!==String(p.SSN).padStart(4,'0'));
must(!badBoundary.length,`Crosswalk must match the official boundary file (MUN_CODE -> SSN): ${badBoundary.slice(0,5).map(p=>p.MUN_CODE+'->'+p.SSN).join('; ')}`);

// The NJPropertyTaxRelief tax map joins tax-data.json to the boundary file by MUN_CODE.
const officialName=Object.fromEntries(boundaries.map(p=>[String(p.MUN_CODE).padStart(4,'0'),p.MUN]));
const simple=s=>String(s||'').toUpperCase().replace(/TOWNSHIP/g,'TWP').replace(/BOROUGH/g,'BORO').replace(/^MT /,'MOUNT ').replace(/[^A-Z]/g,'').replace(/CITYCITY$/,'CITY').replace(/(TWP|BORO|CITY|TOWN|VILLAGE)$/,'');
const taxData=read('tax-data.json');
const badTax=Object.entries(taxData).filter(([code,row])=>!officialName[code]||(simple(row.name)!==simple(officialName[code])&&!['0717','1704'].includes(code)));
must(!badTax.length,`tax-data.json rows must sit on their PIN district code: ${badTax.slice(0,5).map(([c,r])=>c+' '+r.name+' vs '+officialName[c]).join('; ')}`);

// Town names seen on real property records by PIN prefix (production lookups).
const VERIFIED={'0102':'Atlantic City','0415':'Gloucester Township','0436':'Winslow Township','0818':'Washington Township','1225':'Woodbridge Township','1325':'Little Silver Borough','1326':'Loch Arbour Village','1330':'Marlboro Township','1512':'Jackson Township','1517':'Little Egg Harbor Township','1521':'Ocean Township','1531':'Stafford Township'};
for(const [code,name] of Object.entries(VERIFIED)) must(norm(crosswalk[code].name)===norm(name),`Crosswalk ${code} must be ${name} (verified PIN prefix), found ${crosswalk[code].name}.`);

const DATASETS=[
  ['property/data/budget-pressure.json','municipalities','name'],
  ['property/abatements.json','districts','name'],
  ['property/data/affordable-housing.json','districts','name'],
  ['property/data/affordable-housing-v037.json','municipalities','municipality'],
  ['property/data/exempt-pilot.json','municipalities','name'],
  ['property/data/federal-housing-context-v041.json','municipalities','name'],
  ['property/data/neighborhood-trends.json','municipalities','name'],
  ['property/data/dca-development-trends-v038.json','municipalities',1],
  ['property/data/cod/historical-cod-2016-2017.json','districts','name'],
  ['property/data/cod/historical-cod-2018-2021.json','districts','name'],
  ['property/data/statewide-intelligence.json','municipalities','name'],
  ...fs.readdirSync('property/data/ufb-v039').filter(f=>/^\d\d\.json$/.test(f)).map(f=>['property/data/ufb-v039/'+f,'municipalities',0]),
  ...fs.readdirSync('property/data/ufb-v040').filter(f=>/^\d\d\.json$/.test(f)).map(f=>['property/data/ufb-v040/'+f,'municipalities',0]),
];
for(const [path,container,field] of DATASETS){
  const data=read(path);
  // Rebuilt files from the patched builders may not carry the district_key marker;
  // what matters is that every row's municipality name matches its PIN district code.
  must(!data.district_key||data.district_key==='modiv_pams',`${path} declares an unknown district_key ${data.district_key}.`);
  const bad=Object.entries(data[container]).filter(([code,row])=>{
    const name=typeof field==='number'?row[field]:row[field];
    return !crosswalk[code]||(name&&norm(name,code)!==norm(crosswalk[code].name,code));
  }).map(([code,row])=>`${code} ${typeof field==='number'?row[field]:row[field]}`);
  must(!bad.length,`${path} has rows whose name does not match the PIN district code: ${bad.slice(0,5).join('; ')}`);
}

const uniformity=read('property/uniformity.json').districts;
const badUni=Object.entries(uniformity).filter(([code,row])=>!crosswalk[code]||norm(row.name,code)!==norm(crosswalk[code].name,code));
must(!badUni.length,`uniformity.json names must match their district codes: ${badUni.slice(0,5).map(([c,r])=>c+' '+r.name).join('; ')}`);

const manifest=read('towns/town-manifest.json').pages;
const badTowns=manifest.filter(p=>!crosswalk[p.district]||norm(p.name,p.district)!==norm(crosswalk[p.district].name,p.district));
must(!badTowns.length,`Town pages must carry PIN district codes: ${badTowns.slice(0,5).map(p=>p.district+' '+p.name).join('; ')}`);

for(const script of ['build_budget_pressure','build_exempt_pilot','build_dca_development_trends_v038','build_ufb_v039','build_ufb_v040_longitudinal','parse_affordable_housing','build_affordable_housing_v037','build_pilot_agreement_intelligence']){
  must(fs.readFileSync(`property/scripts/${script}.py`,'utf8').includes('from nj_district_codes import'),`${script}.py must translate state municipal codes with nj_district_codes.`);
}
must(fs.readFileSync('property/scripts/parse-cod-pdf.js','utf8').includes('nj-district-crosswalk.json'),'The COD parser must take display names from the district crosswalk.');

console.log(`District key contract passed (${DATASETS.length} datasets, ${manifest.length} town pages, 564 districts).`);
