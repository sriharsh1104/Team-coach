import { useState } from 'react';
import {
  FINAL_PRINCIPLE_LINES,
  GAMEPLAY_RULES,
  MINDSET_RULES,
  OFFICIAL_FF_RULES,
  Rule,
} from './home/ruleBookData';

type TabId = 'mindset' | 'gameplay' | 'principle' | 'official';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'mindset', label: 'Mindset' },
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'principle', label: 'Principle' },
  { id: 'official', label: 'FF Official' },
];

function SectionHeader({
  eyebrow,
  title,
  countLabel,
}: {
  eyebrow: string;
  title: string;
  countLabel: string;
}) {
  return (
    <div className="rule-section-head">
      <div>
        <p className="rule-eyebrow">{eyebrow}</p>
        <h2 className="rule-section-title">{title}</h2>
      </div>
      <span className="rule-count-pill">{countLabel}</span>
    </div>
  );
}

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <div className="rules">
      {rules.map((rule) => (
        <div key={rule.number} className="rule">
          <div className="rule-header">
            <span className="rule-num">{rule.number}</span>
            <h3>{rule.title}</h3>
          </div>
          <p>{rule.body}</p>
          {rule.bullets?.length ? (
            <ul className="rule-bullets">
              {rule.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {rule.note ? <p className="rule-note">Note: {rule.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function RuleBookPage() {
  const [tab, setTab] = useState<TabId>('mindset');

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Rule Book</h1>
          <p>Rules every competitive player must follow</p>
        </div>
      </div>
      <div className="content rulebook-page">
        <nav className="profile-tabs rulebook-tabs" aria-label="Rule book sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`profile-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'mindset' ? (
          <div>
            <SectionHeader
              eyebrow="Part 1"
              title="Mindset & Discipline"
              countLabel={`${MINDSET_RULES.length} rules`}
            />
            <RuleList rules={MINDSET_RULES} />
          </div>
        ) : null}

        {tab === 'gameplay' ? (
          <div>
            <SectionHeader
              eyebrow="Part 2"
              title="Gameplay & Practice"
              countLabel={`${GAMEPLAY_RULES.length} rules`}
            />
            <RuleList rules={GAMEPLAY_RULES} />
          </div>
        ) : null}

        {tab === 'principle' ? (
          <div>
            <SectionHeader
              eyebrow="Closing"
              title="Final Team Principle"
              countLabel="1 focus"
            />
            <div className="principle-card">
              {FINAL_PRINCIPLE_LINES.map((line) => (
                <div key={line} className="principle-row">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === 'official' ? (
          <div>
            <SectionHeader
              eyebrow="Garena FFWS"
              title="Free Fire Esports Official Rules"
              countLabel={`${OFFICIAL_FF_RULES.length} points`}
            />
            <p className="rulebook-source muted">
              Condensed from Garena Free Fire World Series competition rulebooks
              (FFWS Africa 2026 Fall / MENA 2026 Spring). Always follow the live
              event PDF for that tournament.
            </p>
            <RuleList rules={OFFICIAL_FF_RULES} />
          </div>
        ) : null}
      </div>
    </>
  );
}
