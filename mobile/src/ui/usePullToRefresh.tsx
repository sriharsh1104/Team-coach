import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * Returns a ready-made `<RefreshControl>` for a ScrollView/FlatList.
 *
 * Returning the element rather than raw state keeps the spinner themed the
 * same way everywhere — in particular `colors`, which Android needs and
 * which `tintColor` alone does not cover.
 *
 * Pass a `load` that is stable (useCallback) so the control isn't rebuilt
 * on every render.
 */
export function usePullToRefresh(load: () => Promise<unknown> | unknown) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve(load())
      // Swallowed deliberately: the axios interceptor has already surfaced
      // the failure, and letting it through here would only raise an
      // unhandled rejection. The spinner stops either way.
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [load]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.chrome}
      colors={[colors.chrome]}
      progressBackgroundColor={colors.bg}
    />
  );
}
