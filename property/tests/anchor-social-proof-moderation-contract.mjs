import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const rating = read('property/js/anchor-rating-summary.js');
const postfileCss = read('property/css/anchor-postfile.css');
const usage = read('supabase/functions/anchor-usage/index.ts');
const socialProxy = read('api/watchdog-anchor-social-proof.js');
const reviewsApi = read('api/watchdog-backoffice-reviews.js');
const reviewsPage = read('property/backoffice/reviews/index.html');
const reviewsJs = read('property/backoffice/reviews/reviews.js');
const backofficeAuth = read('property/backoffice/backoffice-dev-auth.js');

must(usage.includes('action === "social_proof"'), 'Deployed ANCHOR usage contract must expose the social_proof aggregate action.');
must(usage.includes('anchor_relief_profiles'), 'Legacy people count must remain privacy-safe and use the one-per-user relief profile source.');
must(usage.includes('anchor_applications') && usage.includes('.eq("tax_year", 2025)') && usage.includes('.eq("status", "generated")'), 'Prepared-application social proof must count generated 2025 applications.');
must(usage.includes('prepared_application_count'), 'Social-proof response must expose prepared_application_count.');
must(usage.includes('.limit(20)'), 'Approved written reviews must provide enough rows for the carousel.');
must(usage.includes('.eq("public_comment_approved", true)'), 'Only explicitly approved written reviews may be returned as testimonials.');
must(!/select\([^)]*user_id[^)]*review_comment/.test(usage), 'Public testimonial response must not select review user IDs with comments.');

must(socialProxy.includes("new Set(['social_proof', 'record'])"), 'Watchdog same-origin proxy must expose only social-proof read and raw usage-record actions.');
must(socialProxy.includes('/functions/v1/anchor-usage'), 'Watchdog same-origin proxy must use the existing ANCHOR usage service.');
must(socialProxy.includes("ALLOWED_HOSTS = new Set(['www.watchdogindex.com', 'watchdogindex.com'])"), 'Social-proof proxy must stay scoped to Watchdog production hosts.');

must(rating.includes("USAGE_URL='/api/watchdog-anchor-social-proof'"), 'Browser social proof must use the same-origin Watchdog proxy.');
must(rating.includes('applications prepared with Watchdog'), 'Rating pill must render the prepared-application count without claiming Watchdog filed with NJ.');
must(!rating.includes('people used this'), 'Rating pill must no longer use the people-used copy.');
must(rating.includes("STATUS_URL='https://propertytaxreliefstatus.nj.gov/'"), 'Status card must link to the official NJ Property Tax Relief Status Checker.');
must(rating.includes("link.referrerPolicy='no-referrer'"), 'Official status handoff must suppress the Watchdog referrer.');
must(rating.includes("link.rel='noopener noreferrer'"), 'Official status handoff must isolate the new tab.');
must(!rating.includes('STATUS_URL+\'?') && !rating.includes('STATUS_URL+"?'), 'SSN/ITIN or ZIP must never be appended to the official status URL.');
must(rating.includes("prev.setAttribute('aria-label','Previous review')") && rating.includes("next.setAttribute('aria-label','Next review')"), 'Review carousel must have accessible previous/next controls.');
must(rating.includes('reviewItems.length>1'), 'Review arrows must appear only when multiple approved reviews exist.');
must(rating.includes("postfile.href='/property/css/anchor-postfile.css'"), 'Review/status split-grid stylesheet must load with the social-proof runtime.');
must(postfileCss.includes('grid-template-columns: repeat(2,minmax(0,1fr))'), 'Desktop post-file section must use a two-column grid.');
must(postfileCss.includes('@media (max-width: 780px)') && postfileCss.includes('grid-template-columns: minmax(0,1fr)'), 'Post-file section must stack on narrower screens.');
must(rating.includes('REFRESH_MS=60000'), 'Public social proof must refresh automatically.');
must(rating.includes("usageRequest('record')"), 'Successful quick-estimator results must record raw usage automatically.');
must(rating.includes('data-anchor-testimonials'), 'Approved testimonials and status handoff must render below the ANCHOR disclaimer host.');
must(rating.includes("quickObserver.observe(result,{attributes:true,attributeFilter:['hidden','class','style'],childList:true,subtree:true,characterData:true})"), 'Quick-estimator state changes must be observed only on the result region.');
must(rating.includes('observe(document.documentElement,{childList:true,subtree:true})'), 'Global observer must be limited to DOM insertion/removal discovery.');
must(!rating.includes('observe(document.documentElement,{childList:true,subtree:true,attributes:true'), 'Global observer must never watch all attribute changes; that can recurse on its own UI writes and freeze refresh.');

must(reviewsPage.includes('data-access-require="developer"'), 'Review moderation page must be developer-only.');
must(reviewsApi.includes('/rest/v1/rpc/is_watchdog_developer'), 'Review moderation API must independently enforce developer access.');
must(reviewsApi.includes("action === 'approve'") && reviewsApi.includes("action === 'unpublish'"), 'Review moderation API must support publish and unpublish actions.');
must(!reviewsApi.includes('application_id') && !reviewsApi.includes('user_id'), 'Review moderation API source must not expose application/user identifiers in its response contract.');
must(reviewsApi.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Privileged review access must stay server-side.');
must(reviewsJs.includes("API='/api/watchdog-backoffice-reviews'"), 'Review moderation UI must use the same-origin developer API.');
must(backofficeAuth.includes("REVIEWS_API='/api/watchdog-backoffice-reviews'"), 'Backoffice notification badge must use the same developer API.');
must(backofficeAuth.includes('bo-review-badge') && backofficeAuth.includes('pending_count'), 'Backoffice must show a red pending-review notification count.');

console.log('ANCHOR social proof + Backoffice review moderation contract passed.');
