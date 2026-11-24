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
  AdminDirectVoiceUser,
  AdminHealth,
  AdminMember,
  AdminOrgDetail,
  AdminOrgRow,
  AdminOverview,
  AdminServiceCheck,
} from '../../api/admin';
import { apiErrorMessage } from '../../api/apiErrorMessage';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { SkeletonList } from '../../ui/Skeleton';
import { SoftPressable } from '../../ui/SoftPressable';
import { confirmAsync } from '../../ui/confirmAsync';
import { emitToast } from '../../ui/toastBus';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { useSharedStyles } from '../shared';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
/** Same green the voice UI uses for "connected" — there is no theme token. */
const HEALTHY = '#22c55e';

type Tab = 'overview' | 'guilds' | 'voice' | 'health';

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'guilds' as const, label: 'Guilds' },
  { value: 'voice' as const, label: 'Voice' },
  { value: 'health' as const, label: 'Health' },
];

/**
 * Platform admin, split into tabs.
 *
 * It used to be one long scroll with every number, every guild and every
 * service stacked on top of each other — fine on a desktop sidebar, unusable
 * on a phone. Each tab now answers one question, and all four share a single
 * up-front load so switching between them is instant.
 *
 * Reaching the screen needs the server to have said `isPlatformAdmin`, but
 * that is only what draws the entry point. Every call below is re-authorised
 * server-side, so the screen is never the security boundary.
 */
export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [voiceUsers, setVoiceUsers] = useState<AdminDirectVoiceUser[] | null>(
    null,
  );
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Read inside load() so changing the query doesn't rebuild the pull-to-
  // refresh control (and with it the RefreshControl element) on every keystroke.
  const searchRef = useRef(search);
  searchRef.current = search;

  /**
   * Health and the voice roster, kept off the critical path and outside the
   * try below: they render when they arrive, and a failure in either must
   * never be able to empty the counts and the guild list — which is exactly
   * what happened while they shared one try block.
   */
  const loadSideData = useCallback(() => {
    adminApi.getHealth().then(setHealth, () => setHealth(null));
    adminApi
      .listDirectVoiceUsers()
      .then(setVoiceUsers, () => setVoiceUsers(null));
  }, []);

  const load = useCallback(async () => {
    const query = searchRef.current.trim() || undefined;
    loadSideData();
    try {
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
  }, [loadSideData]);

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
        .then((fresh) => {
          // A slower earlier request must not overwrite a newer selection.
          setDetail((prev) => (fresh.id === id ? fresh : prev));
        })
        .catch(() => setSelectedId(null));
    },
    [selectedId],
  );

  /**
   * Grant or revoke 1-on-1 voice. The affected rows are re-read from the
   * server rather than patched locally: only the server knows whether the
   * write landed, and a stale chip here would misreport a permission.
   */
  const toggleDirectVoice = useCallback(
    async (userId: string, enabled: boolean) => {
      setBusyUserId(userId);
      try {
        await adminApi.setDirectVoice({ userId, enabled });
        const [fresh, holders] = await Promise.all([
          selectedId ? adminApi.getOrg(selectedId) : Promise.resolve(null),
          adminApi.listDirectVoiceUsers(),
        ]);
        if (fresh) setDetail(fresh);
        setVoiceUsers(holders);
      } catch (err) {
        emitToast(apiErrorMessage(err, 'Could not change that permission'));
      } finally {
        setBusyUserId(null);
      }
    },
    [selectedId],
  );

  /**
   * Block / unblock / delete one account. Delete asks for the email because
   * the server asks for it too — a member row sits one tap from the voice
   * toggle, which is no place for an irreversible action behind a yes/no.
   */
  const moderate = useCallback(
    async (
      member: AdminMember,
      action: 'block' | 'unblock' | 'delete',
    ) => {
      try {
        if (action === 'delete') {
          const ok = await confirmAsync(
            `Delete ${member.name}?`,
            `This removes ${member.email}, their messages, media and every seat they hold. It cannot be undone.`,
            'Delete account',
          );
          if (!ok) return;
          await adminApi.deleteUser(member.id, member.email);
          emitToast(`Deleted ${member.email}`);
        } else if (action === 'block') {
          const ok = await confirmAsync(
            `Block ${member.name}?`,
            'They are signed out on their next action and cannot sign back in until you unblock them.',
            'Block',
          );
          if (!ok) return;
          await adminApi.blockUser(member.id);
          emitToast(`Blocked ${member.email}`);
        } else {
          await adminApi.unblockUser(member.id);
          emitToast(`Unblocked ${member.email}`);
        }
        if (selectedId) {
          const fresh = await adminApi.getOrg(selectedId);
          setDetail(fresh);
        }
      } catch (err) {
        emitToast(apiErrorMessage(err, 'Could not apply that change'));
      }
    },
    [selectedId],
  );

  const deleteGuild = useCallback(
    async (org: { id: string; name: string }) => {
      // Typing the name back is what the server demands too — a tap on the
      // wrong row must not be able to wipe a guild.
      const ok = await confirmAsync(
        `Delete ${org.name}?`,
        'This removes the guild and every message, media post, stat and member seat in it. It cannot be undone. Members will be sent back to the join screen.',
        'Delete guild',
      );
      if (!ok) return;
      try {
        const res = await adminApi.deleteOrg(org.id, org.name);
        emitToast(`Deleted ${res.name}`);
        setSelectedId(null);
        setDetail(null);
        await load();
      } catch (err) {
        emitToast(apiErrorMessage(err, 'Could not delete that guild'));
      }
    },
    [load],
  );

  const downServices = useMemo(
    () => health?.services.filter((s) => s.status === 'down') ?? [],
    [health],
  );

  return (
    <Screen>
      <AdminTabContent
        tab={tab}
        setTab={setTab}
        downCount={downServices.length}
        overview={overview}
        health={health}
        voiceUsers={voiceUsers}
        orgs={orgs}
        total={total}
        search={search}
        setSearch={setSearch}
        failed={failed}
        isLoadingMore={isLoadingMore}
        loadMore={loadMore}
        load={load}
        refreshControl={refreshControl}
        selectedId={selectedId}
        detail={detail}
        openOrg={openOrg}
        busyUserId={busyUserId}
        toggleDirectVoice={toggleDirectVoice}
        moderate={moderate}
        deleteGuild={deleteGuild}
      />
    </Screen>
  );
}

