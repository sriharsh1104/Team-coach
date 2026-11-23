import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { SoftPressable } from './SoftPressable';
import { emitToast } from './toastBus';
import { PingLabel } from './PingLabel';

type OrgHeaderInfo = { orgCode: string; memberCount: number };

// Module-level cache so every section header doesn't refetch the org —
// OrgHome's own loads refresh it (see updateOrgHeaderCache call there).
let cached: OrgHeaderInfo | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<(info: OrgHeaderInfo) => void>();

export function updateOrgHeaderCache(detail: OrgDetail) {
  cached = { orgCode: detail.orgCode, memberCount: detail.members.length };
  listeners.forEach((l) => l(cached!));
}

function ensureFetched() {
  if (cached || inflight) return;
  inflight = orgApi
    .getMyOrg()
    .then((detail) => {
      updateOrgHeaderCache(detail);
    })
    .catch(() => {
      // Header info is a nicety — the next mounted header retries.
    })
    .finally(() => {
      inflight = null;
    });
}

/**
 * Home-matching shell title: org (or guild) name + live ping on top, org
 * code · member count underneath. Section name lives on the ChatFlowHeader
 * row below (back + title), not here.
 */
export function HeaderOrgInfo({ fallbackTitle }: { fallbackTitle?: string }) {
  const { org, guild } = useAuth();
  const { colors } = useTheme();
  const [info, setInfo] = useState<OrgHeaderInfo | null>(cached);

  useEffect(() => {
    listeners.add(setInfo);
    if (org) ensureFetched();
    return () => {
      listeners.delete(setInfo);
    };
  }, [org]);

  const copyCode = async () => {
    if (!info?.orgCode) return;
    await Clipboard.setStringAsync(info.orgCode);
    emitToast('Org code copied');
  };

  const identity = org?.name ?? guild?.name ?? fallbackTitle ?? '';

  return (
    <View style={styles.block}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {identity}
        </Text>
        {identity ? <PingLabel style={styles.ping} /> : null}
      </View>
      {org && info ? (
        <SoftPressable
          onPress={copyCode}
          accessibilityRole="button"
          accessibilityLabel="Copy Org Code"
          hitSlop={6}
          pressScale={0.97}
        >
          <Text numberOfLines={1} style={styles.subtitleRow}>
            <Text style={[styles.code, { color: colors.link }]}>
              Org Code: {info.orgCode}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {' · '}
              {info.memberCount} Member(s)
            </Text>
          </Text>
        </SoftPressable>
      ) : guild?.name ? (
        <Text
          style={[styles.subtitle, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          Guild
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { minWidth: 0, flexShrink: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  ping: { fontSize: 12, textTransform: 'none' },
  subtitleRow: { marginTop: 1 },
  subtitle: { fontSize: 11 },
  code: { fontSize: 11, fontWeight: '700' },
});
