// PairingScreen.tsx — PIN entry & QR code pairing screen
// Implements windows-audio-remote-spec.md Section 4 & 9 (Pairing and Security)

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ConnectionService } from '../api/ConnectionService';
import { useDeviceStore } from '../store/useDeviceStore';

interface PairingScreenProps {
  navigation: any;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ navigation }) => {
  const activeDevice = useDeviceStore((s) => s.activeDevice);
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handlePair = async () => {
    if (pin.length !== 6) {
      setErrorMessage('Please enter the full 6-digit PIN.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const success = await ConnectionService.getInstance().pairWithPin(pin);
      if (success) {
        Alert.alert('Paired Successfully', `Connected and authenticated with ${activeDevice?.name || 'PC'}!`, [
          { text: 'OK', onPress: () => navigation.navigate('MainTabs') },
        ]);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Pairing failed. Check PIN and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.lockIcon}>🔐</Text>
          <Text style={styles.title}>Pair with {activeDevice?.name || 'PC'}</Text>
          <Text style={styles.sub}>
            Right-click the Remotva icon in your PC's system tray and select "Pair New Device..."
          </Text>
        </View>

        <View style={styles.pinCard}>
          <Text style={styles.inputLabel}>Enter 6-digit PIN from PC screen:</Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(text) => {
              setPin(text.replace(/[^0-9]/g, '').slice(0, 6));
              setErrorMessage('');
            }}
            placeholder="000000"
            placeholderTextColor="#52525b"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, (pin.length !== 6 || isSubmitting) && styles.submitBtnDisabled]}
            onPress={handlePair}
            disabled={pin.length !== 6 || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Confirm PIN & Pair</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelBtnText}>Back to Devices</Text>
        </TouchableOpacity>
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
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  pinCard: {
    width: '100%',
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    marginBottom: 24,
  },
  inputLabel: {
    color: '#e4e4e7',
    fontSize: 14,
    marginBottom: 16,
  },
  pinInput: {
    width: '80%',
    backgroundColor: '#27272a',
    borderRadius: 12,
    color: '#3b82f6',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 14,
    textAlign: 'center',
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
  },
});
