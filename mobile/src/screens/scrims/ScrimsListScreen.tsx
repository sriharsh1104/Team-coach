import React from 'react';
import { View, Text } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useSharedStyles } from '../shared';
import { MatchSchedulePanel } from './MatchSchedulePanel';

type Props = NativeStackScreenProps<MainStackParamList, 'Scrims'>;

/** Legacy route — Stats now owns Scrims/Tournament tabs. Kept for deep links. */
export function ScrimsListScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const styles = useThemedStyles(scrimsListStyles);
  React.useEffect(() => {
    navigation.replace('Stats', { mode: 'SCRIM' });
  }, [navigation]);

  return (
    <Screen>
      <View style={shared.container}>
        <Text style={styles.redirect}>Opening Stats → Scrims…</Text>
      </View>
    </Screen>
  );
}

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function scrimsListStyles(c: ThemeColors) {
  return {
    redirect: {
      color: c.textMuted,
      textAlign: 'center' as const,
      marginTop: 24,
    },
  };
}
