import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { loadPersistedNavState, persistNavState } from './navPersist';
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
import { AdminScreen } from '../screens/admin/AdminScreen';
import { AnnouncementsScreen } from '../screens/announcements/AnnouncementsScreen';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { GuildHomeScreen } from '../screens/GuildHomeScreen';
import { GuildScreen } from '../screens/GuildScreen';
import { OrgSettingsScreen } from '../screens/OrgSettingsScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { TwoFactorSetupScreen } from '../screens/TwoFactorSetupScreen';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MemberProfileScreen } from '../screens/profile/MemberProfileScreen';
import { ChatScreenWithMedia } from '../screens/chat/ChatScreenWithMedia';
import { SocialHandlesScreen } from '../screens/SocialHandlesScreen';
// Heavy / rarely-opened screens (GL games, stats OCR, maps, media, voice)
// load on first navigate so cold start stays light on mid-range Android.
import { GameInviteBridge } from '../games/GameInviteBridge';
import { AnnouncementNotificationBridge } from '../notifications/AnnouncementNotificationBridge';
import { ChatNotificationBridge } from '../notifications/ChatNotificationBridge';
import { VoiceNotificationBridge } from '../notifications/VoiceNotificationBridge';
import { InviteLinkBridge } from '../invite/InviteLinkBridge';
import { SideDrawer } from '../ui/SideDrawer';
import { SectionStackHeader } from '../ui/SectionStackHeader';
import { useAdminDrawer, useGuildDrawer, useOrgDrawer } from './useAppDrawer';
import {
  AuthStackParamList,
  OrgSetupStackParamList,
  ProfileSetupStackParamList,
  MainStackParamList,
} from './types';
import { titleCase } from '../utils/titleCase';
import { colors } from '../theme';
import { navigationRef, notifyFocusedRouteChanged } from './navigationRef';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OrgSetupStack = createNativeStackNavigator<OrgSetupStackParamList>();
const ProfileSetupStack = createNativeStackNavigator<ProfileSetupStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

// Top-level drawer destinations (Roster, Maps, Stats, Guild, …).
// Hamburger stays on the left (same place as Home). Back sits on the row
// underneath — same layout as ChatFlowHeader when a chat is open.
function sectionOptions(
  openWith: (nav: any) => void,
  build?: (args: { navigation: any; route: any }) => Record<string, unknown>,
) {
  return (args: { navigation: any; route: any }) => {
    const built = build ? build(args) : {};
    const sectionTitle =
      typeof built.title === 'string' ? built.title : args.route.name;
    return {
      ...built,
      header: () => (
        <SectionStackHeader
          navigation={args.navigation}
          openWith={openWith}
          sectionTitle={sectionTitle}
        />
      ),
      headerBackVisible: false,
    };
  };
}

