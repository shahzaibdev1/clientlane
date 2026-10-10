import type { MetadataRoute } from 'next';
import { guides } from '@/lib/guides';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
  return [
    '',
    '/features',
    '/guides',
    '/tools/revision-tracker',
    ...guides.map((g) => `/guides/${g.slug}`),
  ].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
