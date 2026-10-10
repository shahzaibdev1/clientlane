export function safeNext(next: string | null) {
  if (
    !next ||
    next.includes('\\') ||
    Array.from(next).some((c) => c.charCodeAt(0) <= 32) ||
    /%(?:0[ad]|5c)/i.test(next)
  )
    return '/app';
  try {
    const url = new URL(next, 'https://clientlane.invalid');
    if (
      url.origin !== 'https://clientlane.invalid' ||
      !['/app', '/reset'].some(
        (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
      )
    )
      return '/app';
    return url.pathname + url.search;
  } catch {
    return '/app';
  }
}
