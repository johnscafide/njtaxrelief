import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const propertyRoot = path.resolve(here, '..');
const repoRoot = path.resolve(propertyRoot, '..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const brand = read('property/js/brand-consistency-runtime.js');
const runtime = read('property/js/property-imagery-runtime.js');
const landing = read('property/js/landing-showcase.js');
const landingIntel = read('property/js/landing-recent-intelligence.js');
const api = read('api/property-imagery.js');
const migration = read('supabase/migrations/20260824225500_property_photo_library_v1.sql');
const governance = read('supabase/migrations/20260824225800_property_photo_library_governance_v1.sql');
const provenance = read('supabase/migrations/20260824230700_property_photo_library_provenance_v1.sql');

assert(brand.includes("PROPERTY_IMAGERY='/property/js/property-imagery-runtime.js'"),
  'Canonical app runtime must load the property imagery runtime');
assert(brand.includes('__WATCHDOG_STREETVIEW_BACKGROUND_GUARD__'),
  'Property Home must guard CSS background Street View URLs before its renderer runs');
assert(brand.includes('background-image:none'),
  'CSS Street View guard must neutralize passive background-image requests');

assert(api.includes('maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/export'),
  'NJGIN 2020 orthophotography must be the aerial source');
assert(api.includes("const KARTAVIEW = 'https://api.openstreetcam.org/2.0/photo/'"),
  'KartaView free street imagery adapter is missing');
assert(api.includes('MAPILLARY_CLIENT_TOKEN'),
  'Mapillary adapter must remain server-token gated');
assert(api.includes("'google_on_demand_only'"),
  'Provider hierarchy must keep Google as on-demand only');
assert(!api.includes('maps.googleapis.com/maps/api/streetview'),
  'Free-first imagery API must never generate Google Static Street View URLs');

assert(runtime.includes("var BUCKET = 'property-photos'"), 'Property photo storage bucket is missing');
assert(runtime.includes("visibility: contribute ? 'contribution' : 'private'"),
  'Uploads must be private unless contribution is explicitly selected');
assert(runtime.includes("moderation_status: contribute ? 'pending' : 'private'"),
  'Contributed photos must enter moderation pending');
assert(runtime.includes('exif_stripped: true'),
  'Normalized uploads must record EXIF stripping');
assert(runtime.includes("canvas.toBlob"),
  'Uploads must be re-encoded client-side rather than preserving source EXIF bytes');
assert(runtime.includes('if (contribute && !context.property.verified)'),
  'Contribution must require verified ownership in the client UX');
assert(runtime.includes("['front_exterior','side_exterior']"),
  'Shared contribution UX must be limited to useful exterior views');
assert(!runtime.includes('maps.googleapis.com/maps/api/streetview'),
  'Property imagery runtime must not generate Google Static Street View URLs');
assert(!/watchdog.?score|score_observation|robust/i.test(runtime),
  'Property photo contribution must not affect Watchdog Score or ROBUST');

assert(landing.includes('Orthos_Natural_2020_NJ_WM/MapServer/export'),
  'Landing property cards must have the NJ Office of GIS aerial baseline');
assert(landing.includes("'/api/property-imagery?lat='"),
  'Landing cards must progressively enhance with the free street-level imagery adapter');
assert(landing.includes("from('property_photos')"),
  'Signed-in landing cards must prefer the governed first-party property photo library');
assert(!landing.includes('maps.googleapis.com/maps/api/streetview'),
  'Landing property cards must never create passive Google Static Street View requests');
assert(!landing.includes('GMAPS_KEY'),
  'Landing showcase must not carry a Google Street View key path');
assert(landingIntel.includes('prepareRenderedPropertyImage'),
  'Landing intelligence must decorate property imagery instead of removing it');
assert(!landingIntel.includes('stripRenderedPropertyImage'),
  'Landing intelligence must not strip real property imagery');
assert(!landingIntel.includes('querySelectorAll(\'img\').forEach'),
  'Landing intelligence must not delete card image elements');
assert(landingIntel.includes('object-fit:cover'),
  'Landing imagery must fill the score visual while retaining the intelligence overlay');

assert(migration.includes("values ('property-photos', 'property-photos', false"),
  'Property photo bucket must be private');
assert(migration.includes('property_photos_contribution_consent_chk'),
  'Contribution records must require versioned consent');
assert(migration.includes('s.verified = true'),
  'Database RLS must independently require verified ownership for contributions');
assert(governance.includes("visibility <> 'contribution' or photo_type in ('front_exterior','side_exterior')"),
  'Database must restrict shared imagery to exterior photo types');
assert(governance.includes("visibility = 'contribution'\n        and moderation_status = 'pending'"),
  'Contributors must not be able to self-approve shared photos');
assert(governance.includes("or (\n    (select auth.uid()) = user_id"),
  'Owner update policy must remain distinct from developer moderation authority');
assert(provenance.includes("contributor_license_version = 'watchdog-photo-contribution-v1-2026-08-24'"),
  'Shared contribution must be pinned to the current consent version');
assert(provenance.includes('property_photos_touch_updated_at'),
  'Property photo provenance must maintain updated_at automatically');

console.log('Property imagery/photo library contract passed: free-first sources, landing imagery hierarchy, private uploads, verified opt-in contribution, EXIF stripping, consent provenance and moderation boundaries verified.');
