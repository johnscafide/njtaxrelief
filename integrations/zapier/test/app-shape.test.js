const test = require('node:test');
const assert = require('node:assert/strict');

const App = require('../index');
const pkg = require('../package.json');

const expectedTriggers = [
  'intelligence_finding_created',
  'property_signal_changed',
  'report_ready',
  'watchlist_alert',
];

const expectedSearches = [
  'find_property',
  'get_property_snapshot',
];

const expectedCreates = [
  'add_to_watchlist',
  'attach_crm_context',
  'remove_from_watchlist',
  'run_intelligence_analysis',
];

function sampleValue(sample, outputKey) {
  const path = outputKey.split('__');
  let value = sample;
  for (const segment of path) {
    if (value == null || !Object.prototype.hasOwnProperty.call(value, segment)) return undefined;
    value = value[segment];
  }
  return value;
}

test('pins the publication candidate to Zapier v1.1.0 on Node 22+', () => {
  assert.equal(App.version, '1.1.0');
  assert.equal(pkg.version, '1.1.0');
  assert.equal(pkg.engines.node, '>=22');
});

test('exposes the production 4 trigger / 2 search / 4 action catalog', () => {
  assert.deepEqual(Object.keys(App.triggers).sort(), expectedTriggers);
  assert.deepEqual(Object.keys(App.searches).sort(), expectedSearches);
  assert.deepEqual(Object.keys(App.creates).sort(), expectedCreates);
});

test('keeps self-service API key authentication as the v1 boundary', () => {
  assert.equal(App.authentication.type, 'custom');
  assert.equal(App.authentication.fields.some((field) => field.key === 'apiKey'), true);
  assert.equal(typeof App.authentication.test, 'function');
  assert.equal(App.authentication.connectionLabel, '{{key_label}}');
  assert.equal(App.authentication.connectionLabel.includes('apiKey'), false);
  assert.equal(Array.isArray(App.beforeRequest), true);
  assert.equal(App.beforeRequest.length > 0, true);
});

test('all instant triggers implement the complete REST Hook lifecycle', () => {
  for (const key of expectedTriggers) {
    const trigger = App.triggers[key];
    assert.equal(trigger.operation.type, 'hook', `${key} must be a hook trigger`);
    assert.equal(typeof trigger.operation.performSubscribe, 'function', `${key} missing performSubscribe`);
    assert.equal(typeof trigger.operation.performUnsubscribe, 'function', `${key} missing performUnsubscribe`);
    assert.equal(typeof trigger.operation.perform, 'function', `${key} missing perform`);
    assert.equal(typeof trigger.operation.performList, 'function', `${key} missing performList`);
  }
});

test('trigger samples are publication-shaped and match every declared output field', () => {
  for (const key of expectedTriggers) {
    const trigger = App.triggers[key];
    const sample = trigger.operation.sample;
    const fields = trigger.operation.outputFields || [];
    const keys = fields.map((field) => field.key);

    assert.ok(sample && typeof sample === 'object', `${key} must define a sample`);
    assert.ok(sample.id, `${key} sample must include id`);
    assert.ok(sample.event_type, `${key} sample must include event_type`);
    assert.ok(sample.event_key, `${key} sample must include event_key`);
    assert.ok(sample.occurred_at, `${key} sample must include occurred_at`);
    assert.equal(new Set(keys).size, keys.length, `${key} output field keys must be unique`);

    for (const outputKey of keys) {
      assert.notEqual(
        sampleValue(sample, outputKey),
        undefined,
        `${key} sample is missing declared output field ${outputKey}`,
      );
    }
  }
});

test('searches and actions expose labels, samples, and executable perform handlers', () => {
  for (const [kind, catalog, keys] of [
    ['search', App.searches, expectedSearches],
    ['action', App.creates, expectedCreates],
  ]) {
    for (const key of keys) {
      const item = catalog[key];
      assert.ok(item.display?.label, `${kind} ${key} missing label`);
      assert.equal(typeof item.operation?.perform, 'function', `${kind} ${key} missing perform`);
      assert.ok(item.operation?.sample, `${kind} ${key} missing sample`);
      const outputKeys = (item.operation.outputFields || []).map((field) => field.key);
      assert.equal(new Set(outputKeys).size, outputKeys.length, `${kind} ${key} output keys must be unique`);
    }
  }
});
