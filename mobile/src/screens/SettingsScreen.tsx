// SettingsScreen.tsx — App configuration, saved PC management, and transport preferences
// Implements windows-audio-remote-spec.md Section 4 (Screens)

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useDeviceStore } from '../store/useDeviceStore';
import { ConnectionService } from '../api/ConnectionService';

interface SettingsScreenProps {
  navigation: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const activeDevice = useDeviceStore((s) => s.activeDevice);
  const connectionState = useDeviceStore((s) => s.connectionState);
  const savedDevices = useDeviceStore((s) => s.savedDevices);
  const forgetDevice = useDeviceStore((s) => s.forgetDevice);

  const [preferBle, setPreferBle] = useState(false);
  const [hardwareVolumeKeys, setHardwareVolumeKeys] = useState(true);

  const handleDisconnect = () => {
    ConnectionService.getInstance().disconnect();
    navigation.navigate('Devices');
  };

  const handleForgetActive = () => {
    if (!activeDevice) return;
    Alert.alert(
      'Forget PC',
      `Are you sure you want to forget ${activeDevice.name}? You will need to pair again with a PIN.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: () => {
            forgetDevice(activeDevice.id);
            ConnectionService.getInstance().disconnect();
            navigation.navigate('Devices');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Current Connection Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Active Connection</Text>
          {activeDevice ? (
            <View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Connected PC</Text>
                <Text style={styles.rowValue}>{activeDevice.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Endpoint</Text>
                <Text style={styles.rowValue}>{activeDevice.ip}:{activeDevice.port}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Status</Text>
                <Text style={[styles.rowValue, { color: connectionState === 'connected' ? '#10b981' : '#f59e0b' }]}>
                  {connectionState.toUpperCase()}
                </Text>
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleDisconnect}>
                  <Text style={styles.actionBtnText}>Disconnect</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleForgetActive}>
                  <Text style={[styles.actionBtnText, styles.dangerBtnText]}>Forget PC</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={styles.noActiveText}>No active PC connection</Text>
          )}
        </View>

        {/* Transport Preferences */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Transport Preferences</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>Prefer Bluetooth LE</Text>
              <Text style={styles.switchSub}>When Wi-Fi and Bluetooth are both available</Text>
            </View>
            <Switch
              value={preferBle}
              onValueChange={setPreferBle}
              trackColor={{ false: '#27272a', true: '#3b82f6' }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: '#27272a', paddingTop: 14 }]}>
            <View style={styles.switchTextCol}>
              <Text style={styles.switchLabel}>Hardware Volume Buttons</Text>
              <Text style={styles.switchSub}>Control PC volume with phone physical keys</Text>
            </View>
            <Switch
              value={hardwareVolumeKeys}
              onValueChange={setHardwareVolumeKeys}
              trackColor={{ false: '#27272a', true: '#3b82f6' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>About</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Protocol Version</Text>
            <Text style={styles.rowValue}>v1 (JSON / WebSocket)</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Client Version</Text>
            <Text style={styles.rowValue}>1.0.0</Text>
          </View>
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
    flex: 1,
    padding: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  sectionCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  btnRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#27272a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  dangerBtn: {
    backgroundColor: '#7f1d1d',
    marginRight: 0,
    marginLeft: 8,
  },
  dangerBtnText: {
    color: '#fca5a5',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchTextCol: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  switchSub: {
    color: '#71717a',
    fontSize: 12,
  },
  noActiveText: {
    color: '#71717a',
    fontSize: 14,
    paddingVertical: 8,
  },
});
