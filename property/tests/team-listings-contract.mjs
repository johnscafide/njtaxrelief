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

const ok = api.cleanListing({ address: '1 A St', city: 'Glassboro', price: '$299,000', photos: [api.PHOTO_PREFIX + 'u/x.jpg', 'https://evil.example/x.jpg'] });
must(ok.row && ok.row.price === 299000 && ok.row.photos.length === 1, 'Only photos from the team bucket are kept.');
must(api.cleanListing({ address: '', city: 'X' }).error, 'An address is required.');

const html = pages.listingPage({ slug: '1-a-st-glassboro-08028', status: 'active', address: '1 A St', city: 'Glassboro', zip: '08028', county: 'Gloucester', price: 299000, photos: [], features: [], brokerage: 'Opus Elite Real Estate' });
must(html.includes('Opus Elite Real Estate, Real Estate Broker'), 'Every listing page shows the brokerage name and that it is a broker (N.J.A.C. 11:5-6.1).');
must(html.includes('/contact?subject='), 'Questions go to the contact form.');
must(!/tel:|mailto:/i.test(html), 'No phone or email links on public listing pages.');
must(/Hi There/.test(html), 'Public listing pages carry John’s story comment.');
console.log('Team listings contract passed.');
