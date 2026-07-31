#!/usr/bin/env node
'use strict';
/*
  Parser scaffold for NJ CoefficientDeviations.pdf.
  Install: npm i pdf-parse
  Run: node property/scripts/parse-cod-pdf.js path/to/CoefficientDeviations.pdf

  NJ PDF layouts may change annually, so this intentionally validates extracted
  rows and refuses to overwrite production JSON when parsing is uncertain.
*/
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node parse-cod-pdf.js <CoefficientDeviations.pdf>');
  if (!fs.existsSync(input)) throw new Error(`File not found: ${input}`);
  let pdfParse;
  try { pdfParse = require('pdf-parse'); }
  catch { throw new Error('Missing dependency. Run: npm i pdf-parse'); }

  const parsed = await pdfParse(fs.readFileSync(input));
  const lines = parsed.text.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  const candidates = [];
  const rowPattern = /^(.+?)\s+(\d{1,2}(?:\.\d+)?)$/;
  for (const line of lines) {
    const match = line.match(rowPattern);
    if (!match) continue;
    const cod = Number(match[2]);
    if (cod > 0 && cod < 100) candidates.push({label:match[1], cod});
  }

  const reviewPath = path.resolve(process.cwd(), 'cod-parse-review.json');
  fs.writeFileSync(reviewPath, JSON.stringify({source:path.basename(input), candidates}, null, 2));
  console.log(`Extracted ${candidates.length} candidate rows.`);
  console.log(`Review file written to ${reviewPath}`);
  console.log('No production data was overwritten. Map county/municipality/year fields after review.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
