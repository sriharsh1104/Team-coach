import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as orgApi from '../api/org';
import { OrgDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { SoftPressable } from './SoftPressable';
import { emitToast } from './toastBus';

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
 * Two-line native-header title for section screens: the section name on
 * top, the org identity (name · code · member count) underneath — so the
 * block from the Home header follows the user everywhere.
 */
export function HeaderOrgInfo({ sectionTitle }: { sectionTitle: string }) {
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

  const identity = org?.name ?? guild?.name;

  return (
    <View style={styles.block}>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {sectionTitle}
      </Text>
      {identity ? (
        <SoftPressable
          onPress={copyCode}
          accessibilityRole="button"
          accessibilityLabel="Copy Org Code"
          hitSlop={6}
          pressScale={0.97}
        >
          <Text numberOfLines={1} style={styles.subtitleRow}>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {identity}
            </Text>
            {org && info ? (
              <>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {' · '}
                </Text>
                <Text style={[styles.code, { color: colors.link }]}>
                  {info.orgCode}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {' · '}
                  {info.memberCount} Member(s)
                </Text>
              </>
            ) : null}
          </Text>
        </SoftPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { minWidth: 0, flexShrink: 1 },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: -0.2,
  },
  subtitleRow: { marginTop: 1 },
  subtitle: { fontSize: 11 },
  code: { fontSize: 11, fontWeight: '700' },
});
