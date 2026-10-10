import Link from 'next/link';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/chrome';

export default function NotFound() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-page-hero m-fallback">
          <span className="m-eyebrow">PAGE NOT FOUND</span>
          <h1>This page isn’t here.</h1>
          <p>The address may have changed. Head back to your projects or explore Clientlane.</p>
          <div className="m-actions">
            <Link className="m-button" href="/app">
              Go to your workspace
            </Link>
            <Link className="m-text-link" href="/">
              Back to home
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
