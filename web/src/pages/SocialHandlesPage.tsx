const CONTACTS = [
  {
    label: 'Email',
    value: 'sacredesportsss@gmail.com',
    href: 'mailto:sacredesportsss@gmail.com',
  },
  {
    label: 'Instagram',
    value: 'https://www.instagram.com/sacredesportss',
    href: 'https://www.instagram.com/sacredesportss',
  },
  {
    label: 'Discord',
    value: 'https://discord.gg/mUES4kcAE',
    href: 'https://discord.gg/mUES4kcAE',
  },
  {
    label: 'YouTube',
    value: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
    href: 'https://www.youtube.com/channel/UC_SatA-81Ycr3gpQnqRix3g',
  },
  { label: 'Telegram', value: '', href: '' },
];

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
            <div key={c.label} className="contact-card">
              <div style={{ minWidth: 0 }}>
                <div className="label">{c.label}</div>
                {c.href ? (
                  <a className="value" href={c.href} target="_blank" rel="noreferrer">
                    {c.value}
                  </a>
                ) : (
                  <div className="value" style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}>
                    Add your link here
                  </div>
                )}
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
