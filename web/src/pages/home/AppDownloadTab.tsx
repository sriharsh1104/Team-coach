const APK_URL =
  (import.meta.env.VITE_APK_URL as string | undefined)?.trim() ||
  '/downloads/sacred-esports.apk';

export function AppDownloadTab() {
  return (
    <section className="landing-section landing-tab-panel">
      <h2>Get the app</h2>
      <p className="landing-section-lead">
        Official Sacred Team Coach APK — chats, scrims, stats, and voice for
        roster members.
      </p>
      <a className="landing-cta" href={APK_URL} download>
        Download APK
      </a>
      <p className="landing-note">
        Android only for now. Install from unknown sources if prompted. Roster
        access still needs a team invite / org code after install.
      </p>
    </section>
  );
}
