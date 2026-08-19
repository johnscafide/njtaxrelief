const App = require('../index');

describe('Watchdog Zapier app contract', () => {
  it('exposes the production trigger catalog', () => {
    expect(Object.keys(App.triggers).sort()).toEqual([
      'intelligence_finding_created',
      'property_signal_changed',
      'report_ready',
      'watchlist_alert',
    ]);
  });

  it('exposes governed property searches', () => {
    expect(Object.keys(App.searches).sort()).toEqual([
      'find_property',
      'get_property_snapshot',
    ]);
  });

  it('exposes bidirectional Watchlist and Intelligence actions', () => {
    expect(Object.keys(App.creates).sort()).toEqual([
      'add_to_watchlist',
      'attach_crm_context',
      'remove_from_watchlist',
      'run_intelligence_analysis',
    ]);
  });

  it('keeps API key authentication as the connector auth boundary', () => {
    expect(App.authentication.type).toBe('custom');
    expect(App.authentication.fields.some((field) => field.key === 'apiKey')).toBe(true);
  });
});
