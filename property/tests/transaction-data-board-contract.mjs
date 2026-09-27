import fs from 'node:fs';

// Transactions, Data Center and Data Workbench in the board design (presentation only).
function read(p){ return fs.readFileSync(p,'utf8'); }
function must(v,m){ if(!v) throw new Error(m); }

const tx=read('transaction/index.html'), txCss=read('transaction/transaction-board.css');
must(tx.indexOf('/transaction/transaction-board.css')>tx.indexOf('/transaction/client-room.css'), 'Transaction board styles must load after every transaction style layer.');
must(!/\.txv2-secondary[,)]/.test(txCss.split('/* Other tabs')[0]), 'The secondary tab panel must not be styled as a pill button.');
must(txCss.includes('[aria-current]:not([aria-current="false"])'), 'Active transaction tabs must match any truthy aria-current value.');

const dc=read('property/data-center/index.html'), dw=read('property/data-workbench/index.html'), dataCss=read('property/css/data-board.css');
must(dc.indexOf('/property/css/data-board.css')>dc.indexOf('/property/css/data-center-public-v2.css'), 'Data Center board styles must load last.');
must(dw.includes('/property/css/data-board.css"') && !/data-board\.css\?/.test(dw), 'Data Workbench loads data-board.css without a query string.');
must(!/\.(dwi|dwa)-trigger\{/.test(dataCss) && dataCss.includes(':not(.dwi-trigger):not(.dwa-trigger)'), 'Watchdog Intelligence triggers keep their own brand treatment.');

for (const [name,css] of [['transaction-board.css',txCss],['data-board.css',dataCss]]) {
  must(!/content:\s*"[^"]*[A-Za-z]{4,}/.test(css) && !css.includes('border-left'), name+' must not inject text or use border-left accents.');
  must(css.includes('@media print'), name+' must print cleanly.');
}
console.log('Transaction and data pages board contract passed.');
