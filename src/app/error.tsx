'use client';

import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/chrome';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-page-hero m-fallback" role="alert">
          <span className="m-eyebrow">LET’S TRY THAT AGAIN</span>
          <h1>We couldn’t load this page.</h1>
          <p>Try again in a moment. Your saved project records stay in your workspace.</p>
          <div className="m-actions">
            <button className="m-button" onClick={() => retry()}>
              Try again
            </button>
            <Link className="m-text-link" href="/app">
              Go to your workspace
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
