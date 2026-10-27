import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { TOKEN_STORAGE_KEY } from '../../api/client';
import * as voiceApi from '../../api/voice';
import { VoiceConfig } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useHostedVoiceChannel } from '../../voice/useHostedVoiceChannel';
import { useSelfHostedVoiceChannel } from '../../voice/useSelfHostedVoiceChannel';
import { VoiceChannelController } from '../../voice/types';
import { sharedStyles } from '../shared';

function HostedVoiceChannel({ config }: { config: Extract<VoiceConfig, { mode: 'hosted' }> }) {
  const voice = useHostedVoiceChannel(config.url, config.token);
  return <VoiceChannelBody voice={voice} />;
}

function SelfHostedVoiceChannel({ authToken }: { authToken: string }) {
  const voice = useSelfHostedVoiceChannel(authToken);
  return <VoiceChannelBody voice={voice} />;
}

function VoiceChannelBody({ voice }: { voice: VoiceChannelController }) {
  const { user } = useAuth();
  const inChannel = voice.status === 'connected';

  return (
    <View style={styles.screen}>
      <View style={styles.channelCard}>
        <Text style={styles.channelLabel}>VOICE CHANNEL</Text>
        <Text style={styles.channelName}>Team Voice</Text>
        <Text style={styles.channelMeta}>
          {voice.status === 'connecting'
            ? 'Connecting…'
            : inChannel
              ? `${voice.participants.length + 1} connected`
              : 'Empty — join to talk with your team'}
        </Text>

        {voice.status === 'idle' && (
          <Pressable style={styles.joinButton} onPress={voice.join}>
            <Text style={styles.joinButtonText}>Join Voice Channel</Text>
          </Pressable>
        )}

        {voice.status === 'connecting' && (
          <View style={styles.connectingBlock}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {voice.status === 'error' && (
          <>
            <Text style={styles.errorText}>{voice.errorMessage}</Text>
            <Pressable style={styles.joinButton} onPress={voice.join}>
              <Text style={styles.joinButtonText}>Try Again</Text>
            </Pressable>
          </>
        )}
      </View>

      {inChannel && (
        <>
          <Text style={styles.sectionTitle}>In channel</Text>
          <FlatList
            data={[
              {
                id: user?.id ?? 'me',
                name: `${user?.name ?? 'You'} (You)`,
                isLocallyMuted: false,
                isSelf: true,
              },
              ...voice.participants.map((p) => ({ ...p, isSelf: false })),
            ]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={null}
            renderItem={({ item }) => (
              <View style={styles.participantRow}>
                <View style={styles.participantInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.name[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.participantName}>{item.name}</Text>
                    {item.isLocallyMuted && (
                      <Text style={styles.mutedHint}>Muted for you</Text>
                    )}
                  </View>
                </View>
                {!item.isSelf && (
                  <Pressable
                    style={[
                      styles.smallButton,
                      item.isLocallyMuted && styles.smallButtonActive,
                    ]}
                    onPress={() => voice.toggleParticipantMute(item.id)}
                  >
                    <Text
                      style={[
                        styles.smallButtonText,
                        item.isLocallyMuted && styles.smallButtonTextActive,
                      ]}
                    >
                      {item.isLocallyMuted ? 'Unmute' : 'Mute'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          />

          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.barButton, voice.isMuted && styles.barButtonDanger]}
              onPress={voice.toggleMute}
            >
              <Text style={styles.barButtonText}>
                {voice.isMuted ? 'Unmute Mic' : 'Mute Mic'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.barButton, styles.barButtonDanger]}
              onPress={voice.leave}
            >
              <Text style={styles.barButtonText}>Disconnect</Text>
            </Pressable>
          </View>
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
  screen: { flex: 1, backgroundColor: '#fff' },
  channelCard: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#1e1f22',
  },
  channelLabel: {
    color: '#949ba4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  channelName: { color: '#f2f3f5', fontSize: 20, fontWeight: '700' },
  channelMeta: { color: '#b5bac1', marginTop: 6, marginBottom: 16 },
  joinButton: {
    backgroundColor: '#23a559',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  joinButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  connectingBlock: { alignItems: 'center', paddingVertical: 8 },
  errorText: { color: '#f23f43', marginBottom: 12 },
  sectionTitle: {
    marginHorizontal: 16,
    marginBottom: 8,
    color: '#555',
    fontWeight: '600',
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  participantInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5865f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  participantName: { fontSize: 16, color: '#111' },
  mutedHint: { fontSize: 12, color: '#888', marginTop: 2 },
  smallButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallButtonActive: { backgroundColor: '#111', borderColor: '#111' },
  smallButtonText: { fontWeight: '600', color: '#111' },
  smallButtonTextActive: { color: '#fff' },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  barButton: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  barButtonDanger: { backgroundColor: '#dc2626' },
  barButtonText: { color: '#fff', fontWeight: '700' },
});
