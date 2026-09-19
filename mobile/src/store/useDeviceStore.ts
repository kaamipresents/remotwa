// useDeviceStore.ts — Device discovery, pairing tokens, and connection state
// Implements windows-audio-remote-spec.md Section 5 & 9

import { create } from 'zustand';

export interface DeviceInfo {
  id: string; // Stable GUID
  name: string;
  ip: string;
  port: number;
  token?: string; // 32-byte auth token
  lastConnected?: number;
}

export type ConnectionState =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'pairing'
  | 'connected'
  | 'reconnecting';

interface DeviceStoreState {
  savedDevices: DeviceInfo[];
  discoveredDevices: DeviceInfo[];
  activeDevice: DeviceInfo | null;
  connectionState: ConnectionState;
  reconnectCount: number;

  // Actions
  setConnectionState: (state: ConnectionState) => void;
  setActiveDevice: (device: DeviceInfo | null) => void;
  addDiscoveredDevice: (device: DeviceInfo) => void;
  clearDiscoveredDevices: () => void;
  saveDevice: (device: DeviceInfo) => void;
  updateDeviceToken: (deviceId: string, token: string) => void;
  forgetDevice: (deviceId: string) => void;
  incrementReconnectCount: () => void;
  resetReconnectCount: () => void;
}

export const useDeviceStore = create<DeviceStoreState>((set) => ({
  savedDevices: [],
  discoveredDevices: [],
  activeDevice: null,
  connectionState: 'idle',
  reconnectCount: 0,

  setConnectionState: (state) => set({ connectionState: state }),

  setActiveDevice: (device) => set({ activeDevice: device }),

  addDiscoveredDevice: (device) =>
    set((state) => {
      const existingIdx = state.discoveredDevices.findIndex((d) => d.id === device.id);
      if (existingIdx >= 0) {
        const updated = [...state.discoveredDevices];
        updated[existingIdx] = device;
        return { discoveredDevices: updated };
      }
      return { discoveredDevices: [...state.discoveredDevices, device] };
    }),

  clearDiscoveredDevices: () => set({ discoveredDevices: [] }),

  saveDevice: (device) =>
    set((state) => {
      const filtered = state.savedDevices.filter((d) => d.id !== device.id);
      const updated = [{ ...device, lastConnected: Date.now() }, ...filtered];
      return { savedDevices: updated };
    }),

  updateDeviceToken: (deviceId, token) =>
    set((state) => ({
      savedDevices: state.savedDevices.map((d) =>
        d.id === deviceId ? { ...d, token, lastConnected: Date.now() } : d
      ),
      activeDevice:
        state.activeDevice && state.activeDevice.id === deviceId
          ? { ...state.activeDevice, token }
          : state.activeDevice,
    })),

  forgetDevice: (deviceId) =>
    set((state) => ({
      savedDevices: state.savedDevices.filter((d) => d.id !== deviceId),
      activeDevice: state.activeDevice?.id === deviceId ? null : state.activeDevice,
    })),

  incrementReconnectCount: () =>
    set((state) => ({ reconnectCount: state.reconnectCount + 1 })),

  resetReconnectCount: () => set({ reconnectCount: 0 }),
}));
