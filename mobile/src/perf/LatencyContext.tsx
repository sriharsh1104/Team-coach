import React, { createContext, useCallback, useContext, useState } from 'react';

interface LatencyEntry {
  screen: string;
  ms: number;
}

interface LatencyCtx {
  entry: LatencyEntry | null;
  record: (screen: string, ms: number) => void;
}

const LatencyContext = createContext<LatencyCtx>({
  entry: null,
  record: () => {},
});

export function LatencyProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<LatencyEntry | null>(null);
  const record = useCallback((screen: string, ms: number) => {
    setEntry({ screen, ms });
  }, []);
  return (
    <LatencyContext.Provider value={{ entry, record }}>
      {children}
    </LatencyContext.Provider>
  );
}

export const useLatency = () => useContext(LatencyContext);
