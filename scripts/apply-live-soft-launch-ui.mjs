import { readFile, writeFile } from 'node:fs/promises';

async function transform(path, edits) {
  let text = await readFile(path, 'utf8');
  for (const edit of edits) {
    if (text.includes(edit.to)) continue;
    if (!text.includes(edit.from)) {
      throw new Error(`Soft-launch UI transform could not find expected source in ${path}: ${edit.label}`);
    }
    text = text.replace(edit.from, edit.to);
  }
  await writeFile(path, text, 'utf8');
}

await transform('property/js/app-shell-2027.js', [
  {
    label: 'topbar brand home link',
    from: '<a class="wdx-brand" href="/property/dashboard">',
    // The app shell now builds its links with route(), so the brand already points
    // at the clean root property lookup; this edit is satisfied by that markup.
    to: '<a class="wdx-brand" href="\'+route(\'/\')+\'" aria-label="Watchdog property lookup">'
  }
]);

await transform('property/partials/sidemenu.html', [
  {
    label: 'legacy desktop brand fallback',
    from: '<a class="db-side-brand" href="/property/dashboard" aria-label="Watchdog dashboard">',
    to: '<a class="db-side-brand" href="/property/" aria-label="Watchdog property lookup">'
  },
  {
    label: 'legacy mobile brand fallback',
    from: '<header><a class="wd-mobile-menu-brand" href="/property/dashboard">',
    to: '<header><a class="wd-mobile-menu-brand" href="/property/" aria-label="Watchdog property lookup">'
  }
]);

// /pro (property/pro/index.html and property/js/pro.js) used to be rewritten
// here from launch-list copy to live-checkout copy. The 2026 page ships the
// live copy in source, so there is nothing left to transform; the contract
// (property/tests/live-soft-launch-ui-contract.mjs) still checks it.

console.log('Live soft-launch UI prepared.');
