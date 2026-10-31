import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { STAT_MODES, StatMode } from '../api/types';
import { GrindPanel } from './stats/GrindPanel';
import { SchedulePanel } from './stats/SchedulePanel';

function isGrind(mode: StatMode) {
  return mode === 'BR' || mode === 'CS';
}

export function StatsPage() {
  const { org } = useAuth();
  const isReviewer = org?.role === 'COACH' || org?.isOwner === true;
  const [mode, setMode] = useState<StatMode>('BR');

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
        <nav className="stats-mode-track" aria-label="Stats mode">
          {STAT_MODES.map((item) => {
            const active = mode === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                className={`stats-mode-chip${active ? ' active' : ''}`}
                onClick={() => setMode(item.mode)}
                aria-pressed={active}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {isGrind(mode) ? (
          <GrindPanel mode={mode} isReviewer={isReviewer} />
        ) : (
          <SchedulePanel
            key={mode}
            eventType={mode === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM'}
          />
        )}
      </div>
    </>
  );
}
