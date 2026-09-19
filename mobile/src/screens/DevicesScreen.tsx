// DevicesScreen.tsx — Discovered PCs, saved PCs, connection status, and manual IP entry
// Implements windows-audio-remote-spec.md Section 4 (Screens)

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { DeviceInfo, useDeviceStore } from '../store/useDeviceStore';
import { ConnectionService } from '../api/ConnectionService';
import { MdnsService } from '../api/discovery/mdns';

interface DevicesScreenProps {
  navigation: any;
}

export const DevicesScreen: React.FC<DevicesScreenProps> = ({ navigation }) => {
  const savedDevices = useDeviceStore((s) => s.savedDevices);
  const discoveredDevices = useDeviceStore((s) => s.discoveredDevices);
  const activeDevice = useDeviceStore((s) => s.activeDevice);
  const connectionState = useDeviceStore((s) => s.connectionState);

  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8377');
  const [manualName, setManualName] = useState('My PC');
  const [showManualModal, setShowManualModal] = useState(false);

  useEffect(() => {
    MdnsService.startDiscovery();
    return () => MdnsService.stopDiscovery();
  }, []);

  // Listen for pairing state transition
  useEffect(() => {
    if (connectionState === 'pairing') {
      navigation.navigate('Pairing');
    }
  }, [connectionState, navigation]);

  const handleConnect = async (device: DeviceInfo) => {
    try {
      await ConnectionService.getInstance().connectToDevice(device);
      if (useDeviceStore.getState().connectionState === 'connected') {
        navigation.navigate('MainTabs');
      }
    } catch (err: any) {
      Alert.alert('Connection Failed', err.message || 'Could not connect to PC');
    }
  };

  const handleAddManual = () => {
    if (!manualIp.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid IP address');
      return;
    }
    const port = parseInt(manualPort, 10) || 8377;
    const device = MdnsService.addManualDevice(manualIp, port, manualName);
    setShowManualModal(false);
    handleConnect(device);
  };

  const renderDeviceItem = ({ item }: { item: DeviceInfo }) => {
    const isCurrent = activeDevice?.id === item.id;
    const hasToken = !!item.token;

    return (
      <TouchableOpacity
        style={[styles.deviceCard, isCurrent && styles.deviceCardActive]}
        onPress={() => handleConnect(item)}
      >
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceTitle}>{item.name}</Text>
          <Text style={styles.deviceSub}>{item.ip}:{item.port}</Text>
          {hasToken ? (
            <Text style={styles.pairedBadge}>🔒 Paired</Text>
          ) : (
            <Text style={styles.unpairedBadge}>⚡ Pair Required</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.connectBtn}
          onPress={() => handleConnect(item)}
        >
          <Text style={styles.connectBtnText}>{isCurrent ? 'Active' : 'Connect'}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Devices</Text>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => setShowManualModal(!showManualModal)}
          >
            <Text style={styles.manualBtnText}>+ Add IP</Text>
          </TouchableOpacity>
        </View>

        {showManualModal ? (
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Connect via IP</Text>
            <TextInput
              style={styles.input}
              placeholder="PC IP (e.g. 192.168.1.50 or 127.0.0.1)"
              placeholderTextColor="#71717a"
              value={manualIp}
              onChangeText={setManualIp}
              autoCapitalize="none"
              keyboardType="numeric"
            />
            <View style={styles.portRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="Port (8377)"
                placeholderTextColor="#71717a"
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Name (e.g. Desktop)"
                placeholderTextColor="#71717a"
                value={manualName}
                onChangeText={setManualName}
              />
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowManualModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddManual}>
                <Text style={styles.saveBtnText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <FlatList
          data={[...savedDevices, ...discoveredDevices.filter(d => !savedDevices.some(s => s.id === d.id))]}
          keyExtractor={(item) => item.id}
          renderItem={renderDeviceItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyText}>Scanning for Windows PCs on your Wi-Fi...</Text>
              <Text style={styles.emptySub}>
                Make sure Remotva Companion is running on your PC, or tap "+ Add IP" to connect directly.
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
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
  },
  manualBtn: {
    backgroundColor: '#27272a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  manualBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  deviceCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  deviceCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e293b',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  deviceSub: {
    fontSize: 13,
    color: '#a1a1aa',
    marginBottom: 6,
  },
  pairedBadge: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  unpairedBadge: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600',
  },
  connectBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  manualCard: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  manualTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#27272a',
    borderRadius: 8,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  portRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  cancelBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 54,
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
