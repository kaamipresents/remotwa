/**
 * TransportManager.ts — Transport orchestrator and fallback coordinator
 * Implements windows-audio-remote-spec.md Section 6 (Choosing a transport)
 * 
 * Auto-fallback strategy:
 * 1. Prefer Wi-Fi whenever available.
 * 2. Try saved IP first (capped to 3-second timeout).
 * 3. Try mDNS discovery.
 * 4. Fall back to BLE GATT if Wi-Fi does not answer within 3 seconds.
 * 5. Allow user to override with pinned preference ('auto' | 'wifi' | 'ble').
 */

import { DeviceInfo, useDeviceStore } from '../store/useDeviceStore';
import { WsTransport } from '../api/transports/WsTransport';
import { BleTransport } from '../api/transports/BleTransport';
import { ProtocolClient } from '../api/protocol';

export class TransportManager {
  private static instance: TransportManager;
  private wsTransport: WsTransport;
  private bleTransport: BleTransport;

  private constructor() {
    this.wsTransport = new WsTransport();
    this.bleTransport = new BleTransport();
  }

  public static getInstance(): TransportManager {
    if (!TransportManager.instance) {
      TransportManager.instance = new TransportManager();
    }
    return TransportManager.instance;
  }

  public getWsTransport(): WsTransport {
    return this.wsTransport;
  }

  public getBleTransport(): BleTransport {
    return this.bleTransport;
  }

  /**
   * Connects to a device using the active preference or auto-fallback strategy.
   */
  public async connect(
    client: ProtocolClient,
    device: DeviceInfo,
    onConnected: () => void
  ): Promise<'wifi' | 'ble'> {
    const preference = useDeviceStore.getState().transportPreference;
    const deviceStore = useDeviceStore.getState();

    // 1. If user pinned BLE preference
    if (preference === 'ble' || device.transport === 'ble') {
      console.log('[TransportManager] Pinned BLE preference: connecting over BLE...');
      client.setTransport(this.bleTransport);
      await this.bleTransport.connect(device.bleDeviceId || device.name || 'auto');
      deviceStore.setActiveTransportType('ble');
      onConnected();
      return 'ble';
    }

    // 2. If user pinned Wi-Fi preference
    if (preference === 'wifi') {
      if (!device.ip || !device.port) {
        throw new Error('Device has no IP/port for Wi-Fi connection.');
      }
      console.log(`[TransportManager] Pinned Wi-Fi preference: connecting to ws://${device.ip}:${device.port}...`);
      client.setTransport(this.wsTransport);
      await this.wsTransport.connect(`ws://${device.ip}:${device.port}`);
      deviceStore.setActiveTransportType('wifi');
      onConnected();
      return 'wifi';
    }

    // 3. 'auto' mode: Try Wi-Fi first with 3s timeout, then fall back to BLE
    if (device.ip && device.port) {
      console.log(`[TransportManager] Auto: Attempting Wi-Fi (ws://${device.ip}:${device.port}) with 3s timeout...`);
      client.setTransport(this.wsTransport);

      const wifiPromise = this.wsTransport.connect(`ws://${device.ip}:${device.port}`);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Wi-Fi connection timed out (3000ms)')), 3000)
      );

      try {
        await Promise.race([wifiPromise, timeoutPromise]);
        console.log('[TransportManager] Auto: Wi-Fi connected successfully!');
        deviceStore.setActiveTransportType('wifi');
        onConnected();
        return 'wifi';
      } catch (wifiErr: any) {
        console.warn(`[TransportManager] Wi-Fi failed (${wifiErr.message}), falling back to BLE...`);
        this.wsTransport.disconnect();
      }
    }

    // Wi-Fi unavailable or timed out; fall back to BLE
    console.log('[TransportManager] Falling back to BLE GATT transport...');
    client.setTransport(this.bleTransport);
    await this.bleTransport.connect(device.bleDeviceId || device.name || 'auto');
    deviceStore.setActiveTransportType('ble');
    onConnected();
    return 'ble';
  }

  public disconnectAll(): void {
    this.wsTransport.disconnect();
    this.bleTransport.disconnect();
    useDeviceStore.getState().setActiveTransportType(null);
  }
}
