import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync('property/js/tax-year-intelligence.js','utf8');const ctx={window:{},Number,parseInt,String,Object,Math};vm.createContext(ctx);vm.runInContext(code,ctx);
const W=ctx.window.WatchdogTaxYears;function ok(x,m){if(!x)throw new Error(m)}
const rates={'LINDENWOLD BORO (CAMDEN)':{'2025':4.769}};
const reval={town:'LINDENWOLD BORO',county:'CAMDEN',assessed:262300,assessment_year:2026,last_year_tax:6129,last_year_tax_year:2025};
ok(W.mismatch(reval),'revaluation mismatch must be detected');ok(W.model(reval,rates).projected_tax===null,'must not project with an old rate');
const same={town:'LINDENWOLD BORO',county:'CAMDEN',assessed:123300,assessment_year:2025,last_year_tax:6129,last_year_tax_year:2025};
ok(W.model(same,rates).published_rate===4.769,'same-year published rate should resolve');ok(W.model(same,rates).projected_tax>0,'same-year projection should calculate');
console.log('tax-year guard contract passed');
