import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { getThemeColors } from '../theme';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { TwoFactorChallengeScreen } from '../screens/TwoFactorChallengeScreen';
import { EmailVerificationScreen } from '../screens/EmailVerificationScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { BiometricLockScreen } from '../screens/BiometricLockScreen';
import { OrgChoiceScreen } from '../screens/OrgChoiceScreen';
import { CreateOrgScreen } from '../screens/CreateOrgScreen';
import { JoinOrgScreen } from '../screens/JoinOrgScreen';
import { OrgHomeScreen } from '../screens/OrgHomeScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { GuildHomeScreen } from '../screens/GuildHomeScreen';
import { GuildScreen } from '../screens/GuildScreen';
import { OrgSettingsScreen } from '../screens/OrgSettingsScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { TwoFactorSetupScreen } from '../screens/TwoFactorSetupScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MemberProfileScreen } from '../screens/profile/MemberProfileScreen';
import { MediaFeedScreen } from '../screens/media/MediaFeedScreen';
import { ChatScreenWithMedia } from '../screens/chat/ChatScreenWithMedia';
import { ScrimsListScreen } from '../screens/scrims/ScrimsListScreen';
import { AddEditScrimScreen } from '../screens/scrims/AddEditScrimScreen';
import { StatsHomeScreen } from '../screens/stats/StatsHomeScreen';
import { ExtractionReviewScreen } from '../screens/stats/ExtractionReviewScreen';
import { PlayerStatsScreen } from '../screens/stats/PlayerStatsScreen';
import { MapsScreen } from '../screens/MapsScreen';
// Voice pulls LiveKit/WebRTC native modules — load only when opened so a
// broken voice native link cannot crash cold start of the whole APK.

import { RuleBookScreen } from '../screens/RuleBookScreen';
import { PointsTableScreen } from '../screens/PointsTableScreen';
import { SocialHandlesScreen } from '../screens/SocialHandlesScreen';
import { MenuButton, SideDrawer } from '../ui/SideDrawer';
import { useGuildDrawer, useOrgDrawer } from './useAppDrawer';
import {
  AuthStackParamList,
  OrgSetupStackParamList,
  ProfileSetupStackParamList,
  MainStackParamList,
} from './types';
import { titleCase } from '../utils/titleCase';
import { colors } from '../theme';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OrgSetupStack = createNativeStackNavigator<OrgSetupStackParamList>();
const ProfileSetupStack = createNativeStackNavigator<ProfileSetupStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// Every screen reachable directly from OrgHome/GuildHome (not a drill-down
// detail like MemberProfile or PlayerStats) gets this as headerLeft instead
// of the default back chevron — opens the same drawer Home uses, so users
// can jump straight to another section without backing out first. `openWith`
// captures whichever screen's nav prop opened it; dispatching a reset from
// any screen in this stack resets the whole (shared) stack the same way.
function sectionOptions(
  openWith: (nav: any) => void,
  build?: (args: { navigation: any; route: any }) => Record<string, unknown>,
) {
  return (args: { navigation: any; route: any }) => ({
    ...(build ? build(args) : {}),
    // Same drawer entry point as OrgHome / GuildHome AppShellHeader.
    headerLeft: () => <MenuButton onPress={() => openWith(args.navigation)} />,
    headerBackVisible: false,
  });
}

function buildNavTheme(themeId: 'black' | 'white' | 'lavender') {
  const c = getThemeColors(themeId);
  const base = c.statusBar === 'dark' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: c.bg,
      card: c.bg,
      text: c.text,
      border: c.border,
      primary: c.chrome,
      notification: c.link,
    },
  };
}

