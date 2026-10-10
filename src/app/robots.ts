import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/portal', '/login', '/reset', '/demo', '/auth', '/api', '/invite'],
    },
    sitemap: `${(process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')}/sitemap.xml`,
  };
}
