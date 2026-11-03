import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type NavItem = { to: string; label: string; end?: boolean };

const ROSTER_NAV: NavItem[] = [
  { to: '/app', label: 'Chats', end: true },
  { to: '/app/members', label: 'Team Members' },
  { to: '/app/tournament-records', label: 'Records' },
  { to: '/app/stats', label: 'Stats' },
  { to: '/app/maps', label: 'Maps' },
  { to: '/app/points-table', label: 'Points Table' },
  { to: '/app/rule-book', label: 'Rule Book' },
];

const COMMON_NAV: NavItem[] = [
  { to: '/profile', label: 'Profile' },
  { to: '/social', label: 'Social Handles' },
];

export function AppShell() {
  const { user, org, guild, logout } = useAuth();
  const navigate = useNavigate();
  const showRoster = !!org;
  const showGuild = !!guild && (!org || org.isOwner);

  if (!showRoster && !showGuild) {
    return <Outlet />;
  }

  const guildNav: NavItem[] = [
    { to: '/guild/chat', label: 'Guild Chat' },
    { to: '/guild', label: 'Guild Roster', end: true },
  ];

  return (
    <div className="shell">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <aside className="sidebar">
        <div className="sidebar-brand">
          Sacred Esports
          <small>{org?.name ?? guild?.name ?? 'Team Coach'}</small>
        </div>
        {showRoster && showGuild ? (
          <div className="sidebar-label">Roster</div>
        ) : null}
        {showRoster
          ? ROSTER_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))
          : null}
        {showGuild ? (
          <>
            {showRoster ? <div className="sidebar-split">Guild</div> : null}
            {guildNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </>
        ) : null}
        <div className="sidebar-split">Account</div>
        {COMMON_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="muted" style={{ padding: '0 10px 10px' }}>
            {user?.name}
            <br />
            <span style={{ fontSize: 12 }}>{user?.email}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => {
              navigate('/');
              void logout();
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
