// MixerScreen.tsx — Per-app audio mixer tab
// Implements windows-audio-remote-spec.md Section 4 & 8 (Per-app Mixer)

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useAudioStore } from '../store/useAudioStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { ConnectionService } from '../api/ConnectionService';
import { VolumeSlider } from '../components/VolumeSlider';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { AudioSessionInfo } from '../api/protocol';

export const MixerScreen: React.FC = () => {
  const sessions = useAudioStore((s) => s.sessions);
  const connectionState = useDeviceStore((s) => s.connectionState);

  const isConnected = connectionState === 'connected';
  const isControlsDisabled = !isConnected;

  const handleSessionVolumeChange = (sessionId: string, newLevel: number) => {
    ConnectionService.getInstance()
      .setSessionVolume(sessionId, newLevel)
      .catch(console.error);
  };

  const handleSessionMuteToggle = (sessionId: string, currentMuted: boolean) => {
    ConnectionService.getInstance()
      .setSessionMute(sessionId, !currentMuted)
      .catch(console.error);
  };

  const renderSessionItem = ({ item }: { item: AudioSessionInfo }) => {
    return (
      <View style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.appIdentity}>
            <View style={styles.appIconBadge}>
              <Text style={styles.appIconText}>
                {item.name.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.appName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.sessionPid}>PID: {item.sessionId}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.muteBtn, item.muted && styles.muteBtnActive]}
            onPress={() => handleSessionMuteToggle(item.sessionId, item.muted)}
            disabled={isControlsDisabled}
          >
            <Text style={styles.muteBtnText}>{item.muted ? '🔇 MUTED' : '🔊 MUTE'}</Text>
          </TouchableOpacity>
        </View>

        <VolumeSlider
          value={item.level}
          onValueChange={(val) => handleSessionVolumeChange(item.sessionId, val)}
          disabled={isControlsDisabled}
          accentColor={item.muted ? '#ef4444' : '#10b981'}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ConnectionBanner />
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>App Mixer</Text>
          <Text style={styles.sessionCount}>
            {sessions.length} {sessions.length === 1 ? 'app' : 'apps'}
          </Text>
        </View>

        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderSessionItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔊</Text>
              <Text style={styles.emptyText}>No Active Sound Applications</Text>
              <Text style={styles.emptySub}>
                When Spotify, YouTube in Chrome, or a game plays sound on your PC, it will appear here automatically.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  sessionCount: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 24,
  },
  sessionCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appIconText: {
    color: '#e4e4e7',
    fontSize: 14,
    fontWeight: '700',
  },
  appName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    maxWidth: 180,
  },
  sessionPid: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  muteBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#27272a',
  },
  muteBtnActive: {
    backgroundColor: '#7f1d1d',
  },
  muteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#e4e4e7',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    color: '#71717a',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
