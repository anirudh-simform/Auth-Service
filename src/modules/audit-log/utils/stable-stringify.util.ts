/**
 * JSON.stringify with object keys sorted recursively. Used so hashing a value
 * gives the same result regardless of key insertion order - Postgres jsonb
 * doesn't preserve original key order, so a plain JSON.stringify of a value
 * read back from the DB could differ from the value's insert-time bytes even
 * when the data itself hasn't changed.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, sortKeysDeep(entryValue)] as const);
    return Object.fromEntries(sortedEntries);
  }

  return value;
}
