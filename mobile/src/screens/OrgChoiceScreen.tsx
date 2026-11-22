import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as orgApi from '../api/org';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../brand/BrandMark';
import { BrandWatermark } from '../brand/BrandWatermark';
import { OrgSetupStackParamList } from '../navigation/types';
import { useSharedStyles } from './shared';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { usePendingInvite } from '../invite/inviteLinks';
import { useTheme } from '../theme/ThemeContext';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

const SEARCH_DEBOUNCE_MS = 300;

export function OrgChoiceScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout, setGuild, refreshOrg } = useAuth();
  const pendingInvite = usePendingInvite();

  const [query, setQuery] = useState('');
  const [guilds, setGuilds] = useState<orgApi.BrowseGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signed in via an invite link → skip the choice and go straight to joining.
  useEffect(() => {
    if (pendingInvite) navigation.navigate('JoinOrg');
  }, [pendingInvite, navigation]);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await orgApi.browseGuilds(q);
      setGuilds(res.guilds);
    } catch (err) {
      setGuilds([]);
      emitToast(apiErrorMessage(err, 'Could not load guilds'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, load]);

  const onJoin = async (guild: orgApi.BrowseGuild) => {
    setJoiningId(guild.id);
    try {
      const joined = await orgApi.joinGuild({ orgId: guild.id });
      setGuild({ id: joined.id, name: joined.name, role: joined.role });
      await refreshOrg();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not join that guild'));
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <View
      key={user?.id ?? 'choice'}
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <BrandWatermark variant="auth" />
      <FlatList
        data={guilds}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <BrandMark />
            <Text style={shared.title}>Welcome, {user?.name}</Text>
            <Text style={[styles.lead, { color: colors.textMuted }]}>
              Pick a guild below, create your own, or join with a code.
            </Text>
            <TextInput
              style={shared.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Search Guilds"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {loading ? (
              <ActivityIndicator
                color={colors.chrome}
                style={{ marginVertical: 20 }}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Text
              style={{
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 16,
              }}
            >
              {query.trim()
                ? 'No guilds match that search.'
                : 'No guilds yet — create one to get started.'}
            </Text>
          )
        }
        renderItem={({ item }) => {
          const busy = joiningId === item.id;
          return (
            <View
              style={[
                styles.card,
                {
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.cardTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.memberCount} guild member
                {item.memberCount === 1 ? '' : 's'} · {item.rosterCount} on
                roster
              </Text>
              <SoftPressable
                style={[shared.button, { marginTop: 8 }]}
                disabled={!!joiningId}
                onPress={() => void onJoin(item)}
                pressScale={0.98}
              >
                <ButtonLabel icon="enter">
                  {busy ? 'Joining…' : 'Join Guild'}
                </ButtonLabel>
              </SoftPressable>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <SoftPressable
              style={shared.button}
              onPress={() => navigation.navigate('CreateOrg')}
              pressScale={0.98}
            >
              <ButtonLabel icon="add-circle">Create a Org</ButtonLabel>
            </SoftPressable>
            <SoftPressable
              style={shared.button}
              onPress={() => navigation.navigate('JoinOrg')}
              pressScale={0.98}
            >
              <ButtonLabel icon="enter">Join with Code</ButtonLabel>
            </SoftPressable>
            <Text style={shared.link} onPress={logout}>
              Log Out
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: { gap: 8, marginBottom: 8 },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  card: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  cardTitle: {
    fontWeight: '800',
    fontSize: 16,
  },
  footer: {
    marginTop: 12,
    gap: 4,
    paddingBottom: 8,
  },
});
