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
import { ChannelAvatar } from './chat/ChannelAvatar';
import { ButtonLabel } from '../ui/ButtonLabel';
import { SoftPressable } from '../ui/SoftPressable';
import { usePendingInvite } from '../invite/inviteLinks';
import { useOrgRealtimeOptional } from '../realtime/OrgRealtimeProvider';
import { useTheme } from '../theme/ThemeContext';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';

type Props = NativeStackScreenProps<OrgSetupStackParamList, 'OrgChoice'>;

const SEARCH_DEBOUNCE_MS = 300;

/** 409 from /orgs/guild/browse when the account already has a seat. */
function isAlreadyMemberBrowseError(err: unknown): boolean {
  const ax = err as {
    response?: { status?: number; data?: { message?: string | string[] } };
  };
  if (ax.response?.status === 409) return true;
  const msg = ax.response?.data?.message;
  const text = Array.isArray(msg) ? msg.join(' ') : msg ?? '';
  return /leave your current guild/i.test(text);
}

export function OrgChoiceScreen({ navigation }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, org, guild, logout, setGuild, refreshOrg } = useAuth();
  const pendingInvite = usePendingInvite();

  const [query, setQuery] = useState('');
  const [guilds, setGuilds] = useState<orgApi.BrowseGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  // orgId → where this user's own request stands, so the row can switch to
  // "Requested" the instant it is sent instead of after the next reload.
  const [requests, setRequests] = useState<
    Record<string, orgApi.GuildJoinRequestStatus>
  >({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Avoid toasting / re-fetching after we learn the session already has a seat.
  const alreadyMemberRef = useRef(false);

  // Signed in via an invite link → skip the choice and go straight to joining.
  useEffect(() => {
    if (pendingInvite) navigation.navigate('JoinOrg');
  }, [pendingInvite, navigation]);

  // Login can briefly land here before org/guild hydrate — bail out.
  useEffect(() => {
    if (org || guild) {
      alreadyMemberRef.current = true;
      setLoading(false);
    }
  }, [org, guild]);

  const load = useCallback(async (q: string) => {
    if (alreadyMemberRef.current || org || guild) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await orgApi.browseGuilds(q);
      if (alreadyMemberRef.current) return;
      setGuilds(res.guilds);
      setRequests((prev) => {
        const next = { ...prev };
        for (const g of res.guilds) {
          if (g.requestStatus) next[g.id] = g.requestStatus;
          else delete next[g.id];
        }
        return next;
      });
    } catch (err) {
      setGuilds([]);
      // Google / email login sometimes paints this screen for one tick while
      // the user is already in a guild. Sync membership quietly — the
      // "Leave your current guild…" copy is nonsense right after sign-in.
      if (isAlreadyMemberBrowseError(err)) {
        alreadyMemberRef.current = true;
        try {
          await refreshOrg();
        } catch {
          /* navigator will recover on next /me */
        }
        return;
      }
      if (!alreadyMemberRef.current) {
        emitToast(apiErrorMessage(err, 'Could not load guilds'));
      }
    } finally {
      setLoading(false);
    }
  }, [guild, org, refreshOrg]);

  useEffect(() => {
    void load('');
  }, [load]);

  // An owner deciding on our request reaches us on the personal realtime
  // channel. Acceptance swaps the whole navigator by itself (AuthContext
  // picks up the new seat); a rejection has to repaint this list, which
  // otherwise sat on "Waiting for the owner to accept" forever.
  const realtime = useOrgRealtimeOptional();
  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type === 'membership.changed') void load(query);
    });
  }, [realtime, load, query]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, load]);

  // Browsing to a guild asks its owner — only a code or invite link lets
  // someone walk straight in.
  const onRequest = async (guild: orgApi.BrowseGuild) => {
    setRequestingId(guild.id);
    try {
      await orgApi.requestGuildJoin(guild.id);
      setRequests((prev) => ({ ...prev, [guild.id]: 'PENDING' }));
      emitToast(`Request sent to ${guild.name}. You'll hear back here.`);
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not send that request'));
    } finally {
      setRequestingId(null);
    }
  };

  const onCancelRequest = async (guild: orgApi.BrowseGuild) => {
    setRequestingId(guild.id);
    try {
      const mine = await orgApi.myGuildJoinRequests();
      const row = mine.requests.find(
        (r) => r.orgId === guild.id && r.status === 'PENDING',
      );
      if (row) await orgApi.cancelGuildJoinRequest(row.id);
      setRequests((prev) => {
        const next = { ...prev };
        delete next[guild.id];
        return next;
      });
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not withdraw that request'));
    } finally {
      setRequestingId(null);
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
              Ask to join a guild below, create your own, or join straight
              away with a code.
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
          const busy = requestingId === item.id;
          const status = requests[item.id] ?? null;
          const pending = status === 'PENDING';
          const rejected = status === 'REJECTED';
          return (
            <View style={[styles.card, { borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <ChannelAvatar
                  uri={item.logoUrl}
                  size={44}
                  fallback={(item.name[0] ?? '?').toUpperCase()}
                  previewable={false}
                />
                <View style={styles.cardHeadText}>
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
                </View>
              </View>

              {pending ? (
                <>
                  <Text style={[styles.statusLine, { color: colors.textMuted }]}>
                    Waiting for the owner to accept.
                  </Text>
                  <SoftPressable
                    style={[
                      shared.button,
                      styles.secondaryBtn,
                      { borderColor: colors.border },
                    ]}
                    disabled={busy}
                    onPress={() => void onCancelRequest(item)}
                    pressScale={0.98}
                  >
                    <ButtonLabel icon="trash" color={colors.textMuted}>
                      {busy ? 'Withdrawing…' : 'Withdraw Request'}
                    </ButtonLabel>
                  </SoftPressable>
                </>
              ) : (
                <>
                  {rejected && (
                    <Text style={[styles.statusLine, { color: colors.textMuted }]}>
                      This guild declined — you can ask again.
                    </Text>
                  )}
                  <SoftPressable
                    style={[shared.button, { marginTop: 8 }]}
                    disabled={!!requestingId}
                    onPress={() => void onRequest(item)}
                    pressScale={0.98}
                  >
                    <ButtonLabel icon="enter">
                      {busy
                        ? 'Sending…'
                        : rejected
                          ? 'Ask Again'
                          : 'Request to Join'}
                    </ButtonLabel>
                  </SoftPressable>
                </>
              )}
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
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeadText: { flex: 1, minWidth: 0 },
  statusLine: { fontSize: 12.5, marginTop: 10 },
  secondaryBtn: {
    marginTop: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
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
