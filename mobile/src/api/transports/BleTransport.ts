/**
 * BleTransport.ts — Bluetooth Low Energy transport for Remotva
 * Implements windows-audio-remote-spec.md Section 6 & 7 over BLE GATT.
 * 
 * Uses react-native-ble-plx with 3-byte chunking protocol and MessagePack
 * integer-mapped envelope serialization.
 */

import { ITransport, ProtocolEnvelope } from '../protocol';
import { BleChunker } from './BleChunker';
import { BleCodec } from './BleCodec';
import { requestBlePermissions } from '../../services/BlePermissions';

// Remotva Service & Characteristic UUIDs
export const BLE_SERVICE_UUID = '18377000-7c1a-4d9f-9f3a-7140e4f20837';
export const BLE_CHAR_COMMAND = '18377001-7c1a-4d9f-9f3a-7140e4f20837';
export const BLE_CHAR_EVENT   = '18377002-7c1a-4d9f-9f3a-7140e4f20837';
export const BLE_CHAR_CONTROL = '18377003-7c1a-4d9f-9f3a-7140e4f20837';

export class BleTransport implements ITransport {
  private bleManager: any = null;
  private connectedDevice: any = null;
  private connectedDeviceId: string | null = null;
  private isDeviceConnected = false;
  private negotiatedMtu = 185;

  private chunker = new BleChunker();
  private messageCallbacks: ((raw: string) => void)[] = [];
  private closeCallbacks: ((reason: string) => void)[] = [];
  private errorCallbacks: ((err: any) => void)[] = [];

  constructor() {
    this.initBleManager();
  }

  private initBleManager() {
    try {
      const { BleManager } = require('react-native-ble-plx');
      this.bleManager = new BleManager();
    } catch {
      // Safe fallback when running in non-native Node or mock testing environments
      this.bleManager = null;
    }
  }

  public async connect(targetDeviceIdOrName: string): Promise<void> {
    const hasPermission = await requestBlePermissions();
    if (!hasPermission) {
      const err = new Error('Bluetooth permissions not granted.');
      this.notifyError(err);
      throw err;
    }

    if (!this.bleManager) {
      throw new Error('BleManager is not available in this environment.');
    }

    this.disconnect();

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.bleManager.stopDeviceScan();
          reject(new Error(`BLE discovery timed out searching for '${targetDeviceIdOrName}'`));
        }
      }, 8000);

      // Start scanning for Remotva peripheral
      this.bleManager.startDeviceScan(
        [BLE_SERVICE_UUID],
        null,
        async (error: any, device: any) => {
          if (error) {
            clearTimeout(timeoutTimer);
            if (!resolved) {
              resolved = true;
              this.notifyError(error);
              reject(error);
            }
            return;
          }

          if (device) {
            const matchesId = targetDeviceIdOrName && device.id === targetDeviceIdOrName;
            const matchesName = targetDeviceIdOrName && device.name && device.name.toLowerCase().includes(targetDeviceIdOrName.toLowerCase());
            const autoMatch = !targetDeviceIdOrName || targetDeviceIdOrName === 'auto';

            if (matchesId || matchesName || autoMatch) {
              clearTimeout(timeoutTimer);
              this.bleManager.stopDeviceScan();

              try {
                const connected = await device.connect();
                this.connectedDevice = connected;
                this.connectedDeviceId = connected.id;
                this.isDeviceConnected = true;

                // Discover services & characteristics
                await connected.discoverAllServicesAndCharacteristics();

                // Request larger MTU (up to 512, negotiated down to OS support)
                try {
                  const mtuDevice = await connected.requestMTU(512);
                  this.negotiatedMtu = mtuDevice.mtu || 185;
                } catch {
                  this.negotiatedMtu = 185;
                }

                // Subscribe to Event characteristic notifications
                connected.monitorCharacteristicForService(
                  BLE_SERVICE_UUID,
                  BLE_CHAR_EVENT,
                  (err: any, characteristic: any) => {
                    if (err) {
                      console.warn('[BleTransport] Notification error:', err);
                      return;
                    }
                    if (characteristic?.value) {
                      this.handleIncomingBase64Chunk(characteristic.value);
                    }
                  }
                );

                // Listen for disconnects
                connected.onDisconnected(() => {
                  this.handleDisconnected('Device disconnected');
                });

                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              } catch (connErr) {
                if (!resolved) {
                  resolved = true;
                  this.notifyError(connErr);
                  reject(connErr);
                }
              }
            }
          }
        }
      );
    });
  }

  public disconnect(): void {
    if (this.connectedDevice) {
      try {
        this.connectedDevice.cancelConnection();
      } catch {}
      this.connectedDevice = null;
      this.connectedDeviceId = null;
    }
    this.isDeviceConnected = false;
    this.chunker.reset();
  }

  public isConnected(): boolean {
    return this.isDeviceConnected;
  }

  public async send(message: string): Promise<void> {
    if (!this.connectedDevice || !this.isDeviceConnected) {
      throw new Error('BLE transport not connected.');
    }

    try {
      const envelope: ProtocolEnvelope = JSON.parse(message);
      const encodedBytes = BleCodec.encode(envelope);
      const chunks = this.chunker.chunk(encodedBytes, this.negotiatedMtu);

      for (const chunk of chunks) {
        const base64Chunk = this.uint8ArrayToBase64(chunk);
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          BLE_SERVICE_UUID,
          BLE_CHAR_COMMAND,
          base64Chunk
        );
      }
    } catch (err) {
      this.notifyError(err);
      throw err;
    }
  }

  public onMessage(callback: (raw: string) => void): void {
    this.messageCallbacks.push(callback);
  }

  public onClose(callback: (reason: string) => void): void {
    this.closeCallbacks.push(callback);
  }

  public onError(callback: (err: any) => void): void {
    this.errorCallbacks.push(callback);
  }

  // Internal chunk processor
  public handleIncomingChunk(chunk: Uint8Array): void {
    const fullBytes = this.chunker.tryReassemble(chunk);
    if (fullBytes) {
      const envelope = BleCodec.decode(fullBytes);
      if (envelope) {
        const json = JSON.stringify(envelope);
        for (const cb of this.messageCallbacks) {
          cb(json);
        }
      }
    }
  }

  private handleIncomingBase64Chunk(base64: string): void {
    const bytes = this.base64ToUint8Array(base64);
    this.handleIncomingChunk(bytes);
  }

  private handleDisconnected(reason: string): void {
    this.isDeviceConnected = false;
    this.connectedDevice = null;
    for (const cb of this.closeCallbacks) {
      cb(reason);
    }
  }

  private notifyError(err: any): void {
    for (const cb of this.errorCallbacks) {
      cb(err);
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
