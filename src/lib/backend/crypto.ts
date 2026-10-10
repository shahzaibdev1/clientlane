import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
function key() {
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Configure JOBS_SECRET with at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}
export function newToken() {
  return randomBytes(32).toString('base64url');
}
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function encryptToken(token: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), nonce);
  const bytes = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString('base64url');
}
export function decryptToken(encoded: string) {
  const bytes = Buffer.from(encoded, 'base64url'),
    decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
export function secretMatches(value: string) {
  const expected = process.env.JOBS_SECRET ?? '';
  return (
    expected.length >= 32 &&
    timingSafeEqual(
      createHash('sha256').update(value).digest(),
      createHash('sha256').update(expected).digest(),
    )
  );
}
