import fs from 'node:fs';

const example = fs.readFileSync('property/tests/anchor-njgis-fallback-fixture.txt','utf8').trim();
if (!/^11 Dalton Place, Sicklerville, NJ 08081$/i.test(example)) {
  throw new Error('ANCHOR NJ GIS fallback regression fixture changed unexpectedly.');
}
console.log('ANCHOR NJ GIS fixture contract passed.');
