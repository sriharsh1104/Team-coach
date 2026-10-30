import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { DarkTheme, NavigationContainer, NavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { TwoFactorChallengeScreen } from '../screens/TwoFactorChallengeScreen';
import { EmailVerificationScreen } from '../screens/EmailVerificationScreen';
import { BiometricLockScreen } from '../screens/BiometricLockScreen';
import { OrgChoiceScreen } from '../screens/OrgChoiceScreen';
import { CreateOrgScreen } from '../screens/CreateOrgScreen';
import { JoinOrgScreen } from '../screens/JoinOrgScreen';
import { OrgHomeScreen } from '../screens/OrgHomeScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { OrgSettingsScreen } from '../screens/OrgSettingsScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { TwoFactorSetupScreen } from '../screens/TwoFactorSetupScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MemberProfileScreen } from '../screens/profile/MemberProfileScreen';
import { MediaFeedScreen } from '../screens/media/MediaFeedScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { ScrimsListScreen } from '../screens/scrims/ScrimsListScreen';
import { AddEditScrimScreen } from '../screens/scrims/AddEditScrimScreen';
import { StatsHomeScreen } from '../screens/stats/StatsHomeScreen';
import { ExtractionReviewScreen } from '../screens/stats/ExtractionReviewScreen';
import { PlayerStatsScreen } from '../screens/stats/PlayerStatsScreen';
import { VoiceChannelScreen } from '../screens/voice/VoiceChannelScreen';
import { RuleBookScreen } from '../screens/RuleBookScreen';
import { SocialHandlesScreen } from '../screens/SocialHandlesScreen';
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

const sacredNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.chrome,
    notification: colors.link,
  },
};

const mainScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const, color: colors.text },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

// On a web page refresh, React Navigation has nothing to restore from and
// always boots back at the default route — this persists/restores the
// current screen across a refresh so an F5 doesn't throw the user back to
// OrgHome. Native builds don't need this ("refresh" isn't really a native
// concept the same way), so it's web-only.
type NavPhase = 'auth' | 'profileSetup' | 'orgSetup' | 'main';
const NAV_STATE_KEY = 'team-coach.navState';

function computeNavPhase(
  user: { profileComplete: boolean } | null,
  org: unknown,
): NavPhase {
  if (!user) return 'auth';
  if (!user.profileComplete) return 'profileSetup';
  if (!org) return 'orgSetup';
  return 'main';
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
  const { isLoading, user, org, needsBiometricUnlock } = useAuth();
  const phase = computeNavPhase(user, org);
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

  return (
    <NavigationContainer
      theme={sacredNavTheme}
      initialState={initialNavState}
      onStateChange={(state) => persistNavState(phase, state)}
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
        </AuthStack.Navigator>
      ) : !user.profileComplete ? (
        <ProfileSetupStack.Navigator screenOptions={{ headerShown: false }}>
          <ProfileSetupStack.Screen name="CompleteProfile">
            {() => <ProfileScreen mustComplete />}
          </ProfileSetupStack.Screen>
        </ProfileSetupStack.Navigator>
      ) : !org ? (
        <OrgSetupStack.Navigator screenOptions={{ headerShown: false }}>
          <OrgSetupStack.Screen name="OrgChoice" component={OrgChoiceScreen} />
          <OrgSetupStack.Screen name="CreateOrg" component={CreateOrgScreen} />
          <OrgSetupStack.Screen name="JoinOrg" component={JoinOrgScreen} />
        </OrgSetupStack.Navigator>
      ) : (
        <MainStack.Navigator screenOptions={mainScreenOptions}>
          <MainStack.Screen
            name="OrgHome"
            component={OrgHomeScreen}
            options={{ headerShown: false }}
          />
          <MainStack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'Profile' }}
          />
          <MainStack.Screen
            name="Members"
            component={MembersScreen}
            options={{ title: 'Team Members' }}
          />
          <MainStack.Screen
            name="OrgSettings"
            component={OrgSettingsScreen}
            options={{ title: 'Org Settings' }}
          />
          <MainStack.Screen
            name="AccountSettings"
            component={AccountSettingsScreen}
            options={{ title: 'Account Settings' }}
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
            options={{ title: 'Media' }}
          />
          <MainStack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ title: 'Team Chat' }}
          />
          <MainStack.Screen
            name="Scrims"
            component={ScrimsListScreen}
            options={{ title: 'Scrims & Tournaments' }}
          />
          <MainStack.Screen
            name="AddEditScrim"
            component={AddEditScrimScreen}
            options={{ title: 'Scrim / Tournament' }}
          />
          <MainStack.Screen
            name="Stats"
            component={StatsHomeScreen}
            options={{ title: 'Stats' }}
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
            component={VoiceChannelScreen}
            options={{ title: 'Team Voice' }}
          />
          <MainStack.Screen
            name="RuleBook"
            component={RuleBookScreen}
            options={{ title: 'Rule Book' }}
          />
          <MainStack.Screen
            name="SocialHandles"
            component={SocialHandlesScreen}
            options={{ title: 'Social Handles' }}
          />
        </MainStack.Navigator>
      )}
    </NavigationContainer>
  );
}
