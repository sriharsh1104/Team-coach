import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as orgApi from '../../api/org';
import { OrgMember } from '../../api/types';
import { roleLabel } from '../../api/roles';
import { colors } from '../../theme';
import { SoftPressable } from '../../ui/SoftPressable';
import { ChatFlowHeader } from './ChatFlowHeader';

function formatInGameRoles(roles: string[]): string | null {
  if (roles.length === 0) return null;
  return roles.map(roleLabel).join(', ');
}

/** Group roster sheet used inside ChatHub’s local back stack. */
export function ChatMembersPanel({
  title,
  onBack,
  onSelectMember,
}: {
  title: string;
  onBack: () => void;
  onSelectMember: (member: { userId: string; name: string }) => void;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    orgApi
      .getMyOrg()
      .then((org) => setMembers(org.members))
      .catch(() => setError('Could not load members'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <View style={styles.root}>
      <ChatFlowHeader
        title={title}
        subtitle={
          isLoading
            ? '…'
            : `${members.length} member${members.length === 1 ? '' : 's'}`
        }
        onBack={onBack}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const inGameRoles = formatInGameRoles(item.inGameRoles);
            return (
              <SoftPressable
                style={styles.row}
                onPress={() =>
                  onSelectMember({ userId: item.userId, name: item.name })
                }
                accessibilityRole="button"
                accessibilityLabel={item.name}
                pressScale={0.985}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.name}>
                    {index + 1}. {item.name}
                    {item.isOwner ? ' (Owner)' : ''}
                  </Text>
                  {inGameRoles ? (
                    <Text style={styles.meta}>{inGameRoles}</Text>
                  ) : null}
                </View>
                <Text style={styles.role}>{item.role}</Text>
              </SoftPressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: '600', fontSize: 16 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  role: { color: colors.textMuted, fontWeight: '600', fontSize: 12 },
});
