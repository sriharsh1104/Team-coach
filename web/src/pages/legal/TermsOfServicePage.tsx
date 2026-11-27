import { Link } from 'react-router-dom';
import { LegalDocLayout } from './LegalDocLayout';

const CONTACT_EMAIL = 'sacredesportsss@gmail.com';

export function TermsOfServicePage() {
  return (
    <LegalDocLayout title="Terms of Service" updated="27 November 2026">
      <p>
        These Terms govern your use of <strong>Sacred Team Coach</strong> and
        related Sacred Esports services (the &quot;Service&quot;). By creating
        an account or using the Service, you agree to these Terms and our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>1. The Service</h2>
      <p>
        Sacred Team Coach helps esports teams coordinate — chat, voice, media,
        schedules, stats, routines, and related tools. Features may change over
        time.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must provide accurate account information.</li>
        <li>You are responsible for activity under your account.</li>
        <li>
          You may delete your account as described on{' '}
          <Link to="/delete-account">Delete Account</Link>.
        </li>
        <li>
          If you own a team, transfer ownership or delete the team before
          deleting your account.
        </li>
      </ul>

      <h2>3. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Harass, abuse, or harm others</li>
        <li>Upload illegal, infringing, or malicious content</li>
        <li>Attempt to break, scrape, or overload the Service</li>
        <li>Impersonate others or misrepresent affiliation</li>
        <li>Use the Service for spam or unauthorized advertising</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these Terms or create
        risk for other users.
      </p>

      <h2>4. Content</h2>
      <p>
        You retain rights to content you upload. You grant Sacred a limited
        license to host, display, and process that content solely to operate
        the Service for you and your teammates. Team admins may moderate
        content in their org.
      </p>

      <h2>5. Third-Party Services</h2>
      <p>
        Sign-in (e.g. Google), push notifications, voice infrastructure, and
        other providers have their own terms. We are not responsible for
        third-party services outside our control.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any
        kind to the fullest extent permitted by law. We do not guarantee
        uninterrupted or error-free operation.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Sacred Esports is not liable
        for indirect, incidental, special, consequential, or punitive damages,
        or loss of data, profits, or goodwill arising from your use of the
        Service.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms. The &quot;Last updated&quot; date will
        change. Continued use after an update constitutes acceptance.
      </p>

      <h2>9. Contact</h2>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalDocLayout>
  );
}
