// mdns.ts — mDNS network discovery for Remotva PC companion (_pcaudio._tcp)
// Implements windows-audio-remote-spec.md Section 6 (Discovery)

import { DeviceInfo, useDeviceStore } from '../../store/useDeviceStore';

export class MdnsService {
  private static isScanning = false;

  public static startDiscovery() {
    if (this.isScanning) return;
    this.isScanning = true;
    useDeviceStore.getState().setConnectionState('discovering');

    console.log('[mDNS] Starting discovery for service _pcaudio._tcp...');

    // When react-native-zeroconf is installed, it scans for _pcaudio._tcp
    // We provide both native integration hooks and safe fallback handling
    try {
      // Lazy load react-native-zeroconf if present in native build
      const ZeroConfModule = require('react-native-zeroconf').default;
      if (ZeroConfModule) {
        const zeroconf = new ZeroConfModule();
        zeroconf.scan('pcaudio', 'tcp', 'local.');

        zeroconf.on('resolved', (service: any) => {
          console.log('[mDNS] Service resolved:', service);
          const txt = service.txt || {};
          const device: DeviceInfo = {
            id: txt.id || service.name,
            name: txt.name || service.name || 'Windows PC',
            ip: service.host || service.addresses?.[0] || '127.0.0.1',
            port: service.port || 8377,
          };
          useDeviceStore.getState().addDiscoveredDevice(device);
        });

        zeroconf.on('error', (err: any) => {
          console.warn('[mDNS] ZeroConf scan error:', err);
        });
      }
    } catch {
      console.log('[mDNS] Native ZeroConf not available in this environment. Manual IP discovery active.');
    }
  }

  public static stopDiscovery() {
    this.isScanning = false;
    try {
      const ZeroConfModule = require('react-native-zeroconf').default;
      if (ZeroConfModule) {
        const zeroconf = new ZeroConfModule();
        zeroconf.stop();
      }
    } catch { }
  }

  public static addManualDevice(ip: string, port = 8377, name = 'Windows PC'): DeviceInfo {
    const device: DeviceInfo = {
      id: `manual_${ip}_${port}`,
      name,
      ip: ip.trim(),
      port,
    };
    useDeviceStore.getState().addDiscoveredDevice(device);
    useDeviceStore.getState().saveDevice(device);
    return device;
  }
}
