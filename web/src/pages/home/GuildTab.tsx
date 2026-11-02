const GUILD = {
  name: 'Sacred Esports',
  id: '3015174327',
  logo: '/sacred-logo-transparent.png',
};

const OFFICERS = [
  { ign: 'SES-SRI', role: 'Leader' },
  { ign: 'DJEXO', role: 'Active Leader' },
  { ign: 'SES-NEPEX07', role: 'Elder' },
  { ign: 'SES-MUSAFA07', role: 'Elder' },
  { ign: 'SES-MINNIE', role: 'Elder' },
];

function initials(ign: string) {
  return ign.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

function PersonRow({ ign, role }: { ign: string; role?: string }) {
  return (
    <li className="guild-person">
      <span className="guild-person-avatar" aria-hidden="true">
        {initials(ign)}
      </span>
      <span className="guild-person-ign">{ign}</span>
      {role ? <span className="guild-person-role">{role}</span> : null}
    </li>
  );
}

export function GuildTab() {
  return (
    <section className="landing-section landing-tab-panel guild-section">
      <article className="guild-profile">
        <div className="guild-logo-wrap">
          <img src={GUILD.logo} alt="Sacred Esports guild logo" />
        </div>

        <div className="guild-profile-body">
          <p className="guild-kicker">Guild profile</p>
          <h3 className="guild-name">{GUILD.name}</h3>
          <p className="guild-id">
            <span>Guild ID</span>
            <strong>{GUILD.id}</strong>
          </p>

          <h4>Leadership</h4>
          <ul className="guild-people">
            {OFFICERS.map((person) => (
              <PersonRow key={person.ign} ign={person.ign} role={person.role} />
            ))}
          </ul>
        </div>
      </article>
    </section>
  );
}
