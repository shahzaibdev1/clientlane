export function parseAmountCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter a nonnegative amount with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('This amount is too large. Use an amount no greater than 90071992547409.91.');
  return Number(cents);
}
