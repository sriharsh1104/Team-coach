import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HomeHeroTab } from './home/HomeHeroTab';
import { HOME_TABS, HomeTabId, TAB_PATHS, pathToTab } from './home/homeTabs';
import { SocialFooter } from './home/SocialFooter';
import { GuildTab } from './home/GuildTab';
import { RecordsTab } from './home/RecordsTab';
import { TeamPlayersTab } from './home/TeamPlayersTab';
import { TournamentsTab } from './home/TournamentsTab';

const TURN_MS = 560;

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

export function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  // The URL path is the source of truth for which tab is open (not local
  // state) — that's what makes refresh, deep-links, and the browser
  // back/forward buttons land on the right tab instead of always resetting
  // to Home. See TAB_PATHS in homeTabs.ts for the id <-> path mapping.
  const tab = pathToTab(location.pathname);
  const prevTabRef = useRef<HomeTabId>(tab);
  const [turn, setTurn] = useState<{ id: HomeTabId; dir: 'next' | 'prev' } | null>(
    null,
  );
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevTabRef.current;
    if (prev === tab) return;
    const dir = tabIndex(tab) > tabIndex(prev) ? 'next' : 'prev';
    setTurn({ id: prev, dir });
    prevTabRef.current = tab;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTurn(null), TURN_MS);
  }, [tab]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function openTab(next: HomeTabId) {
    if (next === tab) return;
    navigate(TAB_PATHS[next]);
  }

  return (
    <div className="landing">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>

      <header className="landing-nav">
        <nav className="landing-tabs" aria-label="Home sections">
          {HOME_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`landing-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => openTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="landing-main landing-stage">
        {turn ? (
          <div className={`landing-page is-leaving leave-${turn.dir}`}>
            <TabView id={turn.id} />
          </div>
        ) : null}
        <div className={`landing-page${turn ? ` enter-${turn.dir}` : ''}`}>
          <TabView id={tab} />
        </div>
      </main>

      <SocialFooter />
    </div>
  );
}
