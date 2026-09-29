/* Shared marker runtime for the Data Center and the Data Workbench.
   - One marker-registry download per page. Every caller receives its own parsed copy,
     because several scripts decorate the catalog object they are given.
   - One vocabulary for provider result states, so every page labels a missing value
     the same way and never shows a blank that looks like data.
   - One explicit map from parcel-record markers to parcel-record fields. Only
     property-scope MOD-IV record fields may be read from the parcel row; town, county
     and derived markers must come from their own provider or stay explicitly missing. */
(function () {
  'use strict';
  if (window.WatchdogMarkerRuntime) return;

  var REGISTRY_URL = '/property/data/marker-registry.json';
  var pending = null;

  function registryText() {
    if (!pending) {
      pending = fetch(REGISTRY_URL, { cache: 'no-cache', credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('Marker registry HTTP ' + response.status);
        return response.text();
      });
      // A failed download must not be cached, so Retry can fetch again.
      pending.catch(function () { pending = null; });
    }
    return pending;
  }

  function registry() {
    return registryText().then(function (text) { return JSON.parse(text); });
  }

  var STATUS = {
    source_checked_no_value: ['No value at source', 'Watchdog checked the source for this property, but the source does not publish a value for this field.'],
    not_computed: ['Not yet scored', 'No trusted score observation exists for this property yet.'],
    dependency_missing: ['Missing inputs', 'An input this calculated field needs is not available for this property, so no value is shown.'],
    provider_missing: ['Not connected yet', 'This field is in the catalog, but no live source is connected for it yet.'],
    provider_error: ['Source unavailable', 'The source could not be reached. Try again later.'],
    not_entitled: ['Higher plan required', 'This field is not included in your current plan.'],
    redacted_by_source: ['Redacted by state', 'The state source withholds this field.']
  };

  function statusLabel(status) {
    var entry = STATUS[String(status || '')];
    return entry ? entry[0] : 'Not available';
  }

  function statusHint(status) {
    var entry = STATUS[String(status || '')];
    return entry ? entry[1] : 'No value was returned for this field.';
  }

  // Marker id -> parcel-row field. Mirrors propField() in supabase/functions/workbench-hydrate.
  var PARCEL = {
    'property.address': 'address', 'property.municipality': 'town', 'property.county': 'county',
    'property.zip': 'zip', 'property.block': 'block', 'property.lot': 'lot', 'property.qualifier': 'qualifier',
    'property.pams_pin': 'pams_pin', 'property.property_class': 'prop_class', 'property.class': 'prop_class',
    'property.use': 'prop_use', 'property.year_built': 'year_built', 'property.acres': 'acres',
    'property.lot_area': 'acres', 'property.units': 'dwelling_units', 'property.building_description': 'building_desc',
    'property.land_assessment': 'land_value', 'property.land_value': 'land_value',
    'property.improvement_assessment': 'improvement_value', 'property.improvement_value': 'improvement_value',
    'property.assessed_value': 'assessed_value', 'property.assessed': 'assessed',
    'property.annual_tax': 'last_year_tax', 'property.sale_price': 'last_sale_price',
    'property.last_sale_price': 'last_sale_price', 'property.sale_date': 'deed_date', 'property.deed_date': 'deed_date',
    'property.last_sale_year': 'last_sale_year', 'property.deed_book': 'deed_book', 'property.deed_page': 'deed_page',
    'property.owner_name': 'owner_name', 'property.lat': 'lat', 'property.lon': 'lon', 'property.treasury_code': 'cd_code',
    'watchdog.market_value_estimate': 'watchdog_value', 'watchdog.effective_tax_rate': 'effective_rate',
    'fema.flood_zone': '__flood_zone', 'fema.flood_risk': '__flood_risk'
  };

  function present(value) { return value !== null && value !== undefined && value !== ''; }

  function parcelValue(id, row) {
    if (!row) return null;
    id = String(id || '');
    if (id === 'property.assessed_value' || id === 'property.assessed') return present(row.assessed_value) ? row.assessed_value : (present(row.assessed) ? row.assessed : null);
    if (id === 'property.lot_area_sqft') {
      var acres = Number(row.acres);
      if (present(row.acres) && Number.isFinite(acres) && acres > 0) return Math.round(acres * 43560);
      return present(row.shape_area) ? row.shape_area : null;
    }
    var field = PARCEL[id];
    if (!field) return null;
    return present(row[field]) ? row[field] : null;
  }

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
    return Number(value);
  }

  function formatNumber(value, digits) {
    return value.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 2 : digits });
  }

  function formatScalar(id, value, unit) {
    var n = number(value);
    if (n == null) return String(value);
    unit = String(unit || '').toLowerCase();
    var key = String(id || '').toLowerCase();
    if (unit === 'currency' || unit === 'usd') return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    if (unit === 'currency_per_acre') return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) + ' per acre';
    if (unit === 'currency_per_capita') return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) + ' per resident';
    if (unit === 'percent') return formatNumber(n, 2) + '%';
    if (unit === 'score / 100') return formatNumber(n, 1) + ' / 100';
    if (unit === 'square feet' || unit === 'square_feet') return formatNumber(n, 0) + ' sq ft';
    if (unit === 'acres') return formatNumber(n, 3) + ' acres';
    if (unit === 'years' || unit === 'days') return formatNumber(n, 1) + ' ' + unit;
    if (unit === 'count' || unit === 'units' || unit === 'year') return formatNumber(n, 0);
    if (unit === 'ratio') return formatNumber(n, 3);
    // No declared unit: format only when the field name is unambiguous.
    if (/year/.test(key) && Number.isInteger(n) && n >= 1600 && n <= 2200) return String(n);
    if (/(assessed_value|assessed_appealed|assessment|annual_tax|last_year_tax|sale_price|market_value|land_value|improvement_value|_levy($|_\d{4})|appropriation|reduction|overpayment|median_price)/.test(key) && !/(rate|ratio|share|pct|percent|cagr|growth|change|count)/.test(key)) {
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    }
    return formatNumber(n, 3);
  }

  // Structured provider values (annual histories, ordered assessment traces) are summarized
  // for a table cell and written out in full for exports. They never render as [object Object].
  function formatValue(id, value, marker, options) {
    if (!present(value)) return '';
    var unit = marker && marker.unit;
    var full = options && options.full;
    if (Array.isArray(value)) {
      if (!value.length) return '';
      if (value.every(function (item) { return item && typeof item === 'object' && 'year' in item; })) {
        var rows = value.slice().sort(function (a, b) { return Number(a.year) - Number(b.year); });
        var describe = function (item) {
          var parts = Object.keys(item).filter(function (k) { return k !== 'year' && present(item[k]) && typeof item[k] !== 'object'; });
          return item.year + ': ' + parts.map(function (k) { return k.replace(/_/g, ' ') + ' ' + formatScalar(k, item[k], unit); }).join(', ');
        };
        if (full) return rows.map(describe).join('; ');
        return describe(rows[rows.length - 1]) + ' · ' + rows.length + ' yrs';
      }
      return value.map(function (item) { return typeof item === 'object' ? JSON.stringify(item) : formatScalar(id, item, unit); }).join(full ? '; ' : ', ');
    }
    if (typeof value === 'object') {
      var years = Object.keys(value).filter(function (k) { return /^(19|20)\d{2}$/.test(k); }).sort();
      if (years.length) {
        if (full) return years.map(function (y) { return y + ': ' + formatScalar(id, value[y], unit); }).join('; ');
        var last = years[years.length - 1];
        return last + ': ' + formatScalar(id, value[last], unit) + ' · ' + years.length + ' yrs';
      }
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return formatScalar(id, value, unit);
  }

  window.WatchdogMarkerRuntime = {
    registryUrl: REGISTRY_URL,
    registry: registry,
    statusLabel: statusLabel,
    statusHint: statusHint,
    parcelValue: parcelValue,
    formatValue: formatValue,
    present: present
  };
})();
