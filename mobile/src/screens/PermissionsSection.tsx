import React from 'react';
import { Text, View } from 'react-native';
import {
  APP_PERMISSIONS,
  AppPermission,
  PERMISSION_LABELS,
  openAppSettings,
  usePermissionStates,
} from '../hooks/useAppPermissions';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';

/** Same green the voice UI uses for "connected" — there is no theme token. */
const GRANTED = '#22c55e';

/**
 * In-app permission list.
 *
 * The app asks for everything once on first launch, but anything turned down
 * there is otherwise unreachable: once a permission is hard-denied the OS
 * stops showing its dialog, so tapping "turn on camera" inside a feature does
 * nothing at all. This is the way back — ask again where the OS still allows
 * it, and hand over to system settings where it does not.
 */
export function PermissionsSection() {
  const styles = useThemedStyles(permissionStyles);
  const { states, request, refresh } = usePermissionStates();

  const onPress = async (permission: AppPermission) => {
    const next = await request(permission);
    if (next === 'granted') {
      emitToast(`${PERMISSION_LABELS[permission].title} enabled`);
      return;
    }
    // The dialog did not appear (or was refused again) — settings is the only
    // route left, so say that plainly instead of looking like a dead button.
    emitToast(
      `Turn on ${PERMISSION_LABELS[permission].title} in system settings`,
    );
    openAppSettings();
  };

  return (
    <View>
      <Text style={styles.sectionLabel}>Permissions</Text>
      <Text style={styles.lead}>
        Asked once when you install. Anything you said no to can be turned on
        here.
      </Text>

      {APP_PERMISSIONS.map((permission) => {
        const state = states[permission];
        const label = PERMISSION_LABELS[permission];
        const granted = state === 'granted';
        return (
          <View key={permission} style={styles.row}>
            <View
              style={[
                styles.dot,
                { backgroundColor: granted ? GRANTED : undefined },
                !granted && styles.dotOff,
              ]}
            />
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{label.title}</Text>
              <Text style={styles.rowWhy}>{label.why}</Text>
            </View>
            {granted ? (
              <Text style={styles.onText}>On</Text>
            ) : (
              <SoftPressable
                style={styles.grantBtn}
                onPress={() => void onPress(permission)}
                accessibilityRole="button"
                accessibilityLabel={`Turn on ${label.title}`}
              >
                <Text style={styles.grantText}>
                  {state === 'denied' ? 'Turn on' : 'Allow'}
                </Text>
              </SoftPressable>
            )}
          </View>
        );
      })}

      <SoftPressable
        style={styles.refresh}
        onPress={() => void refresh()}
        accessibilityRole="button"
        accessibilityLabel="Re-check permissions"
      >
        <Text style={styles.refreshText}>Re-check</Text>
      </SoftPressable>
    </View>
  );
}

function permissionStyles(c: ThemeColors) {
  return {
    sectionLabel: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800' as const,
      marginTop: 28,
      marginBottom: 6,
    },
    lead: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 14,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotOff: { backgroundColor: c.textDim },
    rowMain: { flex: 1, minWidth: 0 },
    rowTitle: { color: c.text, fontSize: 14, fontWeight: '700' as const },
    rowWhy: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    onText: { color: GRANTED, fontSize: 12, fontWeight: '700' as const },
    grantBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.chrome,
    },
    grantText: { color: c.chrome, fontSize: 12, fontWeight: '700' as const },
    refresh: { alignSelf: 'flex-start' as const, paddingVertical: 8 },
    refreshText: { color: c.link, fontSize: 13, fontWeight: '600' as const },
  };
}
