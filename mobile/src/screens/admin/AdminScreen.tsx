import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TextStyle,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as adminApi from '../../api/admin';
import {
  AdminHealth,
  AdminMember,
  AdminOrgDetail,
  AdminOrgRow,
  AdminOverview,
} from '../../api/admin';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { SkeletonList } from '../../ui/Skeleton';
import { SoftPressable } from '../../ui/SoftPressable';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { useSharedStyles } from '../shared';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
/** Same green the voice UI uses for "connected" — there is no theme token. */
const HEALTHY = '#22c55e';

/**
 * Platform admin — read-only on purpose. This is for seeing what is going on
 * across every org, not for reaching into one.
 *
 * Reaching the screen at all needs the server to have said `isPlatformAdmin`,
 * but that is only what hides the drawer item. Every call below is
 * re-authorised server-side against the database, so the screen is never the
 * security boundary.
 */
export function AdminScreen() {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(adminStyles);

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  /** User id a voice grant/revoke is in flight for — stops a double-tap. */
  const [voiceBusyId, setVoiceBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Read inside load() so changing the query doesn't rebuild the pull-to-
  // refresh control (and with it the RefreshControl element) on every keystroke.
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async () => {
    const query = searchRef.current.trim() || undefined;
    try {
      // Health is deliberately off the critical path: it renders when it
      // arrives, and a slow or failed probe never holds up — or empties —
      // the counts and the guild list.
      adminApi.getHealth().then(setHealth, () => setHealth(null));

      const [nextOverview, list] = await Promise.all([
        adminApi.getOverview(),
        adminApi.listOrgs({ search: query, take: PAGE_SIZE }),
      ]);
      setOverview(nextOverview);
      setOrgs(list.orgs);
      setTotal(list.total);
      setFailed(false);
    } catch {
      // The axios interceptor already toasted. Leaving `orgs` null here
      // would pulse skeletons forever, so fall through to an empty list
      // with a retry instead.
      setOrgs([]);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `search` is the trigger; load() reads its current value through the ref.
  }, [search, load]);

  const refreshControl = usePullToRefresh(load);

  const loadMore = useCallback(async () => {
    if (!orgs || isLoadingMore || orgs.length >= total) return;
    setIsLoadingMore(true);
    try {
      const next = await adminApi.listOrgs({
        search: searchRef.current.trim() || undefined,
        skip: orgs.length,
        take: PAGE_SIZE,
      });
      setOrgs((prev) => [...(prev ?? []), ...next.orgs]);
      setTotal(next.total);
    } catch {
      /* interceptor toasted; the Load more button stays available */
    } finally {
      setIsLoadingMore(false);
    }
  }, [orgs, isLoadingMore, total]);

  const openOrg = useCallback(
    (id: string) => {
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
        return;
      }
      setSelectedId(id);
      setDetail(null);
      adminApi
        .getOrg(id)
        .then(setDetail)
        .catch(() => setSelectedId(null));
    },
    [selectedId],
  );

  /**
   * Grant or revoke 1-on-1 voice from a member row. The open guild is re-read
   * afterwards rather than patched locally: only the server knows whether the
   * write landed, and a stale chip here would misreport a permission.
   */
  const toggleDirectVoice = useCallback(
    async (userId: string, enabled: boolean) => {
      setVoiceBusyId(userId);
      try {
        await adminApi.setDirectVoice({ userId, enabled });
        const fresh = await adminApi.getOrg(selectedId!);
        setDetail(fresh);
      } catch {
        /* the axios interceptor already toasted the reason */
      } finally {
        setVoiceBusyId(null);
      }
    },
    [selectedId],
  );

  const stats = useMemo(
    () =>
      [
        ['Guilds', overview?.orgs],
        ['Users', overview?.users],
        ['Verified', overview?.verifiedUsers],
        // Online is live socket presence; active is last-seen, which
        // survives a backend restart. Both, because they answer different
        // questions.
        ['Online now', overview?.onlineNow],
        ['Active · 24h', overview?.activeUsers24h],
        ['Active · 7d', overview?.activeUsers7d],
        ['New · 24h', overview?.newUsersLast24Hours],
        ['New · 7d', overview?.newUsersLast7Days],
        ['Guild members', overview?.guildMembers],
        ['Requests', overview?.pendingJoinRequests],
        ['Messages', overview?.messages],
        ['Scrims', overview?.scrims],
      ] as const,
    [overview],
  );

  return (
    <Screen>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={orgs ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={11}
        ListHeaderComponent={
          <View>
            <Text style={shared.title}>Admin</Text>
            <Text style={styles.hint}>
              Everything across the platform. Read-only.
            </Text>

            <View style={styles.statsGrid}>
              {stats.map(([label, value]) => (
                <View key={label} style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {value == null ? '—' : formatCount(value)}
                  </Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {health ? (
              <View style={styles.healthBlock}>
                <View style={styles.healthHead}>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          health.status === 'down'
                            ? colors.danger
                            : health.needsAttention > 0
                              ? colors.textDim
                              : HEALTHY,
                      },
                    ]}
                  />
                  <Text style={styles.healthTitle}>
                    {health.status === 'down'
                      ? 'Backend not responding'
                      : health.needsAttention > 0
                        ? `${health.needsAttention} service${health.needsAttention === 1 ? '' : 's'} need attention`
                        : 'All services healthy'}
                  </Text>
                </View>
                <Text style={styles.healthMeta}>
                  {health.process.env} · up {formatUptime(health.process.uptimeSeconds)} ·{' '}
                  {health.process.memoryMb} MB
                </Text>
                {health.services.map((check) => (
                  <View key={check.key} style={styles.healthRow}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            check.status === 'up'
                              ? HEALTHY
                              : check.status === 'down'
                                ? colors.danger
                                : colors.textDim,
                        },
                      ]}
                    />
                    <View style={styles.rowMain}>
                      <Text style={styles.healthName} numberOfLines={1}>
                        {check.label}
                        {check.kind === 'config' ? ' · config' : ''}
                      </Text>
                      <Text style={styles.healthDetail} numberOfLines={2}>
                        {check.detail}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <TextInput
              style={shared.input}
              placeholder="Search guilds by name, code, or owner…"
              placeholderTextColor={colors.textDim}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search guilds"
            />

            <Text style={styles.sectionLabel}>
              {orgs ? `${total} guild${total === 1 ? '' : 's'}` : 'Loading…'}
            </Text>
            {!orgs ? <SkeletonList count={6} avatar={false} /> : null}
          </View>
        }
        ListEmptyComponent={
          !orgs ? null : failed ? (
            <SoftPressable
              style={styles.retry}
              onPress={() => void load()}
              accessibilityRole="button"
              accessibilityLabel="Try loading again"
            >
              <Text style={styles.retryText}>Could not load. Tap to retry.</Text>
            </SoftPressable>
          ) : (
            <Text style={styles.empty}>
              {search.trim() ? 'No orgs match that search.' : 'No orgs yet.'}
            </Text>
          )
        }
        ListFooterComponent={
          orgs && orgs.length < total ? (
            <SoftPressable
              style={styles.more}
              onPress={() => void loadMore()}
              disabled={isLoadingMore}
              accessibilityRole="button"
              accessibilityLabel={`Load more orgs, showing ${orgs.length} of ${total}`}
            >
              {isLoadingMore ? (
                <ActivityIndicator color={colors.chrome} size="small" />
              ) : (
                <Text style={styles.moreText}>
                  Load more · {orgs.length} of {total}
                </Text>
              )}
            </SoftPressable>
          ) : null
        }
        renderItem={({ item }) => {
          const isOpen = selectedId === item.id;
          return (
            <View>
              <SoftPressable
                style={[styles.row, isOpen && styles.rowOpen]}
                onPress={() => openOrg(item.id)}
                pressScale={0.985}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${item.name}, ${item.rosterCount} roster members`}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.owner
                      ? `${item.owner.name} · ${item.owner.email}`
                      : 'No owner'}
                  </Text>
                </View>
                <View style={styles.rowCounts}>
                  <Count icon="people-outline" value={item.rosterCount} styles={styles} color={colors.textDim} />
                  <Count icon="chatbubble-outline" value={item.messageCount} styles={styles} color={colors.textDim} />
                </View>
              </SoftPressable>

              {isOpen ? (
                <View style={styles.detail}>
                  {!detail ? (
                    <ActivityIndicator
                      color={colors.chrome}
                      size="small"
                      style={styles.detailLoading}
                    />
                  ) : (
                    <>
                      <Text style={styles.detailMeta}>
                        {detail.counts.guildMembers} guild ·{' '}
                        {detail.counts.activeGuildMembers24h} active 24h ·{' '}
                        {formatCount(detail.counts.messages)} messages ·{' '}
                        {detail.counts.scrims} scrims · {detail.counts.mediaPosts} media
                      </Text>
                      {/* Guild and roster are separate memberships — a person
                          can be in one and not the other, so they are listed
                          separately rather than merged into one list. */}
                      <MemberGroup
                        title={`Guild members (${detail.guild.length})`}
                        members={detail.guild}
                        styles={styles}
                        busyId={voiceBusyId}
                        onToggleVoice={toggleDirectVoice}
                      />
                      <MemberGroup
                        title={`Roster (${detail.roster.length})`}
                        members={detail.roster}
                        styles={styles}
                        busyId={voiceBusyId}
                        onToggleVoice={toggleDirectVoice}
                      />
                      {detail.pendingRequests.length > 0 ? (
                        <>
                          <Text style={styles.groupLabel}>
                            Waiting to join ({detail.pendingRequests.length})
                          </Text>
                          {detail.pendingRequests.map((r) => (
                            <View key={r.id} style={styles.rosterRow}>
                              <Text style={styles.rosterName} numberOfLines={1}>
                                {r.user.name}
                              </Text>
                              <Text style={styles.rosterMeta} numberOfLines={1}>
                                {r.user.email}
                              </Text>
                            </View>
                          ))}
                        </>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </Screen>
  );
}

function MemberGroup({
  title,
  members,
  styles,
  busyId,
  onToggleVoice,
}: {
  title: string;
  members: AdminMember[];
  styles: ReturnType<typeof adminStyles>;
  busyId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
}) {
  if (members.length === 0) return null;
  return (
    <>
      <Text style={styles.groupLabel}>{title}</Text>
      {members.map((m) => (
        <View key={m.id} style={styles.memberRow}>
          <View style={styles.rowMain}>
            <Text style={styles.rosterName} numberOfLines={1}>
              {m.name}
              {m.inGameName ? ` · ${m.inGameName}` : ''}
            </Text>
            <Text style={styles.rosterMeta} numberOfLines={1}>
              {m.isOwner ? 'Owner' : (m.role ?? 'No role')} · {m.email}
            </Text>
          </View>
          <SoftPressable
            style={[styles.voiceChip, m.canDirectVoice && styles.voiceChipOn]}
            disabled={busyId === m.id}
            onPress={() => onToggleVoice(m.id, !m.canDirectVoice)}
            accessibilityRole="button"
            accessibilityState={{ selected: m.canDirectVoice }}
            accessibilityLabel={`${m.canDirectVoice ? 'Revoke' : 'Grant'} 1-on-1 voice for ${m.name}`}
          >
            <Text
              style={[
                styles.voiceChipText,
                m.canDirectVoice && styles.voiceChipTextOn,
              ]}
            >
              {busyId === m.id ? '…' : m.canDirectVoice ? 'Voice on' : 'Voice off'}
            </Text>
          </SoftPressable>
        </View>
      ))}
    </>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** 12400 → "12.4k" so a wide count can't shove the row layout around. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function Count({
  icon,
  value,
  styles,
  color,
}: {
  icon: 'people-outline' | 'chatbubble-outline';
  value: number;
  styles: ReturnType<typeof adminStyles>;
  color: string;
}) {
  return (
    <View style={styles.count}>
      <AppIcon name={icon} size={13} color={color} />
      <Text style={styles.countText}>{formatCount(value)}</Text>
    </View>
  );
}

function adminStyles(c: ThemeColors) {
  return {
    list: { flex: 1, backgroundColor: 'transparent' },
    content: { padding: 24, paddingBottom: 40 },
    hint: {
      color: c.textMuted,
      fontSize: 13,
      textAlign: 'center' as const,
      marginTop: -12,
      marginBottom: 20,
    },
    sectionLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      marginTop: 8,
      marginBottom: 10,
    },
    empty: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const },

    statsGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
      marginBottom: 20,
    },
    statCard: {
      flexGrow: 1,
      flexBasis: '30%' as const,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    statValue: {
      color: c.text,
      fontSize: 19,
      fontWeight: '700' as const,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },
    statLabel: { color: c.textMuted, fontSize: 11, marginTop: 2 },

    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      padding: 14,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowOpen: { borderColor: c.chrome, marginBottom: 0 },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { color: c.text, fontSize: 15, fontWeight: '700' as const },
    rowSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    rowCounts: { flexDirection: 'row' as const, gap: 10 },
    count: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
    countText: {
      color: c.textDim,
      fontSize: 12,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },

    detail: {
      marginLeft: 14,
      marginBottom: 8,
      paddingLeft: 12,
      paddingVertical: 10,
      borderLeftWidth: 2,
      borderLeftColor: c.chrome,
    },
    detailLoading: { alignSelf: 'flex-start' as const },
    groupLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      marginTop: 10,
      marginBottom: 4,
    },

    healthBlock: {
      padding: 14,
      marginBottom: 16,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    healthHead: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    healthTitle: { color: c.text, fontSize: 14, fontWeight: '700' as const },
    healthMeta: { color: c.textMuted, fontSize: 12, marginTop: 4, marginBottom: 8 },
    healthRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 8,
      paddingVertical: 5,
    },
    healthName: { color: c.text, fontSize: 13, fontWeight: '600' as const },
    healthDetail: { color: c.textDim, fontSize: 12, marginTop: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    detailMeta: { color: c.textMuted, fontSize: 12, marginBottom: 8 },
    rosterRow: { paddingVertical: 5 },
    memberRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 5,
    },
    voiceChip: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    voiceChipOn: { borderColor: HEALTHY, backgroundColor: 'rgba(34,197,94,0.12)' },
    voiceChipText: { color: c.textMuted, fontSize: 11, fontWeight: '700' as const },
    voiceChipTextOn: { color: HEALTHY },
    rosterName: { color: c.text, fontSize: 14, fontWeight: '600' as const },
    rosterMeta: { color: c.textDim, fontSize: 12, marginTop: 1 },

    more: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 13,
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    moreText: { color: c.text, fontSize: 13, fontWeight: '700' as const },
    retry: {
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
    },
    retryText: { color: c.danger, fontSize: 13, fontWeight: '600' as const },
  };
}
