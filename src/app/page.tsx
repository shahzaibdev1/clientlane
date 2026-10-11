import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Check, Clock3, FileCheck2, MessageSquare, Plus } from 'lucide-react';
import { MarketingHeader, MarketingFooter, MarketingCTA } from '@/components/marketing/chrome';
import { guides } from '@/lib/guides';
export const metadata: Metadata = { alternates: { canonical: '/' } };
const faq = [
  [
    'Can I use Clientlane on my own?',
    'Yes. Start as a freelancer with your own clients and projects. Invite collaborators to specific projects when you need help.',
  ],
  [
    'Do clients need to create an account?',
    'Clients use a secure project link to submit materials, review deliveries, and approve work. You can expire or revoke their access.',
  ],
  [
    'Does it replace my design or development tools?',
    'Use it alongside your existing tools. Link to work in progress or upload deliveries, then keep client requests and decisions together. External links do not automatically sync.',
  ],
  [
    'Can I collect payments here?',
    'Payment processing is not connected yet. You can agree on a price for additional work, then collect payment through your existing process.',
  ],
];
export default function Page() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';
  return (
    <>
      <MarketingHeader />
      <main id="main">
        <section className="m-hero">
          <div className="m-hero-copy">
            <span className="m-eyebrow">
              <span className="m-live-dot" /> FOR FREELANCERS & SMALL AGENCIES
            </span>
            <h1>
              Great client work.
              <br />
              Less <span className="m-hand">back-and-forth.</span>
            </h1>
            <p>
              Know what needs your attention, what your clients owe you, and which version they
              actually approved. All in one calm workspace.
            </p>
            <div className="m-actions">
              <Link className="m-button" href="/signup">
                Start your workspace <ArrowUpRight size={18} />
              </Link>
              <Link className="m-text-link" href="/demo">
                Explore the demo →
              </Link>
            </div>
            <div className="m-trust">
              <span>
                <Check size={14} /> Solo-friendly
              </span>
              <span>
                <Check size={14} /> No WordPress required
              </span>
              <span>
                <Check size={14} /> No card needed
              </span>
            </div>
          </div>
          <div
            className="m-product-preview"
            aria-label="Illustration of a freelancer workspace with sample projects"
          >
            <div className="m-preview-top">
              <span className="m-preview-dots">● ● ●</span>
              <span>Alex’s studio / Today</span>
              <span className="m-avatar">A</span>
            </div>
            <div className="m-preview-body">
              <div className="m-preview-side">
                <span className="m-preview-logo">c.</span>
                <span className="active">◈</span>
                <span>▤</span>
                <span>◎</span>
                <span>⚙</span>
              </div>
              <div className="m-preview-main">
                <div className="m-preview-heading">
                  <div>
                    <small>YOUR WORK, AT A GLANCE</small>
                    <h2>A clear next step.</h2>
                  </div>
                  <span className="m-preview-add">
                    <Plus size={16} />
                  </span>
                </div>
                <div className="m-preview-stats">
                  <div>
                    <strong>06</strong>
                    <span>Active projects</span>
                  </div>
                  <div>
                    <strong>03</strong>
                    <span>Waiting on clients</span>
                  </div>
                  <div>
                    <strong>02</strong>
                    <span>Ready to review</span>
                  </div>
                </div>
                <div className="m-preview-row">
                  <span className="m-project-icon peach">N</span>
                  <div>
                    <strong>Northstar website</strong>
                    <small>Homepage · Version 2</small>
                  </div>
                  <span className="m-pill amber">Awaiting approval</span>
                </div>
                <div className="m-preview-row">
                  <span className="m-project-icon lilac">A</span>
                  <div>
                    <strong>Arc brand refresh</strong>
                    <small>Logo files requested</small>
                  </div>
                  <span className="m-pill">Waiting on client</span>
                </div>
                <div className="m-preview-row">
                  <span className="m-project-icon mint">K</span>
                  <div>
                    <strong>Kindred landing page</strong>
                    <small>Final delivery approved</small>
                  </div>
                  <span className="m-pill green">Approved</span>
                </div>
                <div className="m-preview-bottom">
                  <Clock3 size={16} />
                  <span>One weekly update. Every next action together.</span>
                </div>
              </div>
            </div>
            <span className="m-preview-label">SAMPLE WORKSPACE</span>
            <div className="m-floating-card">
              <span className="m-floating-check">
                <Check size={19} />
              </span>
              <div>
                <strong>Version 2 approved</strong>
                <small>Decision saved. Ready for handover.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="m-principles">
          <span>
            Your clients get clarity.
            <br />
            <strong>You get your focus back.</strong>
          </span>
          <div>Collect the right inputs</div>
          <div>Keep feedback together</div>
          <div>Agree on extra work</div>
        </section>
        <section className="m-section">
          <div className="m-section-heading">
            <span className="m-eyebrow">FROM FIRST BRIEF TO FINAL HANDOVER</span>
            <h2>
              The parts between the work,
              <br />
              finally connected.
            </h2>
            <p>
              A shared place for the things that usually disappear into emails, spreadsheets, and
              “just one more change.”
            </p>
          </div>
          <div className="m-feature-grid">
            {[
              {
                icon: Clock3,
                title: 'Know where to focus today',
                body: 'See upcoming deliveries, missing client materials, and overdue decisions across your projects.',
                label: 'YOUR DAILY OVERVIEW',
              },
              {
                icon: MessageSquare,
                title: 'Make client responses easy',
                body: 'Give clients specific requests and a simple project link. Set reminders for outstanding inputs.',
                label: 'LESS FOLLOWING UP',
              },
              {
                icon: FileCheck2,
                title: 'Keep the agreement clear',
                body: 'Track delivery versions, included revisions, approvals, and accepted quotes for extra work.',
                label: 'DELIVER WITH CLARITY',
              },
            ].map(({ icon: Icon, title, body, label }) => (
              <article className="m-feature" key={title}>
                <span className="m-feature-icon">
                  <Icon size={25} />
                </span>
                <small>{label}</small>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="m-two-col m-section">
          <div className="m-client-card">
            <div className="m-client-top">
              <span className="m-avatar">N</span>
              <span>Northstar / Website project</span>
              <span className="m-pill green">Client view</span>
            </div>
            <h3>Here’s what we need from you.</h3>
            <p>Two small steps to keep your project moving.</p>
            <div className="m-client-task">
              <span className="m-task-number">1</span>
              <div>
                <strong>Share your homepage copy</strong>
                <small>Upload your document or paste your text.</small>
              </div>
              <span>↗</span>
            </div>
            <div className="m-client-task">
              <span className="m-task-number">2</span>
              <div>
                <strong>Review the latest design</strong>
                <small>Approve version 2 or request changes.</small>
              </div>
              <span>↗</span>
            </div>
            <div className="m-client-tabs">
              <span>Next action</span>
              <span>Review work</span>
              <span>Files</span>
            </div>
          </div>
          <div className="m-section-heading left">
            <span className="m-eyebrow">SIMPLE ON BOTH SIDES</span>
            <h2>
              Your clients shouldn’t
              <br />
              need a tutorial.
            </h2>
            <p>
              A focused portal shows what they need to do next. No team setup, complicated boards,
              or hunting for the latest file.
            </p>
            <ul className="m-check-list">
              <li>
                <Check size={18} /> Secure project links with revocable access
              </li>
              <li>
                <Check size={18} /> Feedback and decisions on the right version
              </li>
              <li>
                <Check size={18} /> A clear record of accepted changes
              </li>
            </ul>
            <Link className="m-text-link" href="/features">
              Explore the full workflow →
            </Link>
          </div>
        </section>
        <section className="m-section m-guide-section">
          <div className="m-section-heading left">
            <span className="m-eyebrow">PRACTICAL, NOT JUST PRODUCT TALK</span>
            <h2>A better process starts here.</h2>
          </div>
          <div className="m-guide-grid">
            {guides.map((g) => (
              <Link href={`/guides/${g.slug}`} className="m-guide-card" key={g.slug}>
                <span>{g.category}</span>
                <h3>{g.title}</h3>
                <small>
                  {g.readTime} <ArrowUpRight size={17} />
                </small>
              </Link>
            ))}
          </div>
        </section>
        <section className="m-section m-faq">
          <div className="m-section-heading left">
            <span className="m-eyebrow">A FEW GOOD QUESTIONS</span>
            <h2>Before you jump in.</h2>
          </div>
          <div>
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <MarketingCTA />
      </main>
      <MarketingFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Clientlane',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: base,
            description: 'Client delivery management for freelancers and small agencies.',
          }).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq.map(([q, a]) => ({
              '@type': 'Question',
              name: q,
              acceptedAnswer: { '@type': 'Answer', text: a },
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />
    </>
  );
}
