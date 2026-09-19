// ConnectionService.ts — Singleton coordinator binding ProtocolClient, WsTransport, and Zustand stores
// Implements windows-audio-remote-spec.md Section 5 (Connection Lifecycle)

import { ProtocolClient } from './protocol';
import { WsTransport, WsConnectionState } from './transports/WsTransport';
import { useAudioStore } from '../store/useAudioStore';
import { DeviceInfo, useDeviceStore } from '../store/useDeviceStore';

export class ConnectionService {
  private static instance: ConnectionService;
  private client: ProtocolClient;
  private transport: WsTransport;
  private currentDevice: DeviceInfo | null = null;

  private constructor() {
    this.client = new ProtocolClient();
    this.transport = new WsTransport();
    this.client.setTransport(this.transport);

    this.setupTransportListeners();
    this.setupProtocolEventListeners();
  }

  public static getInstance(): ConnectionService {
    if (!ConnectionService.instance) {
      ConnectionService.instance = new ConnectionService();
    }
    return ConnectionService.instance;
  }

  public getClient(): ProtocolClient {
    return this.client;
  }

  private setupTransportListeners() {
    this.transport.onStateChange((state: WsConnectionState) => {
      const deviceStore = useDeviceStore.getState();

      if (state === 'connected') {
        // Authenticate immediately upon socket open
        this.performHandshake();
      } else if (state === 'reconnecting') {
        deviceStore.setConnectionState('reconnecting');
        deviceStore.incrementReconnectCount();
      } else if (state === 'disconnected') {
        deviceStore.setConnectionState('idle');
      }
    });
  }

  private setupProtocolEventListeners() {
    const audioStore = useAudioStore.getState();

    this.client.on('volumeChanged', (data: { level: number; muted: boolean }) => {
      useAudioStore.getState().updateMaster(data.level, data.muted);
    });

    this.client.on('sessionsChanged', (data: { sessions: any[] }) => {
      if (data && Array.isArray(data.sessions)) {
        useAudioStore.getState().updateSessions(data.sessions);
      }
    });

    this.client.on('sessionVolumeChanged', (data: { sessionId: string; level: number; muted: boolean }) => {
      useAudioStore.getState().updateSessionVolume(data.sessionId, data.level, data.muted);
    });

    this.client.on('trackChanged', async (data: any) => {
      useAudioStore.getState().updateTrack(data);

      // On-demand album art fetch if track has art and is not yet cached
      if (data.hasArt && data.trackId) {
        const cached = useAudioStore.getState().albumArt[data.trackId];
        if (!cached) {
          try {
            const artRes = await this.client.getAlbumArt(data.trackId, 300);
            if (artRes && artRes.data) {
              useAudioStore.getState().setAlbumArt(data.trackId, `data:image/jpeg;base64,${artRes.data}`);
            }
          } catch (e) {
            console.warn('[ConnectionService] Failed to fetch album art:', e);
          }
        }
      }
    });

    this.client.on('playStateChanged', (data: { playState: any; position: number }) => {
      useAudioStore.getState().updatePlayState(data.playState, data.position);
    });

    this.client.on('serverShutdown', (data: { reason?: string }) => {
      console.warn('[ConnectionService] Companion server is shutting down:', data.reason);
      this.disconnect();
    });
  }

  public async connectToDevice(device: DeviceInfo): Promise<void> {
    this.currentDevice = device;
    const deviceStore = useDeviceStore.getState();
    deviceStore.setActiveDevice(device);
    deviceStore.setConnectionState('connecting');
    deviceStore.resetReconnectCount();

    const wsUrl = `ws://${device.ip}:${device.port}`;
    console.log(`[ConnectionService] Connecting to ${wsUrl}...`);

    try {
      await this.transport.connect(wsUrl);
    } catch (err: any) {
      console.error('[ConnectionService] Connection failed:', err.message);
      deviceStore.setConnectionState('idle');
      throw err;
    }
  }

  private async performHandshake() {
    const deviceStore = useDeviceStore.getState();
    const token = this.currentDevice?.token || null;

    try {
      console.log('[ConnectionService] Sending hello with token...');
      const helloRes = await this.client.hello(token, 'Pixel 8 (Remotva App)');

      console.log(`[ConnectionService] Authenticated with ${helloRes.serverName}! Fetching state snapshot...`);
      const snapshot = await this.client.getState();
      useAudioStore.getState().setSnapshot(snapshot);

      deviceStore.setConnectionState('connected');
      deviceStore.resetReconnectCount();

      // If track has art, initiate background art fetch
      if (snapshot.track?.hasArt && snapshot.track.trackId) {
        this.fetchAlbumArt(snapshot.track.trackId);
      }
    } catch (err: any) {
      if (err.code === 'ERR_AUTH' || err.message?.includes('Pairing required')) {
        console.log('[ConnectionService] Server requires pairing. Transitioning to pairing state.');
        deviceStore.setConnectionState('pairing');
      } else {
        console.error('[ConnectionService] Handshake failed:', err.message);
        deviceStore.setConnectionState('idle');
      }
    }
  }

  public async pairWithPin(pin: string): Promise<boolean> {
    const deviceStore = useDeviceStore.getState();
    try {
      const pairRes = await this.client.pair(pin, 'Pixel 8 (Remotva App)');
      if (pairRes.token && this.currentDevice) {
        console.log('[ConnectionService] Pairing successful! Received token.');
        const updated = { ...this.currentDevice, token: pairRes.token };
        this.currentDevice = updated;
        deviceStore.saveDevice(updated);
        deviceStore.updateDeviceToken(updated.id, pairRes.token);

        // Authenticate with new token
        await this.performHandshake();
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[ConnectionService] Pairing failed:', err.message);
      throw err;
    }
  }

  private async fetchAlbumArt(trackId: string) {
    try {
      const artRes = await this.client.getAlbumArt(trackId, 300);
      if (artRes && artRes.data) {
        useAudioStore.getState().setAlbumArt(trackId, `data:image/jpeg;base64,${artRes.data}`);
      }
    } catch { }
  }

  public disconnect() {
    this.transport.disconnect();
    this.currentDevice = null;
    useDeviceStore.getState().setActiveDevice(null);
    useDeviceStore.getState().setConnectionState('idle');
  }

  // Convenience methods forwarding to protocol client
  public setVolume(level: number) {
    return this.client.setVolume(level);
  }

  public setMute(muted: boolean) {
    return this.client.setMute(muted);
  }

  public adjustVolume(delta: number) {
    return this.client.adjustVolume(delta);
  }

  public transportAction(action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') {
    return this.client.transport(action);
  }

  public setSessionVolume(sessionId: string, level: number) {
    return this.client.setSessionVolume(sessionId, level);
  }

  public setSessionMute(sessionId: string, muted: boolean) {
    return this.client.setSessionMute(sessionId, muted);
  }
}
