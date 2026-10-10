import type { Metadata } from 'next';
import { MarketingHeader, MarketingFooter, MarketingCTA } from '@/components/marketing/chrome';
import { Check } from 'lucide-react';
export const metadata: Metadata = {
  title: 'Client project management features',
  description:
    'Explore client requests, versioned deliveries, approvals, revision tracking, extra-work agreements, and freelancer project management.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'Client project management features',
    description:
      'Client requests, deliveries, approvals, and extra-work agreements in one workspace.',
    url: '/features',
    images: ['/opengraph-image'],
  },
};
const groups = [
  [
    'One place to manage your work',
    'Start with clients and projects. Keep today’s actions, outstanding requests, delivery dates, and decisions visible across your workspace.',
    [
      'Daily overview with waiting and upcoming work',
      'Search and filter projects; archive completed work',
      'Project templates and validated CSV import',
      'Optional collaborators with project-specific access',
    ],
  ],
  [
    'A client portal people can use',
    'Give every project a focused client view, with clear next actions and the relevant work ready to review.',
    [
      'Secure expiring project links that you can revoke',
      'Text and file requests with due dates',
      'Scheduled reminders and grouped weekly updates',
      'Private files and a branded project experience',
    ],
  ],
  [
    'Delivery without the confusion',
    'Keep the draft, feedback, decision, and next revision together. Make changes to scope and dates visible decisions.',
    [
      'Versioned deliveries and version-specific feedback',
      'Explicit approvals and included revision tracking',
      'Extra-work quotes with price and deadline acceptance',
      'Proposed deadline changes and approval history',
    ],
  ],
  [
    'Finish with a clear handover',
    'Turn the project history into something your client can follow, while keeping your internal notes private.',
    [
      'Approved final assets gathered for handover',
      'Milestone progress and agreement history',
      'Workspace data and project exports',
      'Internal notes separate from client-facing information',
    ],
  ],
] as const;
export default function Features() {
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-page-hero">
          <span className="m-eyebrow">THE FULL WORKFLOW</span>
          <h1>Built around the next action.</h1>
          <p>For the freelancer doing everything, and the small team sharing the load.</p>
        </section>
        <section className="m-section m-feature-details">
          {groups.map(([title, description, items], i) => (
            <article key={title}>
              <span className="m-detail-number">0{i + 1}</span>
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
              <ul className="m-check-list">
                {items.map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <p className="m-honest-note">
            Payments are not connected. External tool links do not sync automatically. Email
            reminders require configured email delivery and scheduling.
          </p>
        </section>
        <MarketingCTA />
      </main>
      <MarketingFooter />
    </>
  );
}
