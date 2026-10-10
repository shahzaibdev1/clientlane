import { expect, test } from 'vitest';
import { parseAmountCents } from '../../src/components/workspace/money';
test.each([
  ['0', 0],
  ['125.50', 12550],
  ['0.01', 1],
  ['90071992547409.90', 9007199254740990],
])('quote amount %s becomes exact integer cents', (value, want) => {
  expect(parseAmountCents(value)).toBe(want);
});
test.each(['1.001', '-1', '90071992547409.92', 'NaN', 'Infinity'])(
  'invalid or unsafe quote amount %s is rejected',
  (value) => {
    expect(() => parseAmountCents(value)).toThrow();
  },
);
