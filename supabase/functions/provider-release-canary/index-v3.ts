// Structured-value bootstrap for provider release canaries.
// JSON object key order is not semantically meaningful, but JSONB metadata can
// reorder keys. Canonicalize object keys so index-v2 exact assertions compare
// structured values by content while preserving array order.
const originalStringify = JSON.stringify.bind(JSON);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

JSON.stringify = ((value: unknown, replacer?: any, space?: string | number) =>
  originalStringify(canonicalize(value), replacer, space)) as typeof JSON.stringify;

await import('./index-v2.ts');
