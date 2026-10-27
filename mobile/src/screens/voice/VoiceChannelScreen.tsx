import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_STORAGE_KEY } from '../../api/client';
import * as voiceApi from '../../api/voice';
import { VoiceConfig } from '../../api/types';
import { useHostedVoiceChannel } from '../../voice/useHostedVoiceChannel';
import { useSelfHostedVoiceChannel } from '../../voice/useSelfHostedVoiceChannel';
import { sharedStyles } from '../shared';

function HostedVoiceChannel({ config }: { config: Extract<VoiceConfig, { mode: 'hosted' }> }) {
  const voice = useHostedVoiceChannel(config.url, config.token);
  return <VoiceChannelBody voice={voice} />;
}

function SelfHostedVoiceChannel({ authToken }: { authToken: string }) {
  const voice = useSelfHostedVoiceChannel(authToken);
  return <VoiceChannelBody voice={voice} />;
}

function VoiceChannelBody({ voice }: { voice: ReturnType<typeof useHostedVoiceChannel> }) {
  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Team Voice</Text>

      {voice.status === 'idle' && (
        <Pressable style={sharedStyles.button} onPress={voice.join}>
          <Text style={sharedStyles.buttonText}>Join Voice Channel</Text>
        </Pressable>
      )}

      {voice.status === 'connecting' && (
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: '#888' }}>Connecting…</Text>
        </View>
      )}

      {voice.status === 'error' && (
        <Text style={sharedStyles.error}>{voice.errorMessage}</Text>
      )}

      {voice.status === 'connected' && (
        <>
          <Text style={{ textAlign: 'center', color: '#16a34a', marginBottom: 16 }}>
            ● Connected
          </Text>
          <FlatList
            data={voice.participants}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', color: '#888' }}>
                No one else is in the channel yet.
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.participantRow}>
                <Text>{item.name}</Text>
              </View>
            )}
          />
          <Pressable style={sharedStyles.button} onPress={voice.toggleMute}>
            <Text style={sharedStyles.buttonText}>
              {voice.isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </Pressable>
          <Pressable
            style={[sharedStyles.button, { backgroundColor: '#dc2626' }]}
            onPress={voice.leave}
          >
            <Text style={sharedStyles.buttonText}>Leave Channel</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function VoiceChannelScreen() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([voiceApi.getVoiceConfig(), SecureStore.getItemAsync(TOKEN_STORAGE_KEY)])
      .then(([cfg, token]) => {
        if (!token) {
          setError('You are signed out. Please log in again to use voice channels.');
          return;
        }
        setConfig(cfg);
        setAuthToken(token);
      })
      .catch((err) =>
        setError(err?.response?.data?.message?.toString() ?? 'Could not load voice config'),
      );
  }, []);

  if (error) {
    return (
      <View style={sharedStyles.container}>
        <Text style={sharedStyles.error}>{error}</Text>
      </View>
    );
  }

  if (!config || !authToken) {
    return (
      <View style={sharedStyles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return config.mode === 'hosted' ? (
    <HostedVoiceChannel config={config} />
  ) : (
    <SelfHostedVoiceChannel authToken={authToken} />
  );
}

const styles = StyleSheet.create({
  participantRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
