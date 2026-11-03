import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Soft enter animation whenever the sidebar (or any link) changes the route. */
export function RouteTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const location = useLocation();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((value) => value + 1);
  }, [location.pathname]);

  return (
    <div
      key={`${location.pathname}:${tick}`}
      className={`route-fade${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
