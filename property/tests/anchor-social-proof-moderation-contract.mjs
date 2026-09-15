import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const rating = read('property/js/anchor-rating-summary.js');
const usage = read('supabase/functions/anchor-usage/index.ts');
const reviewsApi = read('supabase/functions/backoffice-reviews/index.ts');
const reviewsPage = read('property/backoffice/reviews/index.html');
const reviewsJs = read('property/backoffice/reviews/reviews.js');
const backofficeAuth = read('property/backoffice/backoffice-dev-auth.js');
const gateway = read('api/watchdog-backoffice-gateway.js');

must(usage.includes('host === "watchdogindex.com"') && usage.includes('host === "www.watchdogindex.com"'), 'ANCHOR social proof must allow both WatchdogIndex production hosts.');
must(usage.includes('action === "social_proof"'), 'ANCHOR usage Edge Function must expose the social_proof aggregate action.');
must(usage.includes('anchor_relief_profiles'), 'Public people count must use the unique application-user profile source instead of raw run rows.');
must(usage.includes('.eq("public_comment_approved", true)'), 'Only explicitly approved written reviews may be returned as testimonials.');
must(!/select\([^)]*user_id[^)]*review_comment/.test(usage), 'Public testimonial response must not select review user IDs with comments.');

must(rating.includes("people used this"), 'Rating pill must render the people-used count.');
must(rating.includes('REFRESH_MS=60000'), 'Public social proof must refresh automatically.');
must(rating.includes("usageRequest('record')"), 'Successful quick-estimator results must record raw usage automatically.');
must(rating.includes('data-anchor-testimonials'), 'Approved testimonials must render below the ANCHOR disclaimer host.');

must(reviewsPage.includes('data-access-require="developer"'), 'Review moderation page must be developer-only.');
must(reviewsApi.includes('is_watchdog_developer'), 'Review moderation API must independently enforce developer access.');
must(reviewsApi.includes('action === "approve"') && reviewsApi.includes('action === "unpublish"'), 'Review moderation API must support publish and unpublish actions.');
must(!reviewsApi.includes('application_id') && !reviewsApi.includes('user_id'), 'Review moderation API source must not expose application/user identifiers in its response contract.');
must(reviewsJs.includes("target=reviews"), 'Review moderation UI must use the same-origin Backoffice gateway.');
must(gateway.includes("target === 'reviews'"), 'Backoffice gateway must proxy the review moderation endpoint.');
must(backofficeAuth.includes('bo-review-badge') && backofficeAuth.includes('pending_count'), 'Backoffice must show a red pending-review notification count.');

console.log('ANCHOR social proof + Backoffice review moderation contract passed.');
