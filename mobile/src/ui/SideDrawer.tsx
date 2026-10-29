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
import { SoftPressable } from './SoftPressable';

const DRAWER_WIDTH = Math.min(300, Dimensions.get('window').width * 0.82);
const SKIP_MOTION = process.env.NODE_ENV === 'test';

export type SideDrawerItem = {
  key: string;
  label: string;
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
    if (SKIP_MOTION) {
      slide.setValue(open ? 0 : -DRAWER_WIDTH);
      return;
    }
    Animated.timing(slide, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const renderItem = (item: SideDrawerItem) => (
    <SoftPressable
      key={item.key}
      style={[styles.item, item.danger && styles.itemDanger]}
      onPress={() => {
        onClose();
        item.onPress();
      }}
      pressScale={0.97}
    >
      <Text style={[styles.itemText, item.danger && { color: colors.danger }]}>
        {item.label}
      </Text>
    </SoftPressable>
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
            <SoftPressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close Menu"
              style={styles.closeBtn}
              pressScale={0.9}
            >
              <Text style={styles.closeGlyph}>✕</Text>
            </SoftPressable>
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
    <SoftPressable
      onPress={onPress}
      style={styles.menuBtn}
      accessibilityLabel="Open Menu"
      hitSlop={8}
      pressScale={0.92}
    >
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    backgroundColor: '#101014',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    zIndex: 2,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 8,
    paddingHorizontal: 4,
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
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  closeGlyph: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  items: { gap: 6, paddingBottom: 12 },
  footer: {
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 8,
  },
  item: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  itemText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  itemDanger: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderColor: 'rgba(248,113,113,0.2)',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
