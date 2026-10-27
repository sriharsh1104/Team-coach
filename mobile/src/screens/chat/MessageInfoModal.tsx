import React from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { colors } from '../../theme';

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
  const readIds = new Set(readBy.map((r) => r.userId));
  // Everyone who's read it has also, by definition, received it — but a
  // member can be delivered-only if they haven't opened the chat yet.
  const deliveredOnly = deliveredTo.filter((d) => !readIds.has(d.userId));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
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

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#121216',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  checkRead: { color: colors.link, fontSize: 14 },
  checkDelivered: { color: colors.textMuted, fontSize: 14 },
  empty: { color: colors.textMuted, paddingVertical: 6 },
  closeBtn: { alignItems: 'center', paddingTop: 16 },
  closeText: { color: colors.link, fontWeight: '700' },
});
