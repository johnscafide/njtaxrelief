// Renders the approved concept mockup (Docs/mockups/watchdog-agent-app-mockups.html) to the reference PNGs the
// desktop harness compares against (preview: compareScreens -Pref=reference).
//
//   node tools/render-mockups.mjs [outDir] [--scale N] [--screens a,b,c]
//
// outDir defaults to preview/reference. --scale is the device scale factor: 1 (default) writes 412 px wide
// files that keep the committed folder small; 2 writes the crisp 824 px captures used while designing.
// Output per screen and theme: android-<screen>-<light|dark>.png, exactly the 412 x 892 CSS px frame, plus
// android-<screen>-<theme>-full.png for the screens whose content scrolls (the whole page, as tall as it is),
// and android-screen-text.json with the visible text of every screen (light theme).
//
// Needs Playwright 1.49 or newer with Chromium: `npm i playwright && npx playwright install chromium` next to
// this file or in a parent directory (Node resolves ES module imports from the nearest node_modules). The page
// is rendered by the full Chromium build ({ channel: 'chromium' }), not the headless shell Playwright launches
// by default: the shell rounds glyph advances to whole pixels, which changes line wraps (the Intelligence brief
// grows by 22 px) and would make the references disagree with a real browser and with the earlier captures.
// PLAYWRIGHT_CHROMIUM_PATH can point at a Chromium binary when the managed one is absent.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const PAGE = path.join(repo, 'Docs', 'mockups', 'watchdog-agent-app-mockups.html');
const FONT_DIR = path.join(repo, 'shared', 'src', 'main', 'res', 'font');

const args = process.argv.slice(2);
let outDir = path.join(repo, 'preview', 'reference');
let scale = 1;
let only = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--scale') scale = Number(args[++i]);
  else if (a === '--screens') only = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
  else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
  else outDir = path.resolve(a);
}
if (!Number.isFinite(scale) || scale <= 0) throw new Error('--scale must be a positive number');
if (!fs.existsSync(PAGE)) throw new Error(`mockup page not found: ${PAGE}`);
for (const w of [400, 500, 600, 700, 800]) {
  const f = path.join(FONT_DIR, `plus_jakarta_sans_${w}.ttf`);
  if (!fs.existsSync(f)) throw new Error(`font missing: ${f} (the page loads it via ../../shared/src/main/res/font)`);
}
fs.mkdirSync(outDir, { recursive: true });

// The Pixel frame of the mockup (.phone.android .scr), in CSS px = dp.
const FRAME = { width: 412, height: 892 };
// Screens in mockup order; ids match ScreenCatalog and the file names the harness looks for.
const SCREENS = ['welcome', 'today', 'property', 'scan', 'clients', 'farm', 'marketing', 'intelligence', 'notifications', 'settings'];
// Screens whose content scrolls (the page's own SCROLLS map agrees): a second, full-height capture shows the
// whole page. Scan and Marketing fit the frame, so they have no -full capture; a screen listed here that does
// not grow is skipped, and one that grows but is not listed is reported, so the folder never carries a capture
// the page does not justify.
const FULL = ['today', 'property', 'clients', 'intelligence', 'settings'];
const screens = only ? SCREENS.filter((s) => only.includes(s)) : SCREENS;
if (screens.length === 0) throw new Error(`no known screens in --screens; known: ${SCREENS.join(', ')}`);

const customChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;
if (customChromium && !fs.existsSync(customChromium)) throw new Error(`PLAYWRIGHT_CHROMIUM_PATH does not exist: ${customChromium}`);
const browser = await chromium.launch(customChromium ? { executablePath: customChromium } : { channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: scale });
await page.goto('file://' + PAGE);
await page.waitForTimeout(800);
await page.evaluate(() => document.fonts.ready);
const fontsOk = await page.evaluate(() => document.fonts.check('700 16px "Plus Jakarta Sans"'));
if (!fontsOk) console.warn('warning: Plus Jakarta Sans did not load; renders will use a fallback font');
const missing = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-missing]')].map((e) => e.getAttribute('data-missing')))]);
if (missing.length) console.warn('missing icons:', missing);

const frameOf = (screen) => page.locator(`figure.dev[data-os="android"][data-screen="${screen}"]:not([data-dark]) .scr`).first();

// Captures the frame by a whole-pixel clip rather than as an element screenshot: the frame sits at a fractional
// y inside the bezel and an element screenshot rounds its box outward, which added a bezel-coloured 893rd row.
// The clip is in CSS px, so it stays right at --scale 2. fullPage puts the clip in document coordinates; a
// viewport-relative clip is trimmed to the viewport, and the full-height frames are taller than it.
async function captureFrame(scr, file, height) {
  await scr.scrollIntoViewIfNeeded();
  const box = await scr.boundingBox();
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.screenshot({
    path: file,
    fullPage: true,
    animations: 'disabled',
    clip: { x: Math.round(box.x + scroll.x), y: Math.round(box.y + scroll.y), width: FRAME.width, height },
  });
}

const texts = {};
let written = 0;
for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light';
  await page.evaluate((d) => { document.documentElement.classList.toggle('app-dark', d); }, dark);
  await page.evaluate(() => { const st = document.getElementById('__full'); if (st) st.remove(); });
  await page.waitForTimeout(150);
  for (const s of screens) {
    const scr = frameOf(s);
    await captureFrame(scr, path.join(outDir, `android-${s}-${theme}.png`), FRAME.height);
    written++;
    if (!dark) texts[s] = await scr.evaluate((el) => el.innerText);
  }
  // Full-height captures: let the frame grow with its scrolling content.
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__full';
    st.textContent = '.scr{height:auto!important;min-height:892px}.scroll{position:relative!important;inset:auto!important;overflow:visible!important}';
    document.head.appendChild(st);
  });
  await page.waitForTimeout(150);
  for (const s of screens) {
    const scr = frameOf(s);
    await scr.scrollIntoViewIfNeeded();
    const height = Math.round((await scr.boundingBox()).height);
    const grows = height > FRAME.height;
    const file = path.join(outDir, `android-${s}-${theme}-full.png`);
    let wrote = false;
    if (FULL.includes(s) && grows) {
      await captureFrame(scr, file, height);
      written++;
      wrote = true;
    } else if (FULL.includes(s)) {
      console.log(`${s}: no scrolling content (${height} px), skipping -full`);
    } else if (grows) {
      console.warn(`warning: ${s} scrolls to ${height} px but is not in FULL; no -full capture written`);
    }
    // A capture left over from an earlier version of the page or of this list would be compared as evidence.
    if (!wrote && fs.existsSync(file)) {
      fs.rmSync(file);
      console.log(`removed stale ${path.basename(file)}`);
    }
  }
}
if (!only) fs.writeFileSync(path.join(outDir, 'android-screen-text.json'), JSON.stringify(texts, null, 2) + '\n');
await browser.close();
const total = fs.readdirSync(outDir).filter((f) => f.startsWith('android-')).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`wrote ${written} renders at ${scale}x to ${outDir} (${(total / 1024 / 1024).toFixed(2)} MB in android-* files)`);
