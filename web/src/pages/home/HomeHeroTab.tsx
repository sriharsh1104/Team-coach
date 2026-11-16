import { isDesktopApp } from '../../lib/platform';

// Desktop installers are published by .github/workflows/desktop-build.yml to
// GitHub Releases under STABLE file names, so "latest/download/<name>" always
// points at the newest build. Override per deploy via env if you host them
// elsewhere (see web/DESKTOP.md "Website download links").
const RELEASES_LATEST =
  'https://github.com/sriharsh1104/Team-coach/releases/latest/download';
const LINUX_URL =
  import.meta.env.VITE_DESKTOP_LINUX_URL?.trim() ||
  `${RELEASES_LATEST}/sacred-esports-linux-x64.deb`;
const WINDOWS_URL =
  import.meta.env.VITE_DESKTOP_WINDOWS_URL?.trim() ||
  `${RELEASES_LATEST}/sacred-esports-windows-x64-setup.exe`;

function DownloadCta({ label, href }: { label: string; href: string }) {
  if (!href) {
    return (
      <button type="button" className="landing-cta" disabled>
        {label}
        <span className="landing-cta-soon">Coming soon</span>
      </button>
    );
  }
  return (
    <a className="landing-cta" href={href} rel="noreferrer">
      {label}
    </a>
  );
}

export function HomeHeroTab() {
  // Inside the installed desktop app the desktop installers are pointless;
  // only the Android CTA stays.
  const inDesktop = isDesktopApp();
  return (
    <section className="landing-hero">
      <p className="landing-eyebrow">Competitive Organisation</p>
      <h1 className="landing-title">Sacred Esports</h1>
      <p className="landing-lead">
        Improve every match. Perform as one. Download the team app, join
        tournaments, or reach the org for tryouts and partnerships.
      </p>
      <div className="landing-cta-row">
        {!inDesktop && (
          <>
            <DownloadCta label="Download for Linux (.deb)" href={LINUX_URL} />
            <DownloadCta
              label="Download for Windows (.exe)"
              href={WINDOWS_URL}
            />
          </>
        )}
        <DownloadCta label="Download Android APK" href="" />
      </div>
    </section>
  );
}
