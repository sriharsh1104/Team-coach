import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { sharedStyles } from '../shared';
import { MatchSchedulePanel } from './MatchSchedulePanel';

type Props = NativeStackScreenProps<MainStackParamList, 'Scrims'>;

/** Legacy route — Stats now owns Scrims/Tournament tabs. Kept for deep links. */
export function ScrimsListScreen({ navigation }: Props) {
  React.useEffect(() => {
    navigation.replace('Stats', { mode: 'SCRIM' });
  }, [navigation]);

  return (
    <Screen>
      <View style={sharedStyles.container}>
        <Text style={styles.redirect}>Opening Stats → Scrims…</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  redirect: { color: '#9aa0a6', textAlign: 'center', marginTop: 24 },
});
