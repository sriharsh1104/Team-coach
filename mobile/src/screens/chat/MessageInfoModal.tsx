import React from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

export interface ReceiptEntry {
  userId: string;
  name: string;
}

interface Props {
  visible: boolean;
  deliveredTo: ReceiptEntry[];
  readBy: ReceiptEntry[];
  onClose: () => void;
}

/** WhatsApp-style "Message info" sheet — two sections, opened via a
 * long-press on the tick row rather than a plain tap on a visible count. */
export function MessageInfoModal({ visible, deliveredTo, readBy, onClose }: Props) {
  const styles = useThemedStyles(messageInfoStyles);
  const readIds = new Set(readBy.map((r) => r.userId));
  // Everyone who's read it has also, by definition, received it — but a
  // member can be delivered-only if they haven't opened the chat yet.
  const deliveredOnly = deliveredTo.filter((d) => !readIds.has(d.userId));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={staticStyles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>Message Info</Text>

          <Text style={styles.sectionLabel}>Read by</Text>
          {readBy.length === 0 ? (
            <Text style={styles.empty}>No one yet.</Text>
          ) : (
            <FlatList
              data={readBy}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.checkRead}>✓✓</Text>
                </View>
              )}
            />
          )}

          <Text style={styles.sectionLabel}>Delivered to</Text>
          {deliveredOnly.length === 0 ? (
            <Text style={styles.empty}>No one yet.</Text>
          ) : (
            <FlatList
              data={deliveredOnly}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.checkDelivered}>✓✓</Text>
                </View>
              )}
            />
          )}

          <Pressable style={staticStyles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  closeBtn: { alignItems: 'center', paddingTop: 16 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function messageInfoStyles(c: ThemeColors) {
  return {
    // Was a fixed '#121216' panel while every label inside it is themed —
    // dark-on-dark, i.e. unreadable, once the white / lavender theme is on.
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingTop: 16,
      paddingHorizontal: 20,
      paddingBottom: 28,
      maxHeight: '70%' as const,
    },
    title: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 16,
      marginBottom: 12,
    },
    sectionLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      marginTop: 12,
      marginBottom: 4,
    },
    row: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    name: { color: c.text, fontSize: 15, fontWeight: '600' as const },
    checkRead: { color: c.link, fontSize: 14 },
    checkDelivered: { color: c.textMuted, fontSize: 14 },
    empty: { color: c.textMuted, paddingVertical: 6 },
    closeText: { color: c.link, fontWeight: '700' as const },
  };
}
