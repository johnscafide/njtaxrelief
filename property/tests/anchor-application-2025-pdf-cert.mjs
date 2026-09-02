import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const SOURCES = {
  'anc-1': {
    url: 'https://www.nj.gov/treasury/taxation/pdf/25-anc-1.pdf',
    sha: '1df62f2b2057f527ece24ba64af86e086613cf40164bd7d43b331f789072ae4b',
    pages: 2
  },
  'pas-1': {
    url: 'https://www.nj.gov/treasury/taxation/pdf/25-pas1.pdf',
    sha: '03a1a9032337697a3e536f86d65713b4c8261f0799d60e36a563e10d348e6a71',
    pages: 4
  }
};

const templates = {};
for (const [key, source] of Object.entries(SOURCES)) {
  const response = await fetch(source.url);
  assert.equal(response.ok, true, `${key} official NJ PDF unavailable`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha, source.sha, `${key} official NJ PDF hash changed`);
  templates[key] = bytes;
}

const window = {};
const sandbox = {
  window,
  PDFLib: { PDFDocument, StandardFonts },
  Uint8Array,
  Array,
  Object,
  Number,
  String,
  Boolean,
  Error,
  Math,
  Promise,
  console,
  fetch: async (url) => {
    const form = String(url).includes('pas-1') ? 'pas-1' : 'anc-1';
    const bytes = templates[form];
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Watchdog-Template-SHA256': SOURCES[form].sha
      }
    });
  }
};
sandbox.window.PDFLib = sandbox.PDFLib;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('property/js/anchor-application-2025-fields.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('property/js/anchor-application-pdf-2025.js', 'utf8'), sandbox);

const anc = {
  filing_status: 'A',
  applicant: { first:'SAMPLE', middle:'Q', last:'APPLICANT', birth_year:'1980', ssn:'111223333', ssd_2025:false, railroad_disability_2025:false, blind_or_disabled_1231:false },
  spouse: {},
  mailing: { address:'123 SAMPLE STREET', city:'TRENTON', state:'NJ', zip:'08608', municipality_code:'1100' },
  oct1: { different:false },
  resident_oct1: true,
  residency_status: 'homeowner',
  nj_gross_income_2025: '50000.00',
  anc: { same_home_last_year:true },
  property: { block:'123', lot:'4', qualifier:'', shared_ownership:false, multiple_units:false, facility_type:'none', tax_2025:'7500.00' },
  contact: 'sample@example.test',
  preparer_role: 'self',
  preparer: {},
  death_certificate_enclosed: false
};

const pas = {
  filing_status: 'A',
  applicant: { first:'SAMPLE', middle:'R', last:'SENIOR', birth_year:'1950', ssn:'222334444', ssd_2025:false, railroad_disability_2025:false },
  spouse: {},
  mailing: { address:'456 SAMPLE AVENUE', city:'TRENTON', state:'NJ', zip:'08608', municipality_code:'1100' },
  oct1: { different:false },
  resident_oct1: true,
  residency_status: 'homeowner',
  pas: {
    born_1960_or_earlier: true,
    owned_same_home_all_2025: false,
    moved_owned_homes_2025: true,
    schedule1: {
      home1: { address:'10 OLD SAMPLE ROAD', block:'10', lot:'2', end_date:'2025-06-30', shared_ownership:false, multiple_units:false, tax_billed_period:'3100.00', pilot_due_period:'0.00' },
      home2: { address:'456 SAMPLE AVENUE', block:'20', lot:'8', start_date:'2025-07-01', shared_ownership:false, multiple_units:false, tax_billed_period:'3600.00', pilot_due_period:'0.00' }
    }
  },
  property: {
    block:'20', lot:'8', shared_ownership_2024:false, shared_ownership_2025:false,
    multiple_units_2024:false, multiple_units_2025:false, additional_lots:false,
    tax_2024:'6500.00', tax_2025:'6800.00', pilot_agreement:false, facility_type:'none'
  },
  income_2024: { a:'40000.00', b:'0.00', c:'0.00', d:'0.00', e:'18000.00' },
  income_2025: { a:'42000.00', b:'0.00', c:'0.00', d:'0.00', e:'18500.00' },
  contact: 'sample@example.test',
  preparer_role: 'self',
  preparer: {},
  death_certificate_enclosed: false
};

fs.mkdirSync('artifacts/njw303-pdf-cert', { recursive: true });
for (const [name, state] of [['anc', anc], ['pas', pas]]) {
  const result = await sandbox.window.WatchdogAnchorPdf2025.generate(state);
  const expectedType = name === 'anc' ? 'anc-1' : 'pas-1';
  assert.equal(result.formType, expectedType);
  const out = result.pdfBytes;
  assert.ok(out.byteLength > 10000, `${name} output unexpectedly small`);
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), SOURCES[expectedType].pages, `${name} page count changed`);
  assert.equal(doc.getForm().getFields().length, 0, `${name} output did not flatten AcroForm fields`);
  fs.writeFileSync(`artifacts/njw303-pdf-cert/${name}-2025-filled.pdf`, out);
}

console.log('ANC-1 and PAS-1 pdf-lib generation, flattening, hashes, and page counts passed');
