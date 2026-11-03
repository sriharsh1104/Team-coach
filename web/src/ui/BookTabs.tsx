import { ReactNode, useEffect, useRef, useState } from 'react';

const TURN_MS = 560;

type Dir = 'next' | 'prev';

/** Hook form so parents can trigger book turns from Continue buttons. */
export function useBookTabs(tabs: string[], initial: string) {
  const [tab, setTab] = useState(initial);
  const [turn, setTurn] = useState<{ id: string; dir: Dir } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function openTab(next: string) {
    if (next === tab) return;
    const from = tabs.indexOf(tab);
    const to = tabs.indexOf(next);
    const dir: Dir = to > from ? 'next' : 'prev';
    setTurn({ id: tab, dir });
    setTab(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTurn(null), TURN_MS);
  }

  return { tab, openTab, turn };
}

export function BookStage({
  tab,
  turn,
  className,
  children,
}: {
  tab: string;
  turn: { id: string; dir: Dir } | null;
  className?: string;
  children: (activeTab: string) => ReactNode;
}) {
  return (
    <div className={`book-stage${className ? ` ${className}` : ''}`}>
      {turn ? (
        <div className={`book-page is-leaving leave-${turn.dir}`}>
          {children(turn.id)}
        </div>
      ) : null}
      <div className={`book-page${turn ? ` enter-${turn.dir}` : ''}`}>
        {children(tab)}
      </div>
    </div>
  );
}
