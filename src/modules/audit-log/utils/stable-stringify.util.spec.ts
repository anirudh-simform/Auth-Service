import { stableStringify } from './stable-stringify.util';

describe('stableStringify', () => {
  it('produces identical output regardless of key insertion order', () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };

    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('sorts keys inside arrays of objects too', () => {
    const a = [{ b: 1, a: 2 }];
    const b = [{ a: 2, b: 1 }];

    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('produces different output for genuinely different values', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });

  it('handles null and primitive values', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(42)).toBe('42');
  });
});
