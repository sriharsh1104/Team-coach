import { ReactNode } from 'react';

/**
 * Remounts children whenever `contentKey` changes so the enter animation
 * plays — used for tab panels so switching sections feels smooth.
 */
export function FadeSwap({
  contentKey,
  children,
  className,
}: {
  contentKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      key={contentKey}
      className={`fade-swap${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
