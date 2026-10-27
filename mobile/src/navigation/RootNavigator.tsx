import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { OrgChoiceScreen } from '../screens/OrgChoiceScreen';
import { CreateOrgScreen } from '../screens/CreateOrgScreen';
import { JoinOrgScreen } from '../screens/JoinOrgScreen';
import { OrgHomeScreen } from '../screens/OrgHomeScreen';
import { MembersScreen } from '../screens/MembersScreen';
import { OrgSettingsScreen } from '../screens/OrgSettingsScreen';
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

export function RootNavigator() {
  const { isLoading, user, org } = useAuth();

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

  return (
    <NavigationContainer theme={sacredNavTheme}>
      {!user ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Signup" component={SignupScreen} />
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
            options={{ title: 'My Profile' }}
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
        </MainStack.Navigator>
      )}
    </NavigationContainer>
  );
}
