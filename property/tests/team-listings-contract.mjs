// Team listings: Bright MLS printout reader, saved-field checks and public page basics.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const must = (condition, message) => { if (!condition) throw new Error(message); };

const pdf = require('../backoffice/team-listings/bright-pdf.js');
const api = require('../../api/watchdog-team-listings.js')._test;
const pages = require('../../api/_team-listings-pages.js');

const lines = [
  'Client Full', '123 Main St, Cherry Hill, NJ 08003 | Active', 'MLS #: NJCD2054321 | Beds: 4', 'Tax ID #: 09-00123-00045 | Baths: 2 / 1',
  'Above Grade Fin SQFT: 2,148 / Estimated', 'Structure Type: Detached | Year Built: 1972', 'List Price: $425,000', 'County: Camden, NJ',
  'Tax Annual Amt / Year: $9,876 / 2025', 'Heating: Forced Air; Natural Gas', 'Remarks', 'Public: Welcome home to this lovely colonial on a quiet street.',
  'Agent Remarks: call owner 555-1212, lockbox 1234', 'Listing Office: Opus Elite Real Estate (OPUS1) 856-555-1212', 'List Agent: Jane Doe (3012345) 856-555-0000 jane@x.com'
];
const f = pdf.parseText(lines);
must(f.mls_number === 'NJCD2054321' && f.price === 425000 && f.beds === 4 && f.baths_full === 2 && f.baths_half === 1, 'Core MLS fields must be read.');
must(f.address === '123 Main St' && f.city === 'Cherry Hill' && f.zip === '08003' && f.county === 'Camden', 'Address must be read.');
must(f.sqft === 2148 && f.year_built === 1972 && f.annual_tax === 9876 && f.status === 'active', 'Size, year, taxes and status must be read.');
must(f.agent_name === 'Jane Doe' && f.brokerage === 'Opus Elite Real Estate', 'Agent and office names must drop IDs, phones and emails.');
const all = JSON.stringify(f);
must(!/lockbox|call owner|555-1212|jane@x\.com/i.test(all), 'Agent-only remarks, phones and emails must never be read from the printout.');

// Bright "Agent Full" layout: labels and values are separate columns and the price sits on the address line.
const agentFull = pdf.parseText([
  'Agent Full', '9 Test Pl, Sewell, NJ 08080 | Active | Residential | $429,900', 'MLS #: | NJGL2000001 | Beds: | 3', 'Baths: | 2 / 1',
  'Above Grade Fin SQFT: | 2,320 / Assessor', 'Subdiv / Neigh: | PINNACLE PLACE | Elementary School: | Hurffville', 'Lot Acres / SQFT: | 0.04a / 1799sf / Assessor',
  'Basement Type: | Daylight, Full, Front Entrance, Fully', 'Finished, Garage Access', 'Lot',
  'Remarks', 'Public: | Not your ordinary townhome \u2014 it is a showstopper!', 'Listing Office',
  'Listing Agent: | Pat Agent (3000000) (Lic# 1) | (856) 555-0101', 'Listing Agent Email: | pat@example.com',
  'Listing Office: | Opus Elite Real Estate of NJ, LLC (OPUS1) (Lic# 2)', 'Office Phone: | (609) 555-0102', 'Showing', 'Lock Box Type: | Combo', 'Listing Entry Date: | 10/20/2026'
]);
must(agentFull.mls_number === 'NJGL2000001' && agentFull.price === 429900 && agentFull.beds === 3 && agentFull.sqft === 2320, 'Agent Full column layout must be read.');
must(agentFull.subdivision === 'Pinnacle Place' && agentFull.lot === '0.04 acres (1,799 sq ft)' && agentFull.list_date === '2026-10-20', 'Neighborhood, lot and list date must be cleaned up.');
must(agentFull.features.some((f) => f.label === 'Basement' && /Finished, Garage Access$/.test(f.value)), 'Wrapped values must be joined.');
must(agentFull.agent_name === 'Pat Agent' && agentFull.brokerage === 'Opus Elite Real Estate of NJ, LLC', 'Agent and office names must be clean.');
must(!/\u2014/.test(agentFull.remarks) && !/555-01|pat@example|Combo/.test(JSON.stringify(agentFull)), 'No em dashes, phones, emails or lockbox info.');

const ok = api.cleanListing({ address: '1 A St', city: 'Glassboro', price: '$299,000', photos: [api.PHOTO_PREFIX + 'u/x.jpg', 'https://evil.example/x.jpg'] });
must(ok.row && ok.row.price === 299000 && ok.row.photos.length === 1, 'Only photos from the team bucket are kept.');
must(api.cleanListing({ address: '', city: 'X' }).error, 'An address is required.');

const html = pages.listingPage({ slug: '1-a-st-glassboro-08028', status: 'active', address: '1 A St', city: 'Glassboro', zip: '08028', county: 'Gloucester', price: 299000, photos: [], features: [], brokerage: 'Opus Elite Real Estate' });
must(html.includes('Opus Elite Real Estate, Real Estate Broker'), 'Every listing page shows the brokerage name and that it is a broker (N.J.A.C. 11:5-6.1).');
must(html.includes('/contact?subject='), 'Questions go to the contact form.');
must(!/tel:|mailto:/i.test(html), 'No phone or email links on public listing pages.');
must(/Hi There/.test(html), 'Public listing pages carry John’s story comment.');
const statusOf = (word) => pdf.parseText(['10 Oak Ave, Glassboro, NJ 08028 | ' + word + ' | $250,000', 'MLS #: | NJGL2000001']).status;
must(statusOf('Pending') === 'pending' && statusOf('Active Under Contract') === 'under_contract' && statusOf('Closed') === 'sold', 'Pending, under contract and sold must be read from the PDF.');
must(api.cleanListing({ address: '1 A St', city: 'Glassboro', status: 'pending' }).row.status === 'pending', 'Pending is a saved status.');
const pendingHtml = pages.listingPage({ slug: '1-a-st-glassboro-08028', status: 'pending', address: '1 A St', city: 'Glassboro', photos: ['/a.jpg', '/b.jpg'], features: [], brokerage: 'Opus Elite Real Estate' });
must(pendingHtml.includes('Pending') && pages.LIVE.includes('pending'), 'Pending listings stay on the public page with a Pending badge.');
must(/data-track/.test(pendingHtml) && /object-fit:contain/.test(pendingHtml), 'Listing photos swipe and show the whole photo.');
const vercel = JSON.parse(require('fs').readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
for (const [fn, cfg] of Object.entries(vercel.functions || {})) must(String(cfg.includeFiles || '').length <= 256, `${fn}: Vercel rejects includeFiles longer than 256 characters.`);
console.log('Team listings contract passed.');
