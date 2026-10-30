// Link pages: page checks, the public page drawing and the /links/<slug> route.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const must = (condition, message) => { if (!condition) throw new Error(message); };

const LP = require('../backoffice/link-pages/link-page-render.js');
const api = require('../../api/watchdog-link-pages.js')._test;
const ours = (u) => api.photoOk(u);
const photo = api.PHOTO_PREFIX + 'u/a.jpg';

must(LP.cleanUrl('example.com/x') === 'https://example.com/x' && LP.cleanUrl('https://a.b/c?d=1') === 'https://a.b/c?d=1', 'Web links are kept, bare domains get https.');
for (const bad of ['javascript:alert(1)', 'mailto:a@b.com', 'tel:5551212', 'sms:5551212', 'data:text/html,x', 'hello', 'https://user:pw@a.com']) must(LP.cleanUrl(bad) === '', `${bad} must be refused.`);
must(LP.socialUrl('instagram', '@heather.sells') === 'https://www.instagram.com/heather.sells' && LP.socialUrl('tiktok', 'thetaxwatchdog') === 'https://www.tiktok.com/@thetaxwatchdog', 'Handles turn into profile links.');
must(LP.socialUrl('instagram', 'https://instagram.com/x') === 'https://instagram.com/x', 'Full social links are kept.');

const input = {
  profile: { name: 'Heather <b>', bio: 'Homes \u2014 South Jersey', photo, verified: true, ring: 'gradient' },
  blocks: [
    { id: 'aaa', type: 'link', label: 'Search homes', url: 'opuselitesj.com', featured: true, image: 'https://evil.example/x.jpg' },
    { id: 'bbb', type: 'link', label: '', url: '' },
    { id: 'ccc', type: 'heading', text: 'Listings' },
    { id: 'ddd', type: 'countdown', title: 'Open house', date: '2099-05-01T13:00' },
    { id: 'eee', type: 'link', label: 'Hidden', url: 'https://a.com', hidden: true },
    { type: 'script', text: 'x' }
  ],
  socials: [{ id: 's1', network: 'instagram', url: '@heather' }, { network: 'nope', url: 'x' }],
  theme: { preset: 'blush', bg: 'red', text: '#123456' },
  footer: 'NJ License #1'
};
const { page, errors } = LP.cleanPage(input, ours);
must(!errors.length, 'A good page has no errors: ' + errors.join(' '));
must(page.blocks.length === 4 && page.blocks[0].url === 'https://opuselitesj.com/' && page.blocks[0].image === '', 'Empty links and unknown blocks drop, outside photos are refused.');
must(!/\u2014/.test(page.profile.bio), 'Typed em dashes are swapped out.');
must(page.theme.bg === LP.PRESETS.blush.bg && page.theme.text === '#123456', 'Bad colors fall back to the theme.');
must(page.socials.length === 1 && page.socials[0].url === 'https://www.instagram.com/heather', 'Only known social sites are kept.');
must(LP.cleanPage({ profile: { name: 'X' }, blocks: [{ type: 'link', label: 'Call', url: 'tel:555' }] }, ours).errors.length === 1, 'Phone links are refused with a message.');
must(LP.cleanPage({ profile: { name: '' } }, ours).errors[0] === 'Add your name.', 'A name is required.');

const html = LP.renderPage(page, { slug: 'heather', story: '<!--\n\n Hi There -->\n', now: Date.UTC(2026, 9, 30) });
must(html.includes('Heather &lt;b&gt;') && !html.includes('Heather <b>'), 'Everything typed is escaped.');
must(html.includes('href="https://opuselitesj.com/"') && html.includes('data-i="aaa"') && html.includes('is-featured'), 'Links draw with tap tracking.');
must(!html.includes('Hidden'), 'Hidden links stay off the page.');
must(html.includes('fa-instagram') && html.includes('brands.min.css'), 'Social icons draw.');
must(html.includes('data-slug="heather"') && html.includes('/api/link-page') && html.includes('rel="canonical" href="https://www.watchdogindex.com/links/heather"'), 'The public page counts views and has a canonical link.');
must(/Hi There/.test(html), 'Public link pages carry John’s story comment.');
must(!/tel:|mailto:/i.test(html) && !/\u2014/.test(html), 'No phone or email links and no em dashes.');
must(!/Inter|Plus Jakarta|Poppins|Playfair/.test(JSON.stringify(LP.FONTS)), 'Only fonts John allows.');
must(!LP.renderPage(LP.cleanPage({ profile: { name: 'X' }, blocks: [{ type: 'countdown', title: 'Old', date: '2020-01-01T00:00' }] }, ours).page, {}).includes('lp-count"'), 'Past countdowns are left off.');
must(LP.njTime('2026-07-01T12:00') === Date.UTC(2026, 6, 1, 16) && LP.njTime('2026-12-01T12:00') === Date.UTC(2026, 11, 1, 17), 'Countdown dates are NJ time.');
const preview = LP.renderPage(page, { preview: true });
must(!preview.includes('<body data-slug') && !preview.includes('Hi There') && preview.includes('target="_blank"'), 'The Backoffice preview never counts views.');

must(LP.SLUG.test('heather') && LP.SLUG.test('john-s') && !LP.SLUG.test('-x') && !LP.SLUG.test('Heather') && !LP.SLUG.test('a'.repeat(41)), 'Slug rules.');
const mw = fs.readFileSync(new URL('../../middleware.js', import.meta.url), 'utf8');
must(/LINK_PAGE_PATH/.test(mw) && mw.indexOf('linkPageMatch') < mw.indexOf('if(host!==WATCHDOG_HOST)return next();'), '/links/<slug> works on both hosts.');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
must(vercel.rewrites.some((r) => r.source === '/backoffice/link-pages'), 'Backoffice route exists.');
console.log('link pages contract ok');
