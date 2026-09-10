import fs from 'node:fs';

const source = fs.readFileSync('property/js/dashboard/home/home-property-first-impression-compact.js', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

assert(!source.includes("'.wdfi-photo-fallback{"), 'Property Home compact runtime must not style the obsolete photo fallback overlay');
assert(source.includes("querySelectorAll('.wdfi-photo-fallback')"), 'Property Home must defensively find late-injected photo fallback nodes');
assert(source.includes('removePhotoFallback(document)'), 'Property Home must remove the fallback during normal refreshes');
assert(source.includes("node.matches('.wdfi-photo-fallback')"), 'Property Home observer must remove a fallback inserted after initial render');
assert(source.includes('.wd-photo-add'), 'Standalone homeowner photo action styling must remain available');

console.log('PASS: Property Home photo fallback cannot obscure the free map');