// Nested drill-downs (member profile, edit scrim, player stats, …): system
// back chevron pops to the previous screen. Sidebar is for section switches,
// not for unwinding an in-section stack.
function detailOptions(
  build?: (args: { navigation: any; route: any }) => Record<string, unknown>,
) {
  return (args: { navigation: any; route: any }) => ({
    ...(build ? build(args) : {}),
    headerBackVisible: true,
    headerBackButtonDisplayMode: 'minimal' as const,
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
    // A 280ms cross-fade read as lag on every tap: with no directional cue
    // the screen looks like it's waiting on the network rather than moving.
    // iOS keeps its platform transition so the interactive swipe-back edge
    // gesture stays intact; Android gets an explicit, shorter slide.
    animation: (Platform.OS === 'ios' ? 'default' : 'slide_from_right') as
      | 'default'
      | 'slide_from_right',
    animationDuration: 220,
  };
}

// Persist/restore the current stack so web refresh and native process death
// don't drop the user back on Home. Phase-tagged in navPersist so a stale
// Auth route never gets handed to the Main navigator.
type NavPhase =
  | 'auth'
  | 'profileSetup'
  | 'orgSetup'
  | 'guild'
  | 'main'
  | 'admin';
function computeNavPhase(
  user: { profileComplete: boolean; isPlatformAdmin?: boolean } | null,
  org: unknown,
  guild: unknown,
): NavPhase {
  if (!user) return 'auth';
  // A platform admin account has no in-game name and no guild — the player
  // onboarding would ask it for details nothing on the admin screen uses,
  // with no way past. Admins who DO have a guild fall through to the normal
  // phases below and reach Admin from the drawer, as before.
  if (user.isPlatformAdmin && !org && !guild) return 'admin';
  if (!user.profileComplete) return 'profileSetup';
  if (org) return 'main';
  if (guild) return 'guild';
  return 'orgSetup';
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
  const adminDrawer = useAdminDrawer();
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
      ref={navigationRef}
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
          adminDrawer.setRouteName(name);
        }
        notifyFocusedRouteChanged();
      }}
      onStateChange={(state) => {
        persistNavState(phase, state);
        const name =
          (state?.routes?.[state.index ?? 0]?.name as string | undefined) ??
          null;
        orgDrawer.setRouteName(name);
        guildDrawer.setRouteName(name);
        adminDrawer.setRouteName(name);
        notifyFocusedRouteChanged();
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
      ) : user.isPlatformAdmin && !org && !guild ? (
        // Platform admin with no guild of their own: straight to the
        // dashboard. It gets the same section chrome as everywhere else —
        // hamburger on the left, settings gear (Theme / Security / Logout)
        // on the right — because otherwise this account has no route to any
        // of those at all: they all live behind an org or guild it lacks.
        <>
          <MainStack.Navigator screenOptions={mainScreenOptions}>
            <MainStack.Screen
              name="Admin"
              component={AdminScreen}
              options={sectionOptions(adminDrawer.openWith, () => ({
                title: 'Platform Admin',
              }))}
            />
            <MainStack.Screen
              name="Profile"
              component={ProfileScreen}
              options={sectionOptions(adminDrawer.openWith, () => ({
                title: 'Profile',
              }))}
            />
            <MainStack.Screen
              name="AccountSettings"
              component={AccountSettingsScreen}
              options={sectionOptions(adminDrawer.openWith, () => ({
                title: 'Account Settings',
              }))}
            />
            <MainStack.Screen
              name="TwoFactorSetup"
              component={TwoFactorSetupScreen}
              options={detailOptions(() => ({
                title: 'Two-Factor Authentication',
              }))}
            />
            <MainStack.Screen
              name="Permissions"
              component={PermissionsScreen}
              options={detailOptions(() => ({ title: 'Permissions' }))}
            />
            <MainStack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={detailOptions(({ route }) => ({
                title: titleCase(route.params.name),
              }))}
            />
          </MainStack.Navigator>
          <SideDrawer
            open={adminDrawer.open}
            onClose={adminDrawer.close}
            title="Sacred Esports"
            subtitle="Platform admin"
            sections={adminDrawer.sections}
          />
        </>
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
              options={detailOptions(() => ({
                title: 'Two-Factor Authentication',
              }))}
            />
            <MainStack.Screen
              name="Permissions"
              component={PermissionsScreen}
              options={detailOptions(() => ({ title: 'Permissions' }))}
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
              name="GuildVoice"
              getComponent={() =>
                require('../screens/voice/VoiceChannelScreen').GuildVoiceScreen
              }
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Guild Voice',
              }))}
            />
            <MainStack.Screen
              name="Games"
              getComponent={() =>
                require('../screens/games/GamesHubScreen').GamesHubScreen
              }
              options={sectionOptions(guildDrawer.openWith, () => ({ title: 'Games' }))}
            />
            <MainStack.Screen
              name="GameRoom"
              getComponent={() =>
                require('../screens/games/GameRoomScreen').GameRoomScreen
              }
              options={detailOptions(({ route }) => ({
                title:
                  route.params?.game === 'ludo'
                    ? 'Ludo'
                    : route.params?.game === 'rps'
                      ? 'Stone Paper Scissors'
                      : route.params?.game === 'cut'
                        ? 'Cut'
                        : route.params?.game === 'boots'
                          ? 'Boots'
                          : 'Game',
              }))}
            />
            <MainStack.Screen
              name="GoLive"
              getComponent={() =>
                require('../screens/live/GoLiveScreen').GoLiveScreen
              }
              options={sectionOptions(guildDrawer.openWith, () => ({ title: 'Go Live' }))}
            />
            <MainStack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={detailOptions(({ route }) => ({
                title: titleCase(route.params.name),
              }))}
            />
            <MainStack.Screen
              name="Announcements"
              component={AnnouncementsScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Announcements',
              }))}
            />
            <MainStack.Screen
              name="Achievements"
              component={AchievementsScreen}
              options={sectionOptions(guildDrawer.openWith, () => ({
                title: 'Achievements',
              }))}
            />
            <MainStack.Screen
              name="Admin"
              component={AdminScreen}
              options={detailOptions(() => ({ title: 'Admin' }))}
            />
            <MainStack.Screen
              name="DirectVoice"
              getComponent={() =>
                require('../screens/voice/DirectVoiceScreen').DirectVoiceScreen
              }
              options={detailOptions(() => ({ title: '1-on-1 Voice' }))}
            />
          </MainStack.Navigator>
          <SideDrawer
            open={guildDrawer.open}
            onClose={guildDrawer.close}
            title="Sacred Esports"
            subtitle={guild?.name ?? user?.name}
            sections={guildDrawer.sections}
          />
          <GameInviteBridge />
          <ChatNotificationBridge />
          <AnnouncementNotificationBridge />
          <VoiceNotificationBridge />
          <InviteLinkBridge />
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
              options={detailOptions(() => ({
                title: 'Two-Factor Authentication',
              }))}
            />
            <MainStack.Screen
              name="Permissions"
              component={PermissionsScreen}
              options={detailOptions(() => ({ title: 'Permissions' }))}
            />
            <MainStack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={detailOptions(({ route }) => ({
                title: titleCase(route.params.name),
              }))}
            />
            <MainStack.Screen
              name="MediaFeed"
              getComponent={() =>
                require('../screens/media/MediaFeedScreen').MediaFeedScreen
              }
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
              getComponent={() =>
                require('../screens/scrims/ScrimsListScreen').ScrimsListScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Scrims & Tournaments',
              }))}
            />
            <MainStack.Screen
              name="AddEditScrim"
              getComponent={() =>
                require('../screens/scrims/AddEditScrimScreen').AddEditScrimScreen
              }
              options={detailOptions(() => ({
                title: 'Scrim / Tournament',
              }))}
            />
            <MainStack.Screen
              name="Stats"
              getComponent={() =>
                require('../screens/stats/StatsHomeScreen').StatsHomeScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Stats' }))}
            />
            <MainStack.Screen
              name="ExtractionReview"
              getComponent={() =>
                require('../screens/stats/ExtractionReviewScreen').ExtractionReviewScreen
              }
              options={detailOptions(() => ({
                title: 'Review Stats',
              }))}
            />
            <MainStack.Screen
              name="PlayerStats"
              getComponent={() =>
                require('../screens/stats/PlayerStatsScreen').PlayerStatsScreen
              }
              options={detailOptions(({ route }) => ({
                title: titleCase(route.params.name),
              }))}
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
              getComponent={() => require('../screens/MapsScreen').MapsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Maps' }))}
            />
            <MainStack.Screen
              name="RuleBook"
              getComponent={() =>
                require('../screens/RuleBookScreen').RuleBookScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Rule Book',
              }))}
            />
            <MainStack.Screen
              name="PointsTable"
              getComponent={() =>
                require('../screens/PointsTableScreen').PointsTableScreen
              }
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
            <MainStack.Screen
              name="GuildVoice"
              getComponent={() =>
                require('../screens/voice/VoiceChannelScreen').GuildVoiceScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Guild Voice',
              }))}
            />
            <MainStack.Screen
              name="Games"
              getComponent={() =>
                require('../screens/games/GamesHubScreen').GamesHubScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Games' }))}
            />
            <MainStack.Screen
              name="GameRoom"
              getComponent={() =>
                require('../screens/games/GameRoomScreen').GameRoomScreen
              }
              options={detailOptions(({ route }) => ({
                title:
                  route.params?.game === 'ludo'
                    ? 'Ludo'
                    : route.params?.game === 'rps'
                      ? 'Stone Paper Scissors'
                      : route.params?.game === 'cut'
                        ? 'Cut'
                        : route.params?.game === 'boots'
                          ? 'Boots'
                          : 'Game',
              }))}
            />
            <MainStack.Screen
              name="GoLive"
              getComponent={() =>
                require('../screens/live/GoLiveScreen').GoLiveScreen
              }
              options={sectionOptions(orgDrawer.openWith, () => ({ title: 'Go Live' }))}
            />
            <MainStack.Screen
              name="Announcements"
              component={AnnouncementsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Announcements',
              }))}
            />
            <MainStack.Screen
              name="Achievements"
              component={AchievementsScreen}
              options={sectionOptions(orgDrawer.openWith, () => ({
                title: 'Achievements',
              }))}
            />
            <MainStack.Screen
              name="Admin"
              component={AdminScreen}
              options={detailOptions(() => ({ title: 'Admin' }))}
            />
            <MainStack.Screen
              name="DirectVoice"
              getComponent={() =>
                require('../screens/voice/DirectVoiceScreen').DirectVoiceScreen
              }
              options={detailOptions(() => ({ title: '1-on-1 Voice' }))}
            />
          </MainStack.Navigator>
          <SideDrawer
            open={orgDrawer.open}
            onClose={orgDrawer.close}
            title="Sacred Esports"
            subtitle={org?.name ?? user?.name}
            sections={orgDrawer.sections}
          />
          <GameInviteBridge />
          <ChatNotificationBridge />
          <AnnouncementNotificationBridge />
          <VoiceNotificationBridge />
          <InviteLinkBridge />
        </>
      )}
    </NavigationContainer>
  );
}
