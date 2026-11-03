import { useAuth } from '../auth/AuthContext';
import { STAT_MODES, StatMode } from '../api/types';
import { BookStage, useBookTabs } from '../ui/BookTabs';
import { GrindPanel } from './stats/GrindPanel';
import { SchedulePanel } from './stats/SchedulePanel';

const MODE_IDS = STAT_MODES.map((item) => item.mode);

function isGrind(mode: string) {
  return mode === 'BR' || mode === 'CS';
}

export function StatsPage() {
  const { org } = useAuth();
  const isReviewer = org?.role === 'COACH' || org?.isOwner === true;
  const { tab: mode, openTab, turn } = useBookTabs(MODE_IDS, 'BR');

  const hint = isGrind(mode)
    ? `${mode} grind — upload Free Fire scoreboards. Gemini Flash OCR matches teammates for the leaderboard.`
    : mode === 'SCRIM'
      ? 'Schedule scrims, then upload each match result for OCR.'
      : 'Schedule tournament rounds, then upload results for OCR.';

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Stats</h1>
          <p>{hint}</p>
        </div>
      </div>

      <div className="content stats-page">
        <nav className="stats-mode-track" aria-label="Stats mode" role="tablist">
          {STAT_MODES.map((item) => {
            const active = mode === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                role="tab"
                aria-selected={active}
                className={`stats-mode-chip${active ? ' active' : ''}`}
                onClick={() => openTab(item.mode)}
                aria-pressed={active}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <BookStage tab={mode} turn={turn} className="stats-book-stage">
          {(active) =>
            isGrind(active) ? (
              <GrindPanel
                mode={active as Extract<StatMode, 'BR' | 'CS'>}
                isReviewer={isReviewer}
              />
            ) : (
              <SchedulePanel
                eventType={active === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM'}
              />
            )
          }
        </BookStage>
      </div>
    </>
  );
}
