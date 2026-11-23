import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import * as announcementsApi from '../api/announcements';
import { ANNOUNCEMENTS_READ_EVENT } from '../pages/AnnouncementsPage';
import { useAuth } from '../auth/AuthContext';
import { AccountMenu } from './AccountMenu';
import { RouteTransition } from '../ui/RouteTransition';

type NavItem = { to: string; label: string; end?: boolean; badge?: number };

const ROSTER_NAV: NavItem[] = [
  { to: '/app', label: 'Chats', end: true },
  { to: '/app/members', label: 'Roster' },
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
  const isAdmin = !!user?.isPlatformAdmin;
  const inAGuild = !!org || !!guild;
  const unreadAnnouncements = useUnreadAnnouncements(
    inAGuild,
    location.pathname,
  );
  // Platform admins are exempt from the player onboarding gate: an admin
  // account has no in-game name or guild, and the profile fields it would
  // demand are not used by anything on /admin.
  const needsProfile = !!user && !user.profileComplete && !isAdmin;

  if (needsProfile && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />;
  }

  // An admin with no guild of their own still gets the shell — otherwise
  // /admin renders bare, with no way back to anything.
  if (!showRoster && !showGuild && !isAdmin) {
    return (
      <RouteTransition className="auth-route-fade">
        <Outlet />
      </RouteTransition>
    );
  }

  // Owners already get Team Chat + Guild Chat + every 1:1 DM in one place
  // at /app — a separate "Guild Chat" link there would just be a duplicate
  // destination. Pure guild-only members (no org) have nowhere else to
  // reach chat, so they keep it.
  const guildNav: NavItem[] = org
    ? [{ to: '/guild', label: 'Guild Roster', end: true }]
    : [
        { to: '/guild/chat', label: 'Guild Chat' },
        { to: '/guild', label: 'Guild Roster', end: true },
      ];

  // Announcements belong to the guild section, but unlike the links above
  // they are for EVERYONE in the org — including a roster member who is not
  // the owner and therefore never sees the rest of that section. So the
  // section is built as one list rather than rendered as a second block,
  // which would print a duplicate "Guild" heading.
  const guildSection: NavItem[] = [
    ...(showGuild ? guildNav : []),
    ...(inAGuild
      ? [
          {
            to: '/announcements',
            label: 'Announcements',
            badge: unreadAnnouncements,
          },
        ]
      : []),
  ];

  return (
    <div className="shell">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <aside className="sidebar">
        <div className="sidebar-brand">
          Sacred Esports
          <small>
            {org?.name ?? guild?.name ?? (isAdmin ? 'Platform admin' : 'Team Coach')}
          </small>
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
        {guildSection.length > 0 ? (
          <>
            {showRoster ? <div className="sidebar-split">Guild</div> : null}
            {guildSection.map((item) => (
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
                {item.badge ? (
                  <span className="badge nav-badge">{item.badge}</span>
                ) : null}
              </NavLink>
            ))}
          </>
        ) : null}
        {isAdmin ? (
          <>
            <div className="sidebar-split">Platform</div>
            <NavLink
              to="/admin"
              viewTransition
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              Dashboard
            </NavLink>
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

/**
 * Unread announcement count for the sidebar badge.
 *
 * Re-read on every navigation rather than polled on a timer: the only thing
 * that clears it is opening the section, which is itself a navigation, so a
 * timer would just be requests nobody is waiting on.
 */
function useUnreadAnnouncements(enabled: boolean, pathname: string) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    announcementsApi
      .getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      // A member with no guild yet 404s here; the badge simply stays off.
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname]);

  // The announcements page clears the count server-side as soon as it opens;
  // this is how the badge hears about it without waiting for a navigation.
  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener(ANNOUNCEMENTS_READ_EVENT, clear);
    return () => window.removeEventListener(ANNOUNCEMENTS_READ_EVENT, clear);
  }, []);

  return unread;
}
