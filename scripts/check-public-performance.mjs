const targets = [
  { label: 'Watchdog Index', url: 'https://www.watchdogindex.com/' },
  { label: 'Property lookup', url: 'https://www.watchdogindex.com/property/' },
];

const reportOnly = process.argv.includes('--report-only');
const strategy = process.env.PSI_STRATEGY || 'mobile';
const minPerformance = Number(process.env.PSI_MIN_PERFORMANCE || '0.55');
const maxLcpMs = Number(process.env.PSI_MAX_LCP_MS || '6000');
const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';

function finite(name, value) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

finite('PSI_MIN_PERFORMANCE', minPerformance);
finite('PSI_MAX_LCP_MS', maxLcpMs);

async function audit(target) {
  const params = new URLSearchParams({ url: target.url, strategy, category: 'performance' });
  if (apiKey) params.set('key', apiKey);

  const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${target.label}: ${data?.error?.message || `PageSpeed ${response.status}`}`);

  const performance = Number(data?.lighthouseResult?.categories?.performance?.score ?? NaN);
  const lcpMs = Number(data?.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue ?? NaN);
  const lcpDisplay = data?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || 'unknown';
  const passed = Number.isFinite(performance) && Number.isFinite(lcpMs) && performance >= minPerformance && lcpMs <= maxLcpMs;

  return { ...target, performance, lcpMs, lcpDisplay, passed };
}

console.log(`Watchdog public performance regression check (${strategy})`);
console.log(`Thresholds: performance >= ${minPerformance.toFixed(2)}, LCP <= ${Math.round(maxLcpMs)} ms`);

const results = [];
for (const target of targets) {
  try {
    const result = await audit(target);
    results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.label}: performance ${(result.performance * 100).toFixed(0)}, LCP ${Math.round(result.lcpMs)} ms (${result.lcpDisplay})`);
  } catch (error) {
    results.push({ ...target, passed: false, error: String(error?.message || error) });
    console.error(`ERROR ${target.label}: ${String(error?.message || error)}`);
  }
}

const failures = results.filter((result) => !result.passed);
if (failures.length) {
  console.error(`Performance regression check found ${failures.length} failing surface${failures.length === 1 ? '' : 's'}.`);
  if (!reportOnly) process.exitCode = 1;
} else {
  console.log('All monitored public surfaces are within the current regression thresholds.');
}
