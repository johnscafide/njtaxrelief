// Towns whose own CO application Watchdog can fill in (property/data/co-application-forms.json).
// Each entry pins the town's PDF by SHA-256 and maps its form fields to the /co/<county>/<town>/apply
// answers. If a town changes its PDF, the hash stops matching and filling pauses for that town.
const fs = require('fs');
const path = require('path');

let cached = null;
function forms() {
  if (cached) return cached;
  try { cached = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'property', 'data', 'co-application-forms.json'), 'utf8')).forms || {}; } catch (_) { cached = {}; }
  return cached;
}
function formFor(code) { return /^\d{4}$/.test(String(code || '')) ? forms()[code] || null : null; }

module.exports = { forms, formFor };
