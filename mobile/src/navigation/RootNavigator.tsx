import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { OrgChoiceScreen } from '../screens/OrgChoiceScreen';
import { CreateOrgScreen } from '../screens/CreateOrgScreen';
import { JoinOrgScreen } from '../screens/JoinOrgScreen';
import { OrgHomeScreen } from '../screens/OrgHomeScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MemberProfileScreen } from '../screens/profile/MemberProfileScreen';
import { MediaFeedScreen } from '../screens/media/MediaFeedScreen';
import { UploadMediaScreen } from '../screens/media/UploadMediaScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import {
  AuthStackParamList,
  OrgSetupStackParamList,
  MainStackParamList,
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OrgSetupStack = createNativeStackNavigator<OrgSetupStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

export function RootNavigator() {
  const { isLoading, user, org } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Signup" component={SignupScreen} />
        </AuthStack.Navigator>
      ) : !org ? (
        <OrgSetupStack.Navigator screenOptions={{ headerShown: false }}>
          <OrgSetupStack.Screen name="OrgChoice" component={OrgChoiceScreen} />
          <OrgSetupStack.Screen name="CreateOrg" component={CreateOrgScreen} />
          <OrgSetupStack.Screen name="JoinOrg" component={JoinOrgScreen} />
        </OrgSetupStack.Navigator>
      ) : (
        <MainStack.Navigator>
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
            name="MemberProfile"
            component={MemberProfileScreen}
            options={({ route }) => ({ title: route.params.name })}
          />
          <MainStack.Screen
            name="MediaFeed"
            component={MediaFeedScreen}
            options={{ title: 'Media' }}
          />
          <MainStack.Screen
            name="UploadMedia"
            component={UploadMediaScreen}
            options={{ title: 'Upload' }}
          />
          <MainStack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ title: 'Team Chat' }}
          />
        </MainStack.Navigator>
      )}
    </NavigationContainer>
  );
}
