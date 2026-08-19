#!/usr/bin/env node
'use strict';

/*
 Builds a machine-readable statewide Chapter 123/common-level-range dataset from
 the official NJ Division of Taxation certification PDF.

 Requires Poppler's `pdftotext` command.

 Usage:
   node property/scripts/parse-chapter123-pdf.js 2026CH123.pdf
*/
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TAX_YEAR = 2026;
const EXPECTED_DISTRICTS = 564;
const COUNTY = {
  '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May',
  '06':'Cumberland','07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon',
  '11':'Mercer','12':'Middlesex','13':'Monmouth','14':'Morris','15':'Ocean',
  '16':'Passaic','17':'Salem','18':'Somerset','19':'Sussex','20':'Union','21':'Warren'
};
const SOURCE_URL = 'https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/2026CH123.pdf';

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error('Usage: node property/scripts/parse-chapter123-pdf.js <2026CH123.pdf>');
  process.exit(1);
}

const temp = path.join(os.tmpdir(), `nj-chapter123-${process.pid}.txt`);
execFileSync('pdftotext', ['-layout', input, temp]);
const lines = fs.readFileSync(temp, 'utf8').split(/\r?\n/);
fs.rmSync(temp, {force:true});

const rowPattern = /^\s*(\d{4})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/;
const districts = {};
const amended = [];

function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

for (const raw of lines) {
  const match = raw.match(rowPattern);
  if (!match) continue;
  const [, code, rawName, ratioText, lowerText, upperText] = match;
  if (!COUNTY[code.slice(0,2)]) continue;

  const ratio = Number(ratioText);
  const lower = Number(lowerText);
  const upper = Number(upperText);
  if (![ratio, lower, upper].every(Number.isFinite)) continue;

  const wasAmended = /\*\*/.test(rawName);
  const municipality = rawName.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!municipality) continue;
  if (districts[code]) throw new Error(`Duplicate Chapter 123 district code ${code}`);

  // The certification publishes the common-level range as +/- 15% of the
  // average ratio. Keep the published numbers but reject extraction drift.
  if (Math.abs(round2(ratio * 0.85) - lower) > 0.011 || Math.abs(round2(ratio * 1.15) - upper) > 0.011) {
    throw new Error(`Arithmetic validation failed for ${code} ${municipality}: ${ratio} ${lower} ${upper}`);
  }

  districts[code] = {
    municipality,
    county: COUNTY[code.slice(0,2)],
    ratio,
    lower,
    upper,
    amended_by_tax_court: wasAmended
  };
  if (wasAmended) amended.push(code);
}

const codes = Object.keys(districts).sort();
if (codes.length !== EXPECTED_DISTRICTS) {
  throw new Error(`Validation failed: expected ${EXPECTED_DISTRICTS} municipalities, found ${codes.length}`);
}
const countyCodes = new Set(codes.map(code => code.slice(0,2)));
if (countyCodes.size !== 21) throw new Error(`Validation failed: expected 21 counties, found ${countyCodes.size}`);
for (const code of Object.keys(COUNTY)) {
  if (!countyCodes.has(code)) throw new Error(`Validation failed: missing county code ${code} (${COUNTY[code]})`);
}

const payload = {
  schema_version: 1,
  source_id: 'nj-chapter123-2026',
  tax_year: TAX_YEAR,
  source: {
    title: 'Certification of Average Ratios and Common Level Ranges for Use in the Tax Year 2026',
    publisher: 'State of New Jersey Department of the Treasury, Division of Taxation',
    url: SOURCE_URL,
    original_certification: '2025-10-01',
    tax_court_amendment: '2026-01-30'
  },
  generated_at: new Date().toISOString(),
  district_count: codes.length,
  county_count: countyCodes.size,
  amended_district_codes: amended.sort(),
  districts: Object.fromEntries(codes.map(code => [code, districts[code]]))
};

const output = path.resolve(__dirname, '../data/chapter123-2026.json');
fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${codes.length} Chapter 123 districts across ${countyCodes.size} counties to ${output}`);