function buildMainScreenOptions(themeId: 'black' | 'white' | 'lavender') {
  const c = getThemeColors(themeId);
  return {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerTitleStyle: { fontWeight: '700' as const, color: c.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    contentStyle: { backgroundColor: c.bg },
    // Soft fade when pushing/popping sections from the drawer or system back.
    animation: 'fade' as const,
    animationDuration: 280,
  };
}

// On a web page refresh, React Navigation has nothing to restore from and
// always boots back at the default route — this persists/restores the
// current screen across a refresh so an F5 doesn't throw the user back to
// OrgHome. Native builds don't need this ("refresh" isn't really a native
// concept the same way), so it's web-only.
type NavPhase = 'auth' | 'profileSetup' | 'orgSetup' | 'guild' | 'main';
const NAV_STATE_KEY = 'team-coach.navState';

function computeNavPhase(
  user: { profileComplete: boolean } | null,
  org: unknown,
  guild: unknown,
): NavPhase {
  if (!user) return 'auth';
  if (!user.profileComplete) return 'profileSetup';
  if (org) return 'main';
  if (guild) return 'guild';
  return 'orgSetup';
}

// Persisted state is only valid for the navigator tree it was captured
// under (Auth/ProfileSetup/OrgSetup/Main each register different route
// names) — tagging it with the phase and only restoring on a phase match
// avoids handing React Navigation a route name it doesn't recognize.
function loadPersistedNavState(phase: NavPhase): NavigationState | undefined {
  if (Platform.OS !== 'web') return undefined;
  try {
    const raw = localStorage.getItem(NAV_STATE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed.phase === phase ? parsed.state : undefined;
  } catch {
    return undefined;
  }
}

function persistNavState(phase: NavPhase, state: NavigationState | undefined) {
  if (Platform.OS !== 'web' || !state) return;
  try {
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify({ phase, state }));
  } catch {
    // Private browsing / storage full — losing refresh-persistence isn't
    // worth surfacing an error for.
  }
}

export function RootNavigator() {
  const { isLoading, user, org, guild, needsBiometricUnlock } = useAuth();
  const { themeId } = useTheme();
  const sacredNavTheme = buildNavTheme(themeId);
  const mainScreenOptions = buildMainScreenOptions(themeId);
  // Called unconditionally (Rules of Hooks) even though only one of these is
  // ever actually used below, depending on phase/org — see useAppDrawer.ts.
  const orgDrawer = useOrgDrawer();
  const guildDrawer = useGuildDrawer();
  const phase = computeNavPhase(user, org, guild);
  // Deliberately NOT memoized with useState: RootNavigator itself mounts
  // immediately (while isLoading is still true, before `phase` can possibly
  // be 'main' yet), and a useState initializer only runs on THAT first
  // render — it would permanently cache the wrong phase before auth even
  // resolves. NavigationContainer only consults initialState on its OWN
  // first mount (once isLoading flips false and this subtree finally
  // renders) and ignores it on every render after, so recomputing this
  // plain value each render is both correct and cheap.
  const initialNavState = loadPersistedNavState(phase);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.chrome} />
      </View>
    );
  }

  if (needsBiometricUnlock) {
    return <BiometricLockScreen />;
  }

  // Key by phase + user so logout → other account never leaves stale
  // OrgChoice / Join screens stacked visually on top of each other.
  const navKey = `${phase}:${user?.id ?? 'guest'}`;

  return (
    <NavigationContainer
      key={navKey}
      theme={sacredNavTheme}
      initialState={initialNavState}
      onReady={() => {
        const name =
          (initialNavState?.routes?.[initialNavState.index ?? 0]?.name as
            | string
            | undefined) ??
          (phase === 'guild' ? 'GuildHome' : phase === 'main' ? 'OrgHome' : null);
        if (name) {
          orgDrawer.setRouteName(name);
          guildDrawer.setRouteName(name);
        }
      }}
      onStateChange={(state) => {
        persistNavState(phase, state);
        const name =
          (state?.routes?.[state.index ?? 0]?.name as string | undefined) ??
          null;
        orgDrawer.setRouteName(name);
        guildDrawer.setRouteName(name);
      }}
    >
      {!user ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Signup" component={SignupScreen} />
          <AuthStack.Screen
            name="TwoFactorChallenge"
            component={TwoFactorChallengeScreen}
          />
          <AuthStack.Screen
            name="EmailVerification"
            component={EmailVerificationScreen}
          />
          <AuthStack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
          <AuthStack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
          />
        </AuthStack.Navigator>
      ) : !user.profileComplete ? (
        <ProfileSetupStack.Navigator screenOptions={{ headerShown: false }}>
          <ProfileSetupStack.Screen name="CompleteProfile">
            {() => <ProfileScreen mustComplete />}
          </ProfileSetupStack.Screen>
        </ProfileSetupStack.Navigator>
      ) : !org && !guild ? (
        <OrgSetupStack.Navigator screenOptions={{ headerShown: false }}>
          <OrgSetupStack.Screen name="OrgChoice" component={OrgChoiceScreen} />
          <OrgSetupStack.Screen name="CreateOrg" component={CreateOrgScreen} />
          <OrgSetupStack.Screen name="JoinOrg" component={JoinOrgScreen} />
        </OrgSetupStack.Navigator>
      ) : !org && guild ? (
        <>
          <MainStack.Navigator screenOptions={mainScreenOptions}>
            <MainStack.Screen
              name="GuildHome"
              component={GuildHomeScreen}
              options={{ headerShown: false }}
            />
            <MainStack.Screen
              name="Guild"
              component={GuildScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({ title: 'Guild' }))}
            />
            <MainStack.Screen
              name="Profile"
              component={ProfileScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({ title: 'Profile' }))}
            />
            <MainStack.Screen
              name="AccountSettings"
              component={AccountSettingsScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Account Settings',
              }))}
            />
            <MainStack.Screen
              name="TwoFactorSetup"
              component={TwoFactorSetupScreen}
              options={{ title: 'Two-Factor Authentication' }}
            />
            <MainStack.Screen
              name="Chat"
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Guild Chat',
              }))}
            >
              {() => <ChatScreenWithMedia channelKey="guild" title="Guild Chat" />}
            </MainStack.Screen>
            <MainStack.Screen
              name="SocialHandles"
              component={SocialHandlesScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Social Handles',
              }))}
            />
            <MainStack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={({ route }) => ({ title: titleCase(route.params.name) })}
            />
          </MainStack.Navigator>
          <SideDrawer
            open={guildDrawer.open}
            onClose={guildDrawer.close}
            title="Sacred Esports"
            subtitle={guild?.name ?? user?.name}
            sections={guildDrawer.sections}
          />
        </>
      ) : (
        <>
          <MainStack.Navigator screenOptions={mainScreenOptions}>
            <MainStack.Screen
              name="OrgHome"
              component={OrgHomeScreen}
              options={{ headerShown: false }}
            />
            <MainStack.Screen
              name="Profile"
              component={ProfileScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Profile' }))}
            />
            <MainStack.Screen
              name="Members"
              component={MembersScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Roster' }))}
            />
            <MainStack.Screen
              name="Guild"
              component={GuildScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Guild' }))}
            />
            <MainStack.Screen
              name="OrgSettings"
              component={OrgSettingsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Org Settings',
              }))}
            />
            <MainStack.Screen
              name="AccountSettings"
              component={AccountSettingsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Account Settings',
              }))}
            />
            <MainStack.Screen
              name="TwoFactorSetup"
              component={TwoFactorSetupScreen}
              options={{ title: 'Two-Factor Authentication' }}
            />
            <MainStack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={({ route }) => ({ title: titleCase(route.params.name) })}
            />
            <MainStack.Screen
              name="MediaFeed"
              component={MediaFeedScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Media' }))}
            />
            <MainStack.Screen
              name="Chat"
              options={sectionOptions(orgDrawer.openWith, ({ route }) => ({
                title:
                  route.params?.channelKey === 'guild' ? 'Guild Chat' : 'Team Chat',
              }))}
            >
              {({ route }) => (
                <ChatScreenWithMedia
                  channelKey={route.params?.channelKey ?? 'org'}
                  title={route.params?.channelKey === 'guild' ? 'Guild Chat' : 'Team Chat'}
                />
              )}
            </MainStack.Screen>
            <MainStack.Screen
              name="Scrims"
              component={ScrimsListScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Scrims & Tournaments',
              }))}
            />
            <MainStack.Screen
              name="AddEditScrim"
              component={AddEditScrimScreen}
              options={{ title: 'Scrim / Tournament' }}
            />
            <MainStack.Screen
              name="Stats"
              component={StatsHomeScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Stats' }))}
            />
            <MainStack.Screen
              name="ExtractionReview"
              component={ExtractionReviewScreen}
              options={{ title: 'Review Stats' }}
            />
            <MainStack.Screen
              name="PlayerStats"
              component={PlayerStatsScreen}
              options={({ route }) => ({ title: titleCase(route.params.name) })}
            />
            <MainStack.Screen
              name="Voice"
              getComponent={() =>
                require('../screens/voice/VoiceChannelScreen').VoiceChannelScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Team Voice',
              }))}
            />
            <MainStack.Screen
              name="Maps"
              component={MapsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Maps' }))}
            />
            <MainStack.Screen
              name="RuleBook"
              component={RuleBookScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Rule Book',
              }))}
            />
            <MainStack.Screen
              name="PointsTable"
              component={PointsTableScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Points Table',
              }))}
            />

            <MainStack.Screen
              name="SocialHandles"
              component={SocialHandlesScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Social Handles',
              }))}
            />
          </MainStack.Navigator>
          <SideDrawer
            open={orgDrawer.open}
            onClose={orgDrawer.close}
            title="Sacred Esports"
            subtitle={org?.name ?? user?.name}
            sections={orgDrawer.sections}
          />
        </>
      )}
    </NavigationContainer>
  );
}
