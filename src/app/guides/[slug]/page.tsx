import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guides } from '@/lib/guides';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/chrome';
export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = guides.find((g) => g.slug === slug);
  return guide
    ? {
        title: guide.title,
        description: guide.description,
        alternates: { canonical: `/guides/${slug}` },
        openGraph: {
          title: guide.title,
          description: guide.description,
          type: 'article',
          url: `/guides/${slug}`,
          siteName: 'Clientlane',
          images: ['/opengraph-image'],
        },
      }
    : {};
}
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guides.find((g) => g.slug === slug);
  if (!guide) notFound();
  return (
    <>
      <MarketingHeader />
      <main id="main" className="m-article-wrap">
        <Link className="m-text-link" href="/guides">
          ← All guides
        </Link>
        <article>
          <span className="m-eyebrow">
            {guide.category} · {guide.readTime}
          </span>
          <h1>{guide.title}</h1>
          <p className="m-article-intro">{guide.intro}</p>
          {guide.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.text}</p>
              {'checklist' in section && (
                <ul>
                  {section.checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
        <aside className="m-article-cta">
          <h2>Put the process into practice.</h2>
          <p>Try requests, deliveries, and approvals with sample client projects.</p>
          <Link className="m-button" href="/demo">
            Explore the demo →
          </Link>
        </aside>
      </main>
      <MarketingFooter />
    </>
  );
}
