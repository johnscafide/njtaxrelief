#!/usr/bin/env node
'use strict';
/* Import an official NJ General Tax Rates PDF into property/tax-rates.json.
   Usage: node property/scripts/parse-tax-rates-pdf.js 2025taxrates.pdf */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const input=process.argv[2];
if(!input||!fs.existsSync(input)){console.error('Usage: node property/scripts/parse-tax-rates-pdf.js <tax-rates.pdf>');process.exit(1)}
const temp=path.join(os.tmpdir(),`nj-tax-rates-${process.pid}.txt`);execFileSync('pdftotext',['-layout',input,temp]);const lines=fs.readFileSync(temp,'utf8').split(/\r?\n/);fs.rmSync(temp,{force:true});
let year=null,county=null;const rows=[];
for(const raw of lines){const y=raw.match(/\b(20\d{2})\s+General Tax Rates\b/i);if(y){year=Number(y[1]);continue}const c=raw.match(/^\s*([A-Za-z ]+?)\s+County\s*$/);if(c){county=c[1].trim().toUpperCase();continue}if(!year||!county||/DISTRICT\s+General Tax Rate/i.test(raw))continue;const m=raw.match(/^\s*(.+?)\s+(?:\*\*RAD\s+)?(\d+\.\d+)\s+(\d+\.\d+)\s*$/);if(!m)continue;const district=m[1].trim().replace(/\s+/g,' ').toUpperCase();rows.push({key:`${district} (${county})`,district,county,general:Number(m[2]),effective:Number(m[3])})}
if(!year)throw new Error('Could not detect publication year');if(rows.length<550)throw new Error(`Validation failed: expected statewide coverage, found ${rows.length} districts`);
const output=path.resolve(__dirname,'../tax-rates.json');const doc=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{rates:{}};doc.rates=doc.rates||{};
for(const row of rows){doc.rates[row.key]=doc.rates[row.key]||{};doc.rates[row.key][String(year)]=row.general}
doc._source={agency:'NJ Division of Taxation',publication:'General Tax Rates by County and Municipality',latest_imported_year:year,source_file:path.basename(input),imported_at:new Date().toISOString(),districts_imported:rows.length,unit:'dollars per $100 taxable assessed value',effective_tax_rate_imported:false};
fs.writeFileSync(output,JSON.stringify(doc,null,2)+'\n');console.log(`Imported ${rows.length} ${year} general tax rates into ${output}`);
