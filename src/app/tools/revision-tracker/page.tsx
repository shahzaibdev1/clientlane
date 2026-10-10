import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingHeader, MarketingFooter } from '@/components/marketing/chrome';
import { RevisionTool } from '@/components/marketing/revision-tool';
export const metadata: Metadata = {
  title: 'Free client revision tracker',
  description:
    'Track included and used revision rounds, calculate remaining allowance, and download a clear summary for your client. No signup required.',
  alternates: { canonical: '/tools/revision-tracker' },
};
export default function RevisionPage() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-page-hero">
          <span className="m-eyebrow">FREE TOOL · NO SIGNUP</span>
          <h1>
            Keep “one more change”
            <br />
            in perspective.
          </h1>
          <p>
            A simple revision allowance tracker. Nothing you enter here is submitted to a server.
          </p>
        </section>
        <section className="m-section m-tool-wrap">
          <RevisionTool />
          <aside className="m-tool-upsell">
            <div>
              <h2>Want revisions linked to actual deliveries?</h2>
              <p>
                Clientlane tracks version-specific feedback, approvals, and extra-work agreements
                across your projects.
              </p>
            </div>
            <Link className="m-button" href="/demo">
              Explore the demo →
            </Link>
          </aside>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
