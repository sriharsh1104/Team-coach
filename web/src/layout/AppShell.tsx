import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AccountMenu } from './AccountMenu';
import { RouteTransition } from '../ui/RouteTransition';

type NavItem = { to: string; label: string; end?: boolean };

const ROSTER_NAV: NavItem[] = [
  { to: '/app', label: 'Chats', end: true },
  { to: '/app/members', label: 'Team Members' },
  { to: '/app/media', label: 'Media' },
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
  const { user, org, guild } = useAuth();
  const location = useLocation();
  const showRoster = !!org;
  const showGuild = !!guild && (!org || org.isOwner);
  const needsProfile = !!user && !user.profileComplete;

  if (needsProfile && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />;
  }

  if (!showRoster && !showGuild) {
    return (
      <RouteTransition className="auth-route-fade">
        <Outlet />
      </RouteTransition>
    );
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
        {showRoster ? (
          <div className="sidebar-label">Esports Arena</div>
        ) : null}
        {showRoster
          ? ROSTER_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                viewTransition
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
                viewTransition
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
            viewTransition
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
        </div>
      </aside>
      <div className="main">
        <div className="shell-header-actions">
          <AccountMenu />
        </div>
        <RouteTransition>
          <Outlet />
        </RouteTransition>
      </div>
    </div>
  );
}
