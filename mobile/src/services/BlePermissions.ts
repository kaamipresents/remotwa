/**
 * BlePermissions.ts
 * Helper for Android 12+ (API 31+) and legacy Bluetooth runtime permissions.
 */

import { PermissionsAndroid, Platform } from 'react-native';

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  // Android 12+ (API level >= 31)
  if (Platform.Version >= 31) {
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const scanGranted = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted = result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

      return scanGranted && connectGranted;
    } catch (err) {
      console.warn('[BlePermissions] Error requesting Android 12+ permissions:', err);
      return false;
    }
  } else {
    // Android < 12 requires ACCESS_FINE_LOCATION for BLE scanning
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission for Bluetooth',
          message: 'Remotva requires location permission to discover nearby PC Bluetooth devices.',
          buttonNeutral: 'Ask Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('[BlePermissions] Error requesting location permission:', err);
      return false;
    }
  }
}
