import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { SoftPressable } from './SoftPressable';

const WINDOW = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(300, WINDOW.width * 0.82);
const DRAWER_MS = 260;
/** Babel often inlines NODE_ENV away from 'test' under Jest — detect jest itself. */
const SKIP_MOTION =
  typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';

export type SideDrawerItem = {
  key: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  /** Currently open section — soft gold glow. */
  active?: boolean;
};

export type SideDrawerSection = {
  key: string;
  label?: string;
  split?: boolean;
  items: SideDrawerItem[];
};

/** Left slide-over menu — hamburger opens, backdrop or X closes. */
export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  items,
  sections,
  footerItems = [],
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items?: SideDrawerItem[];
  sections?: SideDrawerSection[];
  footerItems?: SideDrawerItem[];
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Closing locally first (before parent flips `open`) keeps the Modal
  // mounted for the slide-out — otherwise visible=false kills the animation
  // and the next screen pops in with a hard cut.
  const closingRef = useRef(false);
  const topPad = Math.max(insets.top, 12) + 8;
  const bottomPad = Math.max(insets.bottom, 12) + 16;

  useEffect(() => {
    if (closingRef.current) return;
    if (SKIP_MOTION) {
      slide.setValue(open ? 0 : -DRAWER_WIDTH);
      backdrop.setValue(open ? 1 : 0);
      return;
    }
    Animated.parallel([
      Animated.timing(slide, {
        toValue: open ? 0 : -DRAWER_WIDTH,
        duration: DRAWER_MS,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: open ? 1 : 0,
        duration: DRAWER_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, slide, backdrop]);

  function animateClosed(after?: () => void) {
    if (SKIP_MOTION) {
      onClose();
      after?.();
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(slide, {
        toValue: -DRAWER_WIDTH,
        duration: DRAWER_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: DRAWER_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      closingRef.current = false;
      if (!finished) return;
      onClose();
      // Let the Modal unmount one frame before the stack reset so the two
      // transitions don't fight and cause a visible jolt.
      requestAnimationFrame(() => after?.());
    });
  }

  const resolvedSections: SideDrawerSection[] =
    sections && sections.length > 0
      ? sections.filter((s) => s.items.length > 0)
      : items && items.length > 0
        ? [{ key: 'main', items }]
        : [];

  // Plain Pressable — SoftPressable's nested Animated.View steals the
  // vertical pan on Android, so Account items at the bottom never scrolled.
  const renderItem = (item: SideDrawerItem) => (
    <Pressable
      key={item.key}
      style={({ pressed }) => [
        styles.item,
        item.danger && styles.itemDanger,
        item.active && styles.itemActive,
        pressed && styles.itemPressed,
      ]}
      onPress={() => animateClosed(() => item.onPress())}
    >
      {item.active ? (
        <View pointerEvents="none" style={styles.itemShineWrap}>
          {/* Left → right: soft → strong, so shine comes in from the right edge */}
          <View style={[styles.itemShineBand, styles.itemShineInner]} />
          <View style={[styles.itemShineBand, styles.itemShineMid]} />
          <View style={[styles.itemShineBand, styles.itemShineOuter]} />
        </View>
      ) : null}
      <Text
        style={[
          styles.itemText,
          item.danger && { color: colors.danger },
          item.active && styles.itemTextActive,
        ]}
      >
        {item.label}
      </Text>
    </Pressable>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => animateClosed()}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdrop }]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => animateClosed()}
          accessibilityLabel="Close Menu"
        />
        <Animated.View
          style={[
            styles.panel,
            {
              width: DRAWER_WIDTH,
              paddingTop: topPad,
              paddingBottom: bottomPad,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => animateClosed()}
              hitSlop={14}
              accessibilityLabel="Close Menu"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.items}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            bounces
            nestedScrollEnabled
            // Extra room so last Account rows clear the home indicator.
            scrollIndicatorInsets={{ bottom: 8 }}
          >
            {resolvedSections.map((section, index) => (
              <View key={section.key} style={styles.section}>
                {section.label ? (
                  <Text
                    style={[
                      styles.sectionLabel,
                      (section.split || index > 0) && styles.sectionSplit,
                    ]}
                  >
                    {section.label}
                  </Text>
                ) : null}
                <View style={styles.sectionItems}>
                  {section.items.map(renderItem)}
                </View>
              </View>
            ))}
            {footerItems.length > 0 ? (
              <View style={styles.footer}>{footerItems.map(renderItem)}</View>
            ) : null}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <SoftPressable
      onPress={onPress}
      style={styles.menuBtn}
      accessibilityLabel="Open Menu"
      hitSlop={8}
      pressScale={0.94}
    >
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0e0e12',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    zIndex: 2,
    // Explicit column + stretch so ScrollView gets a bounded height.
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  items: {
    gap: 4,
    paddingBottom: 8,
  },
  section: { gap: 6 },
  sectionLabel: {
    marginHorizontal: 4,
    marginBottom: 2,
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionSplit: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionItems: { gap: 6 },
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
    overflow: 'hidden',
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: '#e8c547',
    borderWidth: 1.5,
  },
  // Soft gold wash from the right edge inward (no full-card glow).
  itemShineWrap: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  itemShineBand: {
    height: '100%',
  },
  itemShineOuter: {
    width: 8,
    backgroundColor: 'rgba(232,197,71,0.28)',
  },
  itemShineMid: {
    width: 14,
    backgroundColor: 'rgba(232,197,71,0.14)',
  },
  itemShineInner: {
    width: 18,
    backgroundColor: 'rgba(232,197,71,0.06)',
  },
  itemPressed: {
    opacity: 0.75,
  },
  itemText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    zIndex: 1,
  },
  itemTextActive: {
    color: colors.text,
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
