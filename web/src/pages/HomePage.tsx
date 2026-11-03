import { useEffect, useRef, useState } from 'react';
import { HomeHeroTab } from './home/HomeHeroTab';
import { HOME_TABS, HomeTabId } from './home/homeTabs';
import { SocialFooter } from './home/SocialFooter';
import { TeamLoginTab } from './home/TeamLoginTab';
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
    case 'team-login':
      return <TeamLoginTab />;
  }
}

export function HomePage() {
  const [tab, setTab] = useState<HomeTabId>('home');
  const [turn, setTurn] = useState<{
    id: HomeTabId;
    dir: 'next' | 'prev';
  } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function openTab(next: HomeTabId) {
    if (next === tab) return;
    const dir = tabIndex(next) > tabIndex(tab) ? 'next' : 'prev';
    setTurn({ id: tab, dir });
    setTab(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTurn(null), TURN_MS);
  }

  return (
    <div
      className={`landing${tab === 'team-login' ? ' landing--team-login' : ''}`}
    >
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
