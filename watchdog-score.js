/* Compatibility shim only.
   The canonical Watchdog Score is ROBUST-v1 and lives in
   /property/js/watchdog-score-core.js + /property/js/dashboard/tools/watchdog-score.js.
   Do not add score logic to this root file. */
import './property/js/dashboard/tools/watchdog-score.js';
export {};
