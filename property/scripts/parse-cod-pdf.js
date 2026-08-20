#!/usr/bin/env node
'use strict';

/*
 Regenerates cod-history.json from the official NJ Division of Taxation
 Coefficients of Deviation publication.

 Canonical Watchdog uniformity COD is the SEGMENTED coefficient of deviation
 for Property Class 2 (Residential), not the adjacent stratified Class 2 COD.
 A dash in the official table remains null. Municipality identity is preserved
 by the four-digit NJ district code printed in the publication.

 Requires Poppler's `pdftotext` command.

 Usage:
   node property/scripts/parse-cod-pdf.js CoefficientDeviations.pdf
*/
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const COUNTY = {
  '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May',
  '06':'Cumberland','07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon',
  '11':'Mercer','12':'Middlesex','13':'Monmouth','14':'Morris','15':'Ocean',
  '16':'Passaic','17':'Salem','18':'Somerset','19':'Sussex','20':'Union','21':'Warren'
};
const EXPECTED_YEARS = [2022, 2023, 2024, 2025];

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function number(value) { return value === '-' ? null : Number(value); }

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('Usage: node property/scripts/parse-cod-pdf.js <CoefficientDeviations.pdf>');
  process.exit(1);
}

const temp = path.join(os.tmpdir(), `nj-cod-${process.pid}.txt`);
execFileSync('pdftotext', ['-layout', input, temp]);
const lines = fs.readFileSync(temp, 'utf8').split(/\r?\n/);
fs.rmSync(temp, {force:true});

const firstRow = /^(.*?)\s+(\d{4})\s+(?:\*\s*)?(202[2-5])\s+(.*)$/;
const continuation = /^\s*(?:\*\s*)?(202[2-5])\s+(.*)$/;
const tokenPattern = /-|\d+(?:\.\d+)?/g;
const records = new Map();
let current = null;

for (const raw of lines) {
  let year, data, code, municipality, county;
  const first = raw.match(firstRow);
  if (first) {
    [, municipality, code, year, data] = first;
    county = COUNTY[code.slice(0, 2)];
    if (!county) throw new Error(`Unknown county code in district ${code}`);
    municipality = municipality.trim().replace(new RegExp(`^${county}\\s+`), '').trim();
    current = {code, municipality, county};
  } else {
    const next = raw.match(continuation);
    if (!next || !current) continue;
    [, year, data] = next;
    ({code, municipality, county} = current);
  }

  const values = data.match(tokenPattern) || [];
  // Official layout after YEAR:
  // 0 GENERAL; 1-3 STRATIFIED class 1/2/4; 4-6 SEGMENTED class 1/2/4;
  // 7-9 NUMBER OF SALES class 1/2/4; 10 TOTAL SALES.
  if (values.length < 11) continue;
  if (!records.has(code)) {
    records.set(code, {
      id: `${slug(municipality)}-${code}`,
      municipality, county, code,
      propertyClass: 'Class 2 - Residential',
      history: []
    });
  }
  const record = records.get(code);
  const numericYear = Number(year);
  if (record.history.some(entry => entry.year === numericYear)) {
    throw new Error(`Duplicate COD year ${numericYear} for district ${code}`);
  }
  record.history.push({
    year: numericYear,
    cod: number(values[5]),
    generalCod: number(values[0]),
    salesCount: values[8] === '-' ? null : Number(values[8])
  });
}

const municipalities = [...records.values()]
  .map(record => ({...record, history: record.history.sort((a,b) => a.year-b.year)}))
  .sort((a,b) => a.code.localeCompare(b.code));

if (municipalities.length !== 564) {
  throw new Error(`Validation failed: expected 564 municipalities, found ${municipalities.length}`);
}
for (const record of municipalities) {
  const years = record.history.map(entry => entry.year);
  if (years.length !== EXPECTED_YEARS.length || !EXPECTED_YEARS.every((year, i) => years[i] === year)) {
    throw new Error(`Validation failed: district ${record.code} has years ${years.join(',')}, expected ${EXPECTED_YEARS.join(',')}`);
  }
}

const yearCoverage = Object.fromEntries(EXPECTED_YEARS.map(year => [year, municipalities.reduce((count, record) => {
  const row = record.history.find(entry => entry.year === year);
  return count + (row && row.cod !== null ? 1 : 0);
}, 0)]));

const payload = {
  sourceLabel: 'NJ Division of Taxation - Coefficients of Deviation (2022-2025)',
  sourceUrl: 'https://www.nj.gov/treasury/taxation/pdf/lpt/CoefficientDeviations.pdf',
  sourceIndexUrl: 'https://www.nj.gov/treasury/taxation/lpt/statdata.shtml',
  sourcePublished: '2026-01-29',
  generatedAt: new Date().toISOString().slice(0,10),
  isDemonstrationData: false,
  metric: {
    field: 'segmentedClass2Cod',
    label: 'Segmented coefficient of deviation - Property Class 2 (Residential)',
    note: 'A dash in the official table is stored as null. No missing value is converted to zero.'
  },
  yearCoverage,
  municipalities
};

const output = path.resolve(__dirname, '../data/cod/cod-history.json');
fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${municipalities.length} municipalities to ${output}`);
console.log(`Non-null segmented Class 2 COD coverage: ${JSON.stringify(yearCoverage)}`);
