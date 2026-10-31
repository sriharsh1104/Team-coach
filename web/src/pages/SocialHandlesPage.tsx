type PlatformKey = 'email' | 'instagram' | 'discord' | 'youtube' | 'telegram';

const CONTACTS: Array<{
  key: PlatformKey;
  label: string;
  value: string;
  href: string;
}> = [
  {
    key: 'email',
    label: 'Email',
    value: 'sacredesportsss@gmail.com',
    href: 'mailto:sacredesportsss@gmail.com',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    value: 'https://www.instagram.com/sacredesportss',
    href: 'https://www.instagram.com/sacredesportss',
  },
  {
    key: 'discord',
    label: 'Discord',
    value: 'https://discord.gg/mUES4kcAE',
    href: 'https://discord.gg/mUES4kcAE',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    value: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
    href: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
  },
  { key: 'telegram', label: 'Telegram', value: '', href: '' },
];

function PlatformIcon({ name }: { name: PlatformKey }) {
  switch (name) {
    case 'email':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"
          />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5.5A4.5 4.5 0 1 0 16.5 12 4.5 4.5 0 0 0 12 7.5zm0 7.2A2.7 2.7 0 1 1 14.7 12 2.7 2.7 0 0 1 12 14.7zM17.8 6.9a1.1 1.1 0 1 0 1.1 1.1 1.1 1.1 0 0 0-1.1-1.1z"
          />
        </svg>
      );
    case 'discord':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.27 5.33A16.6 16.6 0 0 0 14.9 4.2l-.2.37a14.8 14.8 0 0 1 3.55 1.4 12.7 12.7 0 0 0-11.5 0 14.5 14.5 0 0 1 3.5-1.4l-.2-.37A16.5 16.5 0 0 0 5.7 5.33 17.7 17.7 0 0 0 2.5 16.6a16.3 16.3 0 0 0 5 2.5l.64-.99a10.7 10.7 0 0 1-1.6-.76l.4-.3a12.1 12.1 0 0 0 10.1 0l.4.3a10.7 10.7 0 0 1-1.6.76l.64.99a16.3 16.3 0 0 0 5-2.5 17.6 17.6 0 0 0-3.28-11.27zM9.3 14.3c-.9 0-1.64-.8-1.64-1.78S8.4 10.74 9.3 10.74s1.65.8 1.64 1.78-.74 1.78-1.64 1.78zm5.4 0c-.9 0-1.64-.8-1.64-1.78s.74-1.78 1.64-1.78 1.65.8 1.64 1.78-.74 1.78-1.64 1.78z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7L16 12z"
          />
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.9 4.2 2.9 11.4c-1.3.5-1.3 1.2-.2 1.5l4.9 1.5 1.9 5.7c.2.6.4.9.9.9.6 0 .8-.3 1.1-.6l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.2-.5-1.8-1.5-1.4zM9.6 14.3l-.2 3.1-1.1-3.7L18.4 7 9.6 14.3z"
          />
        </svg>
      );
  }
}

export function SocialHandlesPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Social Handles</h1>
          <p>Partnerships, tryouts, and org inquiries</p>
        </div>
      </div>
      <div className="content">
        <div className="contact-list">
          {CONTACTS.map((c) => (
            <div key={c.key} className="contact-card">
              <div className="contact-card-main">
                <span className={`contact-platform-icon platform-${c.key}`} aria-hidden="true">
                  <PlatformIcon name={c.key} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="label">{c.label}</div>
                  {c.href ? (
                    <a
                      className="value"
                      href={c.href}
                      target={c.key === 'email' ? undefined : '_blank'}
                      rel={c.key === 'email' ? undefined : 'noreferrer'}
                    >
                      {c.value}
                    </a>
                  ) : (
                    <div
                      className="value"
                      style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}
                    >
                      Add your link here
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!c.value}
                onClick={() => navigator.clipboard.writeText(c.value)}
              >
                Copy
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
