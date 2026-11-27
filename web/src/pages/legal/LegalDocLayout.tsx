import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SocialFooter } from '../home/SocialFooter';

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

const LEGAL_TABS = [
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/delete-account', label: 'Delete Account' },
] as const;

/** Shared shell for public Play-required legal pages — same chrome as the landing site. */
export function LegalDocLayout({ title, updated, children }: Props) {
  const { pathname } = useLocation();

  return (
    <div className="landing legal-landing">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>

      <header className="landing-nav legal-topnav">
        <Link to="/" className="legal-brand">
          Sacred <span>Esports</span>
        </Link>
        <nav className="landing-tabs" aria-label="Legal pages">
          {LEGAL_TABS.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`landing-tab${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="legal-main">
        <article className="legal-doc">
          <div className="legal-doc-glow" aria-hidden="true" />
          <p className="landing-eyebrow">Sacred Team Coach</p>
          <h1 className="legal-title">{title}</h1>
          <p className="legal-updated">Last updated: {updated}</p>
          <div className="legal-body">{children}</div>
          <nav className="legal-nav" aria-label="Related legal pages">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/delete-account">Delete Account</Link>
            <Link to="/">Back to Home</Link>
          </nav>
        </article>
      </main>

      <SocialFooter />
    </div>
  );
}
