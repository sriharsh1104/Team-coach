import { useState } from 'react';
import { AppDownloadTab } from './home/AppDownloadTab';
import { HomeHeroTab } from './home/HomeHeroTab';
import { HOME_TABS, HomeTabId } from './home/homeTabs';
import { SocialFooter } from './home/SocialFooter';
import { TeamPlayersTab } from './home/TeamPlayersTab';
import { TournamentRecordTab } from './home/TournamentRecordTab';
import { TournamentsTab } from './home/TournamentsTab';

export function HomePage() {
  const [tab, setTab] = useState<HomeTabId>('home');

  return (
    <div className="landing">
      <div className="brand-watermark" aria-hidden="true">
        <img src="/sacred-logo-transparent.png" alt="" />
      </div>

      <header className="landing-nav">
        <div className="landing-nav-brand">Sacred Esports</div>
        <nav className="landing-tabs" aria-label="Home sections">
          {HOME_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`landing-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="landing-main">
        {tab === 'home' ? <HomeHeroTab onOpenTab={setTab} /> : null}
        {tab === 'app' ? <AppDownloadTab /> : null}
        {tab === 'tournaments' ? <TournamentsTab /> : null}
        {tab === 'records' ? <TournamentRecordTab /> : null}
        {tab === 'players' ? <TeamPlayersTab /> : null}
      </main>

      <SocialFooter />
    </div>
  );
}