/* ---------------- Shell ---------------- */

type ContentProps = {
  tab: Tab;
  setTab: (t: Tab) => void;
  downCount: number;
  overview: AdminOverview | null;
  health: AdminHealth | null;
  voiceUsers: AdminDirectVoiceUser[] | null;
  orgs: AdminOrgRow[] | null;
  total: number;
  search: string;
  setSearch: (s: string) => void;
  failed: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  load: () => Promise<void>;
  refreshControl: React.ReactElement;
  selectedId: string | null;
  detail: AdminOrgDetail | null;
  openOrg: (id: string) => void;
  busyUserId: string | null;
  toggleDirectVoice: (userId: string, enabled: boolean) => void;
  moderate: (member: AdminMember, action: 'block' | 'unblock' | 'delete') => void;
  deleteGuild: (org: { id: string; name: string }) => void;
};

function AdminTabContent(props: ContentProps) {
  const { tab, setTab, downCount } = props;
  const shared = useSharedStyles();
  const styles = useThemedStyles(adminStyles);

  const header = (
    <View>
      <Text style={shared.title}>Platform</Text>
      <Text style={styles.hint}>
        {downCount > 0
          ? `${downCount} service${downCount === 1 ? '' : 's'} need attention`
          : 'Guilds, people and backend health'}
      </Text>
      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
    </View>
  );

  // Only the Guilds tab is a real list; the rest are short enough to render
  // inside one header, which keeps every tab on the same pull-to-refresh.
  if (tab === 'guilds') return <GuildsTab {...props} header={header} />;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={[]}
      keyExtractor={() => 'none'}
      renderItem={() => null}
      refreshControl={props.refreshControl}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {header}
          {tab === 'overview' ? (
            <OverviewTab overview={props.overview} styles={styles} />
          ) : null}
          {tab === 'voice' ? (
            <VoiceTab
              users={props.voiceUsers}
              busyUserId={props.busyUserId}
              onRevoke={(id) => props.toggleDirectVoice(id, false)}
              styles={styles}
            />
          ) : null}
          {tab === 'health' ? (
            <HealthTab health={props.health} styles={styles} />
          ) : null}
        </View>
      }
    />
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({
  overview,
  styles,
}: {
  overview: AdminOverview | null;
  styles: ReturnType<typeof adminStyles>;
}) {
  const groups: { label: string; stats: [string, number | undefined][] }[] = [
    {
      label: 'People',
      stats: [
        ['Total users', overview?.users],
        ['Verified', overview?.verifiedUsers],
        ['New · 24h', overview?.newUsersLast24Hours],
        ['New · 7d', overview?.newUsersLast7Days],
        ['Admins', overview?.admins],
      ],
    },
    {
      label: 'Active',
      stats: [
        ['Online now', overview?.onlineNow],
        ['Active · 24h', overview?.activeUsers24h],
        ['Active · 7d', overview?.activeUsers7d],
        ['Active · 30d', overview?.activeUsers30d],
      ],
    },
    {
      label: 'Guilds',
      stats: [
        ['Guilds', overview?.orgs],
        ['Guild members', overview?.guildMembers],
        ['Roster seats', overview?.rosterMembers],
        ['Requests', overview?.pendingJoinRequests],
        ['Messages', overview?.messages],
        ['Scrims', overview?.scrims],
      ],
    },
  ];

  return (
    <View>
      {groups.map((group) => (
        <View key={group.label} style={styles.section}>
          <Text style={styles.sectionLabel}>{group.label}</Text>
          <View style={styles.statsGrid}>
            {group.stats.map(([label, value]) => (
              <View key={label} style={styles.statCard}>
                <Text style={styles.statValue}>
                  {value == null ? '—' : formatCount(value)}
                </Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.note}>
        “Online now” is live socket presence and resets when the backend
        restarts. “Active” is last-seen time, which does not.
      </Text>
    </View>
  );
}

/* ---------------- Guilds ---------------- */

function GuildsTab({
  header,
  orgs,
  total,
  search,
  setSearch,
  failed,
  isLoadingMore,
  loadMore,
  load,
  refreshControl,
  selectedId,
  detail,
  openOrg,
  busyUserId,
  toggleDirectVoice,
  moderate,
  deleteGuild,
}: ContentProps & { header: React.ReactElement }) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(adminStyles);

  return (
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
          {header}
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
          {!orgs && !failed ? <SkeletonList count={6} avatar={false} /> : null}
        </View>
      }
      ListEmptyComponent={
        failed ? (
          <SoftPressable
            style={styles.retry}
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Try loading again"
          >
            <Text style={styles.retryText}>Could not load. Tap to retry.</Text>
          </SoftPressable>
        ) : !orgs ? null : (
          <Text style={styles.empty}>
            {search.trim() ? 'No guilds match that search.' : 'No guilds yet.'}
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
            accessibilityLabel={`Load more guilds, showing ${orgs.length} of ${total}`}
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
      renderItem={({ item }) => (
        <GuildRow
          org={item}
          isOpen={selectedId === item.id}
          detail={selectedId === item.id ? detail : null}
          styles={styles}
          colors={colors}
          onPress={() => openOrg(item.id)}
          busyUserId={busyUserId}
          onToggleVoice={toggleDirectVoice}
          onModerate={moderate}
          onDelete={() => deleteGuild(item)}
        />
      )}
    />
  );
}

function GuildRow({
  org,
  isOpen,
  detail,
  styles,
  colors,
  onPress,
  busyUserId,
  onToggleVoice,
  onModerate,
  onDelete,
}: {
  org: AdminOrgRow;
  isOpen: boolean;
  detail: AdminOrgDetail | null;
  styles: ReturnType<typeof adminStyles>;
  colors: ThemeColors;
  onPress: () => void;
  busyUserId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
  onModerate: (member: AdminMember, action: 'block' | 'unblock' | 'delete') => void;
  onDelete: () => void;
}) {
  return (
    <View>
      <SoftPressable
        style={[styles.row, isOpen && styles.rowOpen]}
        onPress={onPress}
        pressScale={0.985}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${org.name}, ${org.rosterCount} roster members`}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {org.name}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {org.owner ? `${org.owner.name} · ${org.owner.email}` : 'No owner'}
          </Text>
        </View>
        <View style={styles.rowCounts}>
          <Count
            icon="people-outline"
            value={org.guildCount}
            styles={styles}
            color={colors.textDim}
          />
          <Count
            icon="chatbubble-outline"
            value={org.messageCount}
            styles={styles}
            color={colors.textDim}
          />
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
              {/* One list: the guild and roster lists were the same people
                  twice, since joining the roster also creates a guild seat.
                  Each row now says which seats it holds. */}
              <MemberGroup
                title={`Members (${detail.members.length})`}
                members={detail.members}
                styles={styles}
                busyId={busyUserId}
                onToggleVoice={onToggleVoice}
                onModerate={onModerate}
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

              <SoftPressable
                style={styles.danger}
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel={`Delete guild ${org.name}`}
              >
                <Text style={styles.dangerText}>Delete this guild</Text>
              </SoftPressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

function MemberGroup({
  title,
  members,
  styles,
  busyId,
  onToggleVoice,
  onModerate,
}: {
  title: string;
  members: AdminMember[];
  styles: ReturnType<typeof adminStyles>;
  busyId: string | null;
  onToggleVoice: (userId: string, enabled: boolean) => void;
  onModerate: (member: AdminMember, action: 'block' | 'unblock' | 'delete') => void;
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
              {seatLabel(m)} · {m.email}
            </Text>
            {m.blockedAt ? (
              <Text style={styles.blockedNote} numberOfLines={1}>
                Blocked{m.blockedReason ? ` — ${m.blockedReason}` : ''}
              </Text>
            ) : null}
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
          <SoftPressable
            style={[styles.voiceChip, m.blockedAt && styles.blockedChip]}
            onPress={() => onModerate(m, m.blockedAt ? 'unblock' : 'block')}
            accessibilityRole="button"
            accessibilityLabel={`${m.blockedAt ? 'Unblock' : 'Block'} ${m.name}`}
          >
            <Text
              style={[styles.voiceChipText, m.blockedAt && styles.blockedChipText]}
            >
              {m.blockedAt ? 'Blocked' : 'Block'}
            </Text>
          </SoftPressable>
          <SoftPressable
            style={[styles.voiceChip, styles.deleteChip]}
            onPress={() => onModerate(m, 'delete')}
            accessibilityRole="button"
            accessibilityLabel={`Delete account ${m.name}`}
          >
            <Text style={[styles.voiceChipText, styles.deleteChipText]}>Del</Text>
          </SoftPressable>
        </View>
      ))}
    </>
  );
}

/* ---------------- Voice access ---------------- */

function VoiceTab({
  users,
  busyUserId,
  onRevoke,
  styles,
}: {
  users: AdminDirectVoiceUser[] | null;
  busyUserId: string | null;
  onRevoke: (userId: string) => void;
  styles: ReturnType<typeof adminStyles>;
}) {
  // Grouped by guild, because that is the unit that can actually talk: two
  // holders in different groups below cannot reach each other at all.
  const groups = useMemo(() => groupByGuild(users ?? []), [users]);

  return (
    <View>
      <Text style={styles.note}>
        A call needs the permission on both sides and both people in the same
        guild. Grant it from a member row under Guilds.
      </Text>
      {!users ? <SkeletonList count={3} avatar={false} /> : null}
      {users && users.length === 0 ? (
        <Text style={styles.empty}>Nobody has 1-on-1 voice yet.</Text>
      ) : null}
      {groups.map((group) => (
        <View key={group.key} style={styles.section}>
          <Text style={styles.sectionLabel}>{group.label}</Text>
          <Text style={styles.groupHint}>
            {group.guildless
              ? 'Granted, but in no guild — they can call nobody'
              : group.users.length === 1
                ? 'Only one person here — a call needs two'
                : `${group.users.length} people can call each other`}
          </Text>
          {group.users.map((u) => (
            <View key={u.id} style={styles.memberRow}>
              <View style={styles.rowMain}>
                <Text style={styles.rosterName} numberOfLines={1}>
                  {u.name}
                  {u.inGameName ? ` · ${u.inGameName}` : ''}
                </Text>
                <Text style={styles.rosterMeta} numberOfLines={1}>
                  {u.email}
                </Text>
              </View>
              <SoftPressable
                style={[styles.voiceChip, styles.voiceChipOn]}
                disabled={busyUserId === u.id}
                onPress={() => onRevoke(u.id)}
                accessibilityRole="button"
                accessibilityLabel={`Revoke 1-on-1 voice for ${u.name}`}
              >
                <Text style={[styles.voiceChipText, styles.voiceChipTextOn]}>
                  {busyUserId === u.id ? '…' : 'Revoke'}
                </Text>
              </SoftPressable>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Bucket holders by guild, no-guild last. A holder with no guild cannot call
 * anyone at all, so they are called out rather than quietly listed as if the
 * permission were working for them.
 */
function groupByGuild(users: AdminDirectVoiceUser[]) {
  const NO_GUILD = '__none__';
  const byGuild = new Map<
    string,
    {
      key: string;
      label: string;
      guildless: boolean;
      users: AdminDirectVoiceUser[];
    }
  >();
  for (const user of users) {
    const key = user.guild?.id ?? NO_GUILD;
    let group = byGuild.get(key);
    if (!group) {
      group = {
        key,
        label: user.guild?.name ?? 'No guild',
        guildless: !user.guild,
        users: [],
      };
      byGuild.set(key, group);
    }
    group.users.push(user);
  }
  return [...byGuild.values()].sort((a, b) =>
    a.key === NO_GUILD ? 1 : b.key === NO_GUILD ? -1 : 0,
  );
}

/* ---------------- Health ---------------- */

function HealthTab({
  health,
  styles,
}: {
  health: AdminHealth | null;
  styles: ReturnType<typeof adminStyles>;
}) {
  if (!health) return <SkeletonList count={4} avatar={false} />;

  const live = health.services.filter((s) => s.kind === 'live');
  const configured = health.services.filter((s) => s.kind === 'config');

  return (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>API process</Text>
        <View style={styles.statsGrid}>
          {(
            [
              ['Environment', health.process.env],
              ['Uptime', formatUptime(health.process.uptimeSeconds)],
              ['Memory', `${health.process.memoryMb} MB`],
              ['Node', health.process.nodeVersion],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={styles.statCard}>
              <Text style={styles.statText}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Probed now</Text>
        {live.map((check) => (
          <ServiceRow key={check.key} check={check} styles={styles} />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Configuration</Text>
        {configured.map((check) => (
          <ServiceRow key={check.key} check={check} styles={styles} />
        ))}
        <Text style={styles.note}>
          These report whether credentials are present on the backend host —
          not that the provider answered. Nothing here calls out to a third
          party, so refreshing costs no quota.
        </Text>
      </View>
    </View>
  );
}

function ServiceRow({
  check,
  styles,
}: {
  check: AdminServiceCheck;
  styles: ReturnType<typeof adminStyles>;
}) {
  const { colors } = useTheme();
  const color =
    check.status === 'up'
      ? HEALTHY
      : check.status === 'down'
        ? colors.danger
        : colors.textDim;
  return (
    <View style={styles.healthRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.rowMain}>
        <Text style={styles.healthName} numberOfLines={1}>
          {check.label}
          {check.kind === 'config' ? ' · config' : ''}
          {typeof check.latencyMs === 'number' ? ` · ${check.latencyMs} ms` : ''}
        </Text>
        <Text style={styles.healthDetail} numberOfLines={3}>
          {check.detail}
        </Text>
      </View>
    </View>
  );
}

/* ---------------- Bits ---------------- */

/** Which seats this person holds — the reason the two lists became one. */
function seatLabel(member: AdminMember): string {
  if (member.isOwner) return 'Owner';
  if (!member.inGuild) return `Roster only · ${member.rosterRole ?? 'no role'}`;
  const guild = member.guildRole ?? 'member';
  return member.onRoster ? `${guild} · on roster` : `${guild} · guild only`;
}

/** 12400 → "12.4k" so a wide count can't shove the row layout around. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
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
      marginBottom: 18,
    },
    section: { marginBottom: 22 },
    sectionLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      marginTop: 8,
      marginBottom: 10,
    },
    groupHint: { color: c.textDim, fontSize: 12, marginTop: -6, marginBottom: 8 },
    note: { color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    empty: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const },

    statsGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
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
    // Text stats ("development", "v22.0.0") need to wrap rather than widen
    // the grid, so they sit a notch smaller than the numeric ones.
    statText: { color: c.text, fontSize: 14, fontWeight: '700' as const },
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
    count: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
    },
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
    detailMeta: { color: c.textMuted, fontSize: 12, marginBottom: 8 },
    groupLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
      marginTop: 10,
      marginBottom: 4,
    },
    rosterRow: { paddingVertical: 5 },
    memberRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 5,
    },
    rosterName: { color: c.text, fontSize: 14, fontWeight: '600' as const },
    rosterMeta: { color: c.textDim, fontSize: 12, marginTop: 1 },

    voiceChip: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    voiceChipOn: {
      borderColor: HEALTHY,
      backgroundColor: 'rgba(34,197,94,0.12)',
    },
    voiceChipText: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
    },
    voiceChipTextOn: { color: HEALTHY },
    blockedChip: { borderColor: c.danger, backgroundColor: 'rgba(248,113,113,0.12)' },
    blockedChipText: { color: c.danger },
    deleteChip: { borderColor: c.danger },
    deleteChipText: { color: c.danger },
    blockedNote: { color: c.danger, fontSize: 11, marginTop: 1 },

    // The only destructive control in the app that reaches across orgs —
    // outlined in danger and parked at the bottom of an expanded guild, so
    // it is never next to something you tap casually.
    danger: {
      marginTop: 14,
      alignItems: 'center' as const,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
    },
    dangerText: { color: c.danger, fontSize: 13, fontWeight: '700' as const },

    healthRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 8,
      paddingVertical: 7,
    },
    healthName: { color: c.text, fontSize: 13, fontWeight: '600' as const },
    healthDetail: { color: c.textDim, fontSize: 12, marginTop: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },

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
