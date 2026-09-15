import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const rating = read('property/js/anchor-rating-summary.js');
const usage = read('supabase/functions/anchor-usage/index.ts');
const socialProxy = read('api/watchdog-anchor-social-proof.js');
const reviewsApi = read('api/watchdog-backoffice-reviews.js');
const reviewsPage = read('property/backoffice/reviews/index.html');
const reviewsJs = read('property/backoffice/reviews/reviews.js');
const backofficeAuth = read('property/backoffice/backoffice-dev-auth.js');

must(usage.includes('action === "social_proof"'), 'Deployed ANCHOR usage contract must expose the social_proof aggregate action.');
must(usage.includes('anchor_relief_profiles'), 'Public people count must use the unique application-user profile source instead of raw run rows.');
must(usage.includes('.eq("public_comment_approved", true)'), 'Only explicitly approved written reviews may be returned as testimonials.');
must(!/select\([^)]*user_id[^)]*review_comment/.test(usage), 'Public testimonial response must not select review user IDs with comments.');

must(socialProxy.includes("new Set(['social_proof', 'record'])"), 'Watchdog same-origin proxy must expose only social-proof read and raw usage-record actions.');
must(socialProxy.includes('/functions/v1/anchor-usage'), 'Watchdog same-origin proxy must use the existing ANCHOR usage service.');
must(socialProxy.includes("ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com'])"), 'Social-proof proxy must stay scoped to Watchdog production hosts.');

must(rating.includes("USAGE_URL='/api/watchdog-anchor-social-proof'"), 'Browser social proof must use the same-origin Watchdog proxy.');
must(rating.includes('people used this'), 'Rating pill must render the people-used count.');
must(rating.includes('REFRESH_MS=60000'), 'Public social proof must refresh automatically.');
must(rating.includes("usageRequest('record')"), 'Successful quick-estimator results must record raw usage automatically.');
must(rating.includes('data-anchor-testimonials'), 'Approved testimonials must render below the ANCHOR disclaimer host.');

must(reviewsPage.includes('data-access-require="developer"'), 'Review moderation page must be developer-only.');
must(reviewsApi.includes('/rest/v1/rpc/is_watchdog_developer'), 'Review moderation API must independently enforce developer access.');
must(reviewsApi.includes("action === 'approve'") && reviewsApi.includes("action === 'unpublish'"), 'Review moderation API must support publish and unpublish actions.');
must(!reviewsApi.includes('application_id') && !reviewsApi.includes('user_id'), 'Review moderation API source must not expose application/user identifiers in its response contract.');
must(reviewsApi.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Privileged review access must stay server-side.');
must(reviewsJs.includes("API='/api/watchdog-backoffice-reviews'"), 'Review moderation UI must use the same-origin developer API.');
must(backofficeAuth.includes("REVIEWS_API='/api/watchdog-backoffice-reviews'"), 'Backoffice notification badge must use the same developer API.');
must(backofficeAuth.includes('bo-review-badge') && backofficeAuth.includes('pending_count'), 'Backoffice must show a red pending-review notification count.');

console.log('ANCHOR social proof + Backoffice review moderation contract passed.');
