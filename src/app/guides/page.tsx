import type { Metadata } from 'next';
import Link from 'next/link';
import { guides } from '@/lib/guides';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/chrome';
export const metadata: Metadata = {
  title: 'Practical guides for client delivery',
  description:
    'Actionable guides to collecting client content, managing revisions, and keeping freelance projects moving.',
  alternates: { canonical: '/guides' },
  openGraph: {
    title: 'Practical guides for client delivery',
    description: 'Useful workflows for onboarding, revisions, and project delivery.',
    url: '/guides',
    images: ['/opengraph-image'],
  },
};
export default function Guides() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-page-hero">
          <span className="m-eyebrow">THE CLIENTLANE FIELD GUIDE</span>
          <h1>
            Less friction.
            <br />A clearer way to work.
          </h1>
          <p>Practical steps you can use with your next client, with or without Clientlane.</p>
        </section>
        <section className="m-section m-guide-grid">
          {guides.map((g) => (
            <Link className="m-guide-card" key={g.slug} href={`/guides/${g.slug}`}>
              <span>{g.category}</span>
              <h2>{g.title}</h2>
              <p>{g.description}</p>
              <small>{g.readTime} →</small>
            </Link>
          ))}
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
