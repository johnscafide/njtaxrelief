// Renders the approved concept mockup (Docs/mockups/watchdog-agent-app-mockups.html) to the reference PNGs the
// desktop harness compares against (preview: compareScreens -Pref=reference).
//
//   node tools/render-mockups.mjs [outDir] [--scale N] [--screens a,b,c]
//
// outDir defaults to preview/reference. --scale is the device scale factor: 1 (default) writes 412 px wide
// files that keep the committed folder small; 2 writes the crisp 824 px captures used while designing.
// Output per screen and theme: android-<screen>-<light|dark>.png, plus android-<screen>-<theme>-full.png for the
// scrolling screens, and android-screen-text.json with the visible text of every screen (light theme).
//
// Needs Playwright with Chromium: `npm i playwright && npx playwright install chromium` next to this file or
// anywhere on NODE_PATH. PLAYWRIGHT_CHROMIUM_PATH can point at a Chromium binary when the managed one is absent.
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

// Screens in mockup order; ids match ScreenCatalog and the file names the harness looks for.
const SCREENS = ['welcome', 'today', 'property', 'scan', 'clients', 'farm', 'marketing', 'intelligence', 'notifications', 'settings'];
// Screens whose content scrolls: a second, full-height capture shows the whole page.
const FULL = ['today', 'property', 'clients', 'intelligence', 'settings', 'scan', 'marketing'];
const screens = only ? SCREENS.filter((s) => only.includes(s)) : SCREENS;
if (screens.length === 0) throw new Error(`no known screens in --screens; known: ${SCREENS.join(', ')}`);

const candidates = [process.env.PLAYWRIGHT_CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: scale });
await page.goto('file://' + PAGE);
await page.waitForTimeout(800);
await page.evaluate(() => document.fonts.ready);
const fontsOk = await page.evaluate(() => document.fonts.check('700 16px "Plus Jakarta Sans"'));
if (!fontsOk) console.warn('warning: Plus Jakarta Sans did not load; renders will use a fallback font');
const missing = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-missing]')].map((e) => e.getAttribute('data-missing')))]);
if (missing.length) console.warn('missing icons:', missing);

const texts = {};
let written = 0;
for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light';
  await page.evaluate((d) => { document.documentElement.classList.toggle('app-dark', d); }, dark);
  await page.evaluate(() => { const st = document.getElementById('__full'); if (st) st.remove(); });
  await page.waitForTimeout(150);
  for (const s of screens) {
    const fig = page.locator(`figure.dev[data-os="android"][data-screen="${s}"]:not([data-dark])`).first();
    await fig.scrollIntoViewIfNeeded();
    const scr = fig.locator('.scr');
    await scr.screenshot({ path: path.join(outDir, `android-${s}-${theme}.png`), animations: 'disabled' });
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
  for (const s of screens.filter((x) => FULL.includes(x))) {
    const fig = page.locator(`figure.dev[data-os="android"][data-screen="${s}"]:not([data-dark])`).first();
    await fig.scrollIntoViewIfNeeded();
    await fig.locator('.scr').screenshot({ path: path.join(outDir, `android-${s}-${theme}-full.png`), animations: 'disabled' });
    written++;
  }
}
if (!only) fs.writeFileSync(path.join(outDir, 'android-screen-text.json'), JSON.stringify(texts, null, 2) + '\n');
await browser.close();
const total = fs.readdirSync(outDir).filter((f) => f.startsWith('android-')).reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`wrote ${written} renders at ${scale}x to ${outDir} (${(total / 1024 / 1024).toFixed(2)} MB in android-* files)`);
