// PlayerScreen.tsx — Now Playing & Master Volume control tab
// Implements windows-audio-remote-spec.md Section 4 (Screens)

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useAudioStore } from '../store/useAudioStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { ConnectionService } from '../api/ConnectionService';
import { VolumeSlider } from '../components/VolumeSlider';
import { ConnectionBanner } from '../components/ConnectionBanner';

export const PlayerScreen: React.FC = () => {
  const masterLevel = useAudioStore((s) => s.masterLevel);
  const masterMuted = useAudioStore((s) => s.masterMuted);
  const track = useAudioStore((s) => s.track);
  const albumArt = useAudioStore((s) => s.albumArt);

  const connectionState = useDeviceStore((s) => s.connectionState);
  const activeDevice = useDeviceStore((s) => s.activeDevice);

  const isConnected = connectionState === 'connected';
  const isControlsDisabled = !isConnected;

  const currentArtUri = track?.trackId ? albumArt[track.trackId] : null;

  const handleVolumeChange = (newLevel: number) => {
    ConnectionService.getInstance().setVolume(newLevel).catch(console.error);
  };

  const handleMuteToggle = () => {
    ConnectionService.getInstance().setMute(!masterMuted).catch(console.error);
  };

  const handleTransport = (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') => {
    ConnectionService.getInstance().transportAction(action).catch(console.error);
  };

  const isPlaying = track?.playState === 'playing';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ConnectionBanner />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Header: Device Info */}
        <View style={styles.deviceHeader}>
          <View style={[styles.statusDot, isConnected ? styles.dotGreen : styles.dotAmber]} />
          <Text style={styles.deviceName}>
            {activeDevice?.name || 'No PC Connected'}
          </Text>
        </View>

        {/* Album Art Card */}
        <View style={styles.artContainer}>
          {currentArtUri ? (
            <Image source={{ uri: currentArtUri }} style={styles.artImage} resizeMode="cover" />
          ) : (
            <View style={styles.artPlaceholder}>
              <Text style={styles.vinylIcon}>🎵</Text>
              <Text style={styles.placeholderSub}>
                {track?.title ? 'Remotva Audio' : 'No Media Playing'}
              </Text>
            </View>
          )}
        </View>

        {/* Track Metadata */}
        <View style={styles.metaContainer}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {track?.title || 'Nothing Playing'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track?.artist ? `${track.artist}${track.album ? ` • ${track.album}` : ''}` : 'Windows PC Audio'}
          </Text>
        </View>

        {/* Media Transport Controls */}
        <View style={[styles.controlsRow, isControlsDisabled && styles.disabledControls]}>
          <TouchableOpacity
            style={styles.transportBtn}
            onPress={() => handleTransport('previous')}
            disabled={isControlsDisabled}
          >
            <Text style={styles.transportIcon}>⏮</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playPauseBtn, isPlaying && styles.playPauseActive]}
            onPress={() => handleTransport('toggle')}
            disabled={isControlsDisabled}
          >
            <Text style={styles.playPauseIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.transportBtn}
            onPress={() => handleTransport('next')}
            disabled={isControlsDisabled}
          >
            <Text style={styles.transportIcon}>⏭</Text>
          </TouchableOpacity>
        </View>

        {/* Master Volume Section */}
        <View style={styles.volumeCard}>
          <View style={styles.volumeHeader}>
            <Text style={styles.volumeTitle}>Master Volume</Text>
            <TouchableOpacity
              style={[styles.muteBtn, masterMuted && styles.muteBtnActive]}
              onPress={handleMuteToggle}
              disabled={isControlsDisabled}
            >
              <Text style={styles.muteBtnText}>{masterMuted ? '🔇 MUTED' : '🔊 MUTE'}</Text>
            </TouchableOpacity>
          </View>

          <VolumeSlider
            value={masterLevel}
            onValueChange={handleVolumeChange}
            disabled={isControlsDisabled}
            accentColor={masterMuted ? '#ef4444' : '#3b82f6'}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  container: {
    padding: 24,
    alignItems: 'center',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#18181b',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotGreen: {
    backgroundColor: '#10b981',
  },
  dotAmber: {
    backgroundColor: '#f59e0b',
  },
  deviceName: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
  },
  artContainer: {
    width: 260,
    height: 260,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 24,
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  artPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#18181b',
  },
  vinylIcon: {
    fontSize: 72,
    marginBottom: 10,
  },
  placeholderSub: {
    color: '#71717a',
    fontSize: 13,
  },
  metaContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
  },
  trackArtist: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  disabledControls: {
    opacity: 0.4,
  },
  transportBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  transportIcon: {
    fontSize: 20,
    color: '#ffffff',
  },
  playPauseBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playPauseActive: {
    backgroundColor: '#2563eb',
  },
  playPauseIcon: {
    fontSize: 28,
    color: '#ffffff',
  },
  volumeCard: {
    width: '100%',
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  volumeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  volumeTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  muteBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#27272a',
  },
  muteBtnActive: {
    backgroundColor: '#7f1d1d',
  },
  muteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
