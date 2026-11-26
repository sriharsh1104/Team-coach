import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  UIManager,
  View,
  StyleSheet,
} from 'react-native';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { AppIcon } from '../ui/AppIcon';
import { useTheme } from '../theme/ThemeContext';

type FaqItem = { q: string; a: string };

const FAQS: FaqItem[] = [
  {
    q: 'What Is Sacred Team Coach?',
    a: 'Sacred Team Coach is an esports team platform — chat, voice, scrims, stats, roster, guild community, and live tools in one place for your org.',
  },
  {
    q: 'How Do I Complete My Profile?',
    a: 'Open Settings → Edit Profile. Fill your name, then Free Fire IGN and UID on the Game tab. Other games (BGMI, Mobile Legends, LoL) are optional.',
  },
  {
    q: 'Who Can See My Phone And Social Links?',
    a: 'Only what you allow. Go to Account Settings → Privacy and toggle Phone, WhatsApp, Instagram, Discord, YouTube, Kick, plus each game’s IGN and UID.',
  },
  {
    q: 'How Do Team Voice Channels Work?',
    a: 'Open Team Chat or Guild Chat and join voice from the header. Mic, camera, and notification permissions must be allowed in Settings → Permissions.',
  },
  {
    q: 'Why Is A Permission Button Not Working?',
    a: 'If you denied a permission earlier, Android/iOS may hide the dialog. Use Settings → Permissions → Turn On, or open system settings from there.',
  },
  {
    q: 'How Do I Change Theme Or Date Format?',
    a: 'Settings → Theme picks Automatic / Black / White / Lavender. Settings → Date & Time Format controls how dates and times appear in the app for you.',
  },
  {
    q: 'What Is The Difference Between Deactivate And Delete?',
    a: 'Deactivate pauses your account; signing in again reactivates it. Delete permanently removes your account and cannot be undone from the app. Both live under Account Settings → Delete.',
  },
  {
    q: 'I Own A Team — Can I Delete My Account?',
    a: 'Not while you are still the org owner. Transfer ownership or delete the team first, then delete your account from Account Settings → Delete.',
  },
  {
    q: 'How Do Scrims And Stats Work?',
    a: 'Coaches schedule scrims/tournaments from the Scrims section. Stats can match Free Fire scoreboard uploads to teammates by their Free Fire IGN.',
  },
  {
    q: 'Still Need Help?',
    a: 'Ask your team owner or coach first — most roster and guild issues are org-side. For account lockouts after deactivation, just sign in again to reactivate.',
  },
];

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const EXPAND_MS = 260;

function FaqAnswer({
  open,
  text,
  styles,
}: {
  open: boolean;
  text: string;
  styles: ReturnType<typeof helpStyles>;
}) {
  const [mounted, setMounted] = useState(open);
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(open ? 0 : -6)).current;

  useEffect(() => {
    if (open) setMounted(true);
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: EXPAND_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: open ? 0 : -6,
        duration: EXPAND_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => anim.stop();
  }, [open, opacity, translateY]);

  if (!mounted) return null;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={styles.aText}>{text}</Text>
    </Animated.View>
  );
}

export function HelpSupportScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(helpStyles);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    LayoutAnimation.configureNext({
      duration: EXPAND_MS,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Help & Support</Text>
        <Text style={styles.lead}>
          Common questions about Sacred Team Coach — tap a question to expand.
        </Text>

        {FAQS.map((item, index) => {
          const open = openIndex === index;
          return (
            <View key={item.q} style={styles.card}>
              <SoftPressable
                style={styles.qRow}
                onPress={() => toggle(index)}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={item.q}
              >
                <Text style={styles.qText}>{item.q}</Text>
                <AppIcon
                  name={open ? 'close' : 'add-circle-outline'}
                  size={18}
                  color={colors.link}
                />
              </SoftPressable>
              <FaqAnswer open={open} text={item.a} styles={styles} />
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function helpStyles(c: ThemeColors) {
  return {
    content: { padding: 16, paddingBottom: 40 },
    title: {
      color: c.text,
      fontSize: 28,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
      marginBottom: 8,
    },
    lead: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 18,
    },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      marginBottom: 10,
      overflow: 'hidden' as const,
    },
    qRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    qText: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      fontWeight: '700' as const,
    },
    aText: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 21,
      paddingHorizontal: 14,
      paddingBottom: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingTop: 12,
    },
  };
}
