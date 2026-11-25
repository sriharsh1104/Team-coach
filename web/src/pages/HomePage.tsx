import { useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isDesktopApp } from '../lib/platform';
import { startDirectionalTransition } from '../lib/viewTransition';
import { HomeHeroTab } from './home/HomeHeroTab';
import { HOME_TABS, HomeTabId, TAB_PATHS, pathToTab } from './home/homeTabs';
import { SocialFooter } from './home/SocialFooter';
import { GuildTab } from './home/GuildTab';
import { RecordsTab } from './home/RecordsTab';
import { TeamPlayersTab } from './home/TeamPlayersTab';
import { TournamentsTab } from './home/TournamentsTab';

function tabIndex(id: HomeTabId) {
  return HOME_TABS.findIndex((t) => t.id === id);
}

function TabView({ id }: { id: HomeTabId }) {
  switch (id) {
    case 'home':
      return <HomeHeroTab />;
    case 'tournaments':
      return <TournamentsTab />;
    case 'records':
      return <RecordsTab />;
    case 'players':
      return <TeamPlayersTab />;
    case 'guild':
      return <GuildTab />;
  }
}

// The installed desktop app (Tauri) is for members, not marketing: it opens
// straight on the sign-in / sign-up section and skips the landing tabs.
function DesktopHome() {
  const location = useLocation();
  if (location.pathname !== TAB_PATHS.guild) {
    return <Navigate to={TAB_PATHS.guild} replace />;
  }
  return (
    <div className="landing landing-desktop">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>
      <main className="landing-main landing-stage" tabIndex={-1}>
        <div className="landing-page">
          <GuildTab />
        </div>
      </main>
      <SocialFooter />
    </div>
  );
}

export function HomePage() {
  if (isDesktopApp()) return <DesktopHome />;
  return <BrowserHome />;
}

function BrowserHome() {
  const location = useLocation();
  const navigate = useNavigate();
  // The URL path is the source of truth for which tab is open (not local
  // state) — that's what makes refresh, deep-links, and the browser
  // back/forward buttons land on the right tab instead of always resetting
  // to Home. See TAB_PATHS in homeTabs.ts for the id <-> path mapping.
  const tab = pathToTab(location.pathname);
  const stageRef = useRef<HTMLElement>(null);
  const skipFocusRef = useRef(true);

  useEffect(() => {
    // Skip the first paint so refresh doesn't yank focus into the stage.
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    stageRef.current?.focus({ preventScroll: true });
  }, [tab]);

  function openTab(next: HomeTabId) {
    if (next === tab) return;
    const direction = tabIndex(next) > tabIndex(tab) ? 'forward' : 'backward';
    startDirectionalTransition(() => {
      navigate(TAB_PATHS[next]);
    }, direction);
  }

  return (
    <div className="landing">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>

      <header className="landing-nav">
        <nav className="landing-tabs" aria-label="Home sections">
          {HOME_TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`landing-tab${selected ? ' active' : ''}`}
                onClick={() => openTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main
        ref={stageRef}
        className="landing-main landing-stage"
        tabIndex={-1}
        id="landing-stage"
      >
        <div className="landing-page">
          <TabView id={tab} />
        </div>
      </main>

      <SocialFooter />
    </div>
  );
}
