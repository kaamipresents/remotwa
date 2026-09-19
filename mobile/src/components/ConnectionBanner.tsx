// ConnectionBanner.tsx — Dimmed status banner for reconnecting and connecting states
// Implements windows-audio-remote-spec.md Section 5 (Connection Lifecycle)

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useDeviceStore } from '../store/useDeviceStore';

export const ConnectionBanner: React.FC = () => {
  const connectionState = useDeviceStore((s) => s.connectionState);
  const reconnectCount = useDeviceStore((s) => s.reconnectCount);
  const activeDevice = useDeviceStore((s) => s.activeDevice);

  if (connectionState === 'connected' || connectionState === 'idle') {
    return null;
  }

  const isReconnecting = connectionState === 'reconnecting';
  const text = isReconnecting
    ? `Reconnecting to ${activeDevice?.name || 'PC'} (attempt ${reconnectCount})...`
    : `Connecting to ${activeDevice?.name || 'PC'}...`;

  return (
    <View style={[styles.banner, isReconnecting ? styles.reconnecting : styles.connecting]}>
      <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  connecting: {
    backgroundColor: '#2563eb',
  },
  reconnecting: {
    backgroundColor: '#d97706',
  },
  spinner: {
    marginRight: 10,
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
