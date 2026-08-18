import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const requiredFiles = [
  'property/docs/compliance/README.md',
  'property/docs/compliance/CONTROL-REGISTER.md',
  'property/docs/compliance/DECISION-LOG.md',
  'property/docs/compliance/CONNECTOR-REGISTER.md',
  'property/data/compliance-log.json',
  'property/compliance/index.html',
  'property/js/compliance.js',
  'property/css/compliance.css',
  'api/compliance-log.js'
];
requiredFiles.forEach((relative) => assert.equal(exists(relative), true, `Missing compliance artifact: ${relative}`));

const data = JSON.parse(read('property/data/compliance-log.json'));
assert.equal(data.program, 'Watchdog Compliance Readiness');
assert.equal(data.status, 'readiness-in-progress');
assert.match(String(data.certification_claim || ''), /No .*certification|No .*claim|No independent/i,
  'Compliance metadata must explicitly avoid unverified certification claims.');
assert.ok(Array.isArray(data.entries) && data.entries.length > 0, 'Compliance log must contain at least one evidence entry.');

const requiredEntryFields = [
  'id', 'date', 'title', 'frameworks', 'control_area', 'status', 'action', 'evidence', 'rationale', 'residual_risk', 'next_step'
];
const seenIds = new Set();
for (const entry of data.entries) {
  for (const field of requiredEntryFields) {
    assert.ok(entry[field] != null && entry[field] !== '', `${entry.id || 'Unknown entry'} missing ${field}`);
  }
  assert.match(entry.id, /^WCR-\d{4}-\d{2}-\d{2}-\d{3}$/);
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(seenIds.has(entry.id), false, `Duplicate compliance log ID: ${entry.id}`);
  seenIds.add(entry.id);
  assert.ok(Array.isArray(entry.frameworks) && entry.frameworks.length > 0, `${entry.id} must map to at least one framework.`);
  assert.ok(Array.isArray(entry.evidence) && entry.evidence.length > 0, `${entry.id} must identify evidence.`);
  assert.ok(String(entry.action).length >= 40, `${entry.id} action is too vague to be useful audit evidence.`);
  assert.ok(String(entry.rationale).length >= 40, `${entry.id} rationale is too vague.`);
  assert.ok(String(entry.residual_risk).length >= 20, `${entry.id} must identify residual risk.`);
  assert.ok(String(entry.next_step).length >= 20, `${entry.id} must identify a meaningful next step.`);
}

const serialized = JSON.stringify(data);
for (const pattern of [
  /sk_live_[A-Za-z0-9]+/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /service_role\s*[:=]\s*["'][^"']+/i,
  /password\s*[:=]\s*["'][^"']+/i,
  /secret\s*[:=]\s*["'][^"']+/i
]) {
  assert.doesNotMatch(serialized, pattern, 'Compliance evidence must not contain obvious secrets or private credentials.');
}

const page = read('property/compliance/index.html');
assert.match(page, /data-access-require="developer"/, 'Compliance Center must remain developer-gated.');
assert.match(page, /name="robots" content="[^"]*noindex[^"]*nofollow/i, 'Compliance Center must remain noindex/nofollow.');
assert.match(page, /noarchive/i, 'Compliance Center must opt out of search-engine caching.');
assert.match(page, /No independent certification is claimed/i, 'Compliance Center must display a clear assurance disclaimer.');

const client = read('property/js/compliance.js');
assert.match(client, /DATA_URL\s*=\s*['"]\/api\/compliance-log['"]/, 'Compliance UI must load evidence from the protected API.');
assert.match(client, /Authorization:\s*['"]Bearer ['"]\s*\+\s*token/, 'Compliance UI must send the authenticated developer bearer token.');
assert.doesNotMatch(client, /DATA_URL\s*=\s*['"]\/property\/data\/compliance-log\.json['"]/, 'Compliance UI must not fetch the static evidence JSON directly.');

const api = read('api/compliance-log.js');
assert.match(api, /is_watchdog_developer/, 'Compliance API must verify Watchdog developer status server-side.');
assert.match(api, /Authorization/, 'Compliance API must require the authenticated bearer session.');
assert.match(api, /private, no-store/, 'Compliance API responses must not be cacheable.');
assert.match(api, /noindex, nofollow, noarchive, nosnippet/, 'Compliance API must explicitly opt out of indexing and snippets.');
assert.match(api, /status\(404\)/, 'Unauthorized compliance evidence requests should not advertise a protected resource.');

const register = read('property/docs/compliance/CONTROL-REGISTER.md');
for (const name of ['SOC 2', 'NIST', 'OWASP ASVS', 'WCAG 2.2', 'PCI DSS', 'NJDPA', 'ISO/IEC 27001']) {
  assert.match(register, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Control register must include ${name}.`);
}
assert.match(register, /CONNECTOR-REGISTER\.md/,
  'Material connector governance must remain linked from the control register.');

const connectors = read('property/docs/compliance/CONNECTOR-REGISTER.md');
for (const field of [
  'Data transmitted to provider',
  'Data classification',
  'Scopes/permissions',
  'Provider retention/deletion behavior',
  'Privacy policy impact',
  'Offboarding procedure',
  'Residual risks'
]) {
  assert.match(connectors, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `Connector review template must include ${field}.`);
}
assert.match(connectors, /does not mean it is production-live/i,
  'Connector register must distinguish observed integrations from verified production-live integrations.');

const charter = read('property/docs/compliance/README.md');
assert.match(charter, /at least one substantive readiness improvement/i);
assert.match(charter, /new material connector/i);
assert.match(charter, /No website or sales copy may claim a certification/i);

console.log('Watchdog compliance evidence contracts passed.');
