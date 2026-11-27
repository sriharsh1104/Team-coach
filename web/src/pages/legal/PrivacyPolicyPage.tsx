import { Link } from 'react-router-dom';
import { LegalDocLayout } from './LegalDocLayout';

const CONTACT_EMAIL = 'sacredesportsss@gmail.com';

/**
 * Public privacy policy for Google Play / App Store and in-app disclosure.
 * Must stay aligned with Play Console Data safety answers (see PLAY-CONSOLE.md).
 */
export function PrivacyPolicyPage() {
  return (
    <LegalDocLayout title="Privacy Policy" updated="27 November 2026">
      <p>
        This Privacy Policy describes how <strong>Sacred Esports</strong>{' '}
        (&quot;Sacred&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses,
        shares, and deletes information when you use the{' '}
        <strong>Sacred Team Coach</strong> mobile app and the website at{' '}
        <a href="https://sacredesports.com">sacredesports.com</a> (together, the
        &quot;Service&quot;).
      </p>

      <h2>1. Who We Are</h2>
      <p>
        Developer / publisher: Sacred Esports.
        <br />
        Privacy contact:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <h2>2. Information We Collect</h2>
      <p>Depending on how you use the Service, we may collect:</p>
      <ul>
        <li>
          <strong>Account &amp; profile</strong> — name, email address,
          password (hashed) or Google sign-in identifiers, avatar image, role,
          in-game names / UIDs, and social profile links you choose to add.
        </li>
        <li>
          <strong>Phone number</strong> — only if you verify a number through
          our Telegram verification flow.
        </li>
        <li>
          <strong>Team &amp; chat content</strong> — messages, media you upload
          (photos, videos, screenshots), announcements, scrim / stats data, and
          other team content you create.
        </li>
        <li>
          <strong>Voice &amp; live features</strong> — microphone audio (and
          camera if you enable video) while you are in a voice channel or live
          session; this is processed to provide the real-time feature and is
          not sold.
        </li>
        <li>
          <strong>Health &amp; fitness (steps)</strong> — with your permission,
          today&apos;s step count from your phone&apos;s step sensor for the
          in-app Health tracker. We do not use Health Connect for this.
        </li>
        <li>
          <strong>Device &amp; app info</strong> — device model / name you
          register, push notification tokens (via Firebase Cloud Messaging /
          Expo), app version, and basic technical logs needed to run and secure
          the Service.
        </li>
        <li>
          <strong>Security</strong> — two-factor authentication secrets you
          enable, session / device records, and recovery email if you set one.
        </li>
      </ul>
      <p>
        We do not sell personal information. We do not use your data for
        third-party advertising.
      </p>

      <h2>3. How We Use Information</h2>
      <ul>
        <li>Create and manage your account and team memberships</li>
        <li>Provide chat, voice, media, stats, routines, and related features</li>
        <li>Send transactional email (verification, password reset) and push
          notifications you enable</li>
        <li>Secure the Service (authentication, abuse prevention, 2FA)</li>
        <li>Improve reliability and fix bugs</li>
        <li>Respond to support requests</li>
      </ul>

      <h2>4. How We Share Information</h2>
      <p>We share data only as needed to operate the Service:</p>
      <ul>
        <li>
          <strong>Teammates / org members</strong> — profile and content
          visibility follows your in-app privacy controls (e.g. phone, social
          links, IGN).
        </li>
        <li>
          <strong>Service providers</strong> — hosting, database, email
          delivery, and push notification infrastructure (including Google
          Firebase for FCM on Android) process data on our behalf.
        </li>
        <li>
          <strong>Legal</strong> — if required by law or to protect users and
          the Service.
        </li>
      </ul>

      <h2>5. Permissions on Android</h2>
      <p>
        The app may request device permissions such as microphone, camera,
        photos / media, notifications, physical activity (steps), Bluetooth
        (voice), biometric unlock, and related foreground services for voice /
        screen features. Each permission is used only for the feature that
        needs it; you can deny non-essential permissions in system settings.
      </p>

      <h2>6. Security</h2>
      <p>
        We transmit data over HTTPS / TLS. Passwords are stored hashed. Access
        to production systems is limited. No method of transmission or storage
        is 100% secure; please use a strong password and enable 2FA when
        available.
      </p>

      <h2>7. Retention &amp; Deletion</h2>
      <p>
        We keep account and team data while your account is active. You can
        delete your account in the app under{' '}
        <strong>Settings → Account Settings → Delete Or Deactivate</strong>, or
        on the web at{' '}
        <Link to="/delete-account">Delete Account</Link>. When you delete your
        account, we delete associated personal data from our primary systems,
        except where we must retain limited records for security, fraud
        prevention, or legal compliance (for example short-lived server logs).
        Team-owned content may remain if other members still need it after you
        leave.
      </p>
      <p>
        Deactivating an account pauses access but does not delete your data —
        only Delete Account does.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is intended for users who can create an account under
        applicable law. It is not directed at children under 13. If you believe
        a child has provided personal data, contact us and we will take
        appropriate steps.
      </p>

      <h2>9. Your Choices</h2>
      <ul>
        <li>Edit or remove profile fields and social links in the app / site</li>
        <li>Control teammate visibility under Account Settings → Privacy</li>
        <li>Revoke device permissions in Android / iOS settings</li>
        <li>Disable notifications in system settings</li>
        <li>
          Request account and data deletion via the{' '}
          <Link to="/delete-account">Delete Account</Link> page or email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>

      <h2>10. International Users</h2>
      <p>
        Servers may be located outside your country. By using the Service you
        understand your information may be processed in the countries where we
        or our providers operate, with safeguards appropriate to the Service.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy. The &quot;Last updated&quot; date at the top
        will change. Continued use after changes means you accept the updated
        policy. Material changes may also be noted in the app or on the site.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about privacy:{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Privacy%20inquiry`}>
          {CONTACT_EMAIL}
        </a>
      </p>
    </LegalDocLayout>
  );
}
