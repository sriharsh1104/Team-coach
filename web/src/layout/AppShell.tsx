import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppShell() {
  const { user, org, logout } = useAuth();
  const navigate = useNavigate();
  const nav = [
    { to: '/app', label: 'Chats', end: true },
    { to: '/app/members', label: 'Team Members' },
    { to: '/app/profile', label: 'Profile' },
    { to: '/app/tournament-records', label: 'Records', end: false },
    { to: '/app/stats', label: 'Stats', end: false },
    { to: '/app/maps', label: 'Maps', end: false },
    { to: '/app/points-table', label: 'Points Table', end: false },
    { to: '/app/rule-book', label: 'Rule Book' },
    { to: '/app/social', label: 'Social Handles' },
  ];

  return (
    <div className="shell">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <aside className="sidebar">
        <div className="sidebar-brand">
          Sacred Esports
          <small>{org?.name ?? 'Team Coach'}</small>
        </div>
        {nav.map((item) => (
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
            onClick={async () => {
              await logout();
              navigate('/login');
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
