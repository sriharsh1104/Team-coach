import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  title: string;
  updated: string;
  children: ReactNode;
};

/** Shared shell for public Play-required legal pages (privacy, terms, deletion). */
export function LegalDocLayout({ title, updated, children }: Props) {
  return (
    <div className="legal-shell">
      <div className="brand-watermark auth" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <article className="legal-doc">
        <p className="legal-eyebrow">
          <Link to="/">Sacred Esports</Link>
        </p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-body">{children}</div>
        <nav className="legal-nav" aria-label="Legal pages">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/delete-account">Delete Account</Link>
          <Link to="/">Home</Link>
        </nav>
      </article>
    </div>
  );
}
