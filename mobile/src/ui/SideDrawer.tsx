import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { AppIconName, ButtonLabel } from './ButtonLabel';

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.82);

export type SideDrawerItem = {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
  danger?: boolean;
};

/** Left slide-over menu — hamburger opens, backdrop or X closes. */
export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  items,
  footerItems = [],
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: SideDrawerItem[];
  /** Pinned to the bottom of the drawer (e.g. Log Out). */
  footerItems?: SideDrawerItem[];
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const renderItem = (item: SideDrawerItem) => (
    <Pressable
      key={item.key}
      style={[styles.item, item.danger && styles.itemDanger]}
      onPress={() => {
        onClose();
        item.onPress();
      }}
    >
      <ButtonLabel
        icon={item.icon}
        color={item.danger ? colors.danger : colors.text}
      >
        {item.label}
      </ButtonLabel>
    </Pressable>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Close Menu"
        />
        <Animated.View
          style={[
            styles.panel,
            {
              width: DRAWER_WIDTH,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close Menu"
              style={styles.closeBtn}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.items}
            showsVerticalScrollIndicator={false}
          >
            {items.map(renderItem)}
          </ScrollView>

          {footerItems.length > 0 ? (
            <View style={styles.footer}>{footerItems.map(renderItem)}</View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Top-bar hamburger that opens the drawer. */
export function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.menuBtn}
      accessibilityLabel="Open Menu"
      hitSlop={8}
    >
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    backgroundColor: '#121216',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 16,
    zIndex: 2,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 13,
  },
  closeBtn: {
    padding: 6,
  },
  closeGlyph: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  items: { gap: 8, paddingBottom: 12 },
  footer: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  item: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  itemDanger: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  menuBar: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
});
