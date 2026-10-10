export function authCookieOptions(appUrl: string | undefined) {
  try {
    return { secure: Boolean(appUrl && new URL(appUrl).protocol === 'https:') };
  } catch {
    return { secure: false };
  }
}
