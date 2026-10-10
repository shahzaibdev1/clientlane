import Link from 'next/link';
import { ArrowUpRight, Layers3 } from 'lucide-react';
export function MarketingHeader() {
  return (
    <header className="m-header">
      <Link className="m-brand" href="/" aria-label="Clientlane home">
        <span className="m-brand-icon">
          <Layers3 size={21} />
        </span>
        clientlane<span className="m-brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/features">Features</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/tools/revision-tracker">Free tool</Link>
      </nav>
      <div className="m-header-actions">
        <Link className="m-login" href="/login">
          Log in
        </Link>
        <Link className="m-button small" href="/login?mode=signup">
          Start your workspace <ArrowUpRight size={15} />
        </Link>
      </div>
    </header>
  );
}
export function MarketingFooter() {
  return (
    <footer className="m-footer">
      <div>
        <Link className="m-brand" href="/">
          clientlane.
        </Link>
        <p>Good work deserves a clearer process.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/features">Features</Link>
        <Link href="/guides">Practical guides</Link>
        <Link href="/tools/revision-tracker">Revision tracker</Link>
        <Link href="/demo">Explore the demo</Link>
      </nav>
      <small>Built for independent work. Payments are not connected.</small>
    </footer>
  );
}
export function MarketingCTA() {
  return (
    <section className="m-cta">
      <span className="m-eyebrow light">LESS CHASING. CLEARER DELIVERY.</span>
      <h2>
        Your next project can
        <br />
        feel more under control.
      </h2>
      <p>See the full workflow with sample projects, or start with your own.</p>
      <div className="m-actions">
        <Link className="m-button lime" href="/login?mode=signup">
          Start your workspace <ArrowUpRight size={18} />
        </Link>
        <Link className="m-text-link light" href="/demo">
          Explore the demo →
        </Link>
      </div>
      <small>No card or payment required to create an account.</small>
    </section>
  );
}
