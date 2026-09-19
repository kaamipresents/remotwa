// protocol.ts — Client protocol codec, request-reply matching, and type definitions
// Implements windows-audio-remote-spec.md Section 7 & 8

export type MessageType = 'cmd' | 'res' | 'evt';

export interface ProtocolEnvelope<T = any> {
  v: number;
  t: MessageType;
  id?: string;
  m?: string;
  ok?: boolean;
  err?: string;
  msg?: string;
  p?: T;
}

export interface MasterVolumeState {
  level: number; // 0.0 to 1.0
  muted: boolean;
}

export interface TrackMetadata {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  hasArt: boolean;
  duration: number; // ms
  position: number; // ms
  playState: 'playing' | 'paused' | 'stopped';
}

export interface AudioSessionInfo {
  sessionId: string;
  name: string;
  level: number; // 0.0 to 1.0
  muted: boolean;
  active: boolean;
}

export interface SystemStateSnapshot {
  master: MasterVolumeState;
  track?: TrackMetadata;
  sessions: AudioSessionInfo[];
}

export interface HelloResponse {
  serverName: string;
  deviceId: string;
  v: number;
  capabilities: string[];
}

export interface PairResponse {
  token: string;
  deviceId: string;
}

export interface AlbumArtResponse {
  mime: string;
  data: string; // base64 encoded JPEG
}

export type EventHandler = (data: any) => void;

export interface ITransport {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(message: string): void;
  isConnected(): boolean;
  onMessage(callback: (raw: string) => void): void;
  onClose(callback: (reason: string) => void): void;
  onError(callback: (err: any) => void): void;
}

export class ProtocolClient {
  private transport: ITransport | null = null;
  private idCounter = 1;
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: Error) => void; timer: any }
  >();
  private eventHandlers = new Map<string, Set<EventHandler>>();

  constructor() {}

  public setTransport(transport: ITransport) {
    this.transport = transport;
    this.transport.onMessage((raw: string) => this.handleIncomingMessage(raw));
    this.transport.onClose((reason) => this.handleTransportClosed(reason));
  }

  public getTransport(): ITransport | null {
    return this.transport;
  }

  public on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  public off(event: string, handler: EventHandler) {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private dispatchEvent(event: string, data: any) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data);
        } catch (e) {
          console.error(`[ProtocolClient] Error in event handler for ${event}:`, e);
        }
      });
    }
  }

  public sendCommand<T = any>(method: string, payload: any = null, timeoutMs = 5000): Promise<T> {
    if (!this.transport || !this.transport.isConnected()) {
      return Promise.reject(new Error('Transport is not connected'));
    }

    const id = `c${this.idCounter++}`;
    const envelope: ProtocolEnvelope = {
      v: 1,
      t: 'cmd',
      id,
      m: method,
      p: payload,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Command '${method}' (${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.transport!.send(JSON.stringify(envelope));
    });
  }

  private handleIncomingMessage(raw: string) {
    let envelope: ProtocolEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch (e) {
      console.error('[ProtocolClient] Malformed incoming JSON message:', raw);
      return;
    }

    if (envelope.t === 'res' && envelope.id) {
      const pending = this.pendingRequests.get(envelope.id);
      if (pending) {
        this.pendingRequests.delete(envelope.id);
        clearTimeout(pending.timer);

        if (envelope.ok) {
          pending.resolve(envelope.p);
        } else {
          const err = new Error(envelope.msg || envelope.err || 'Command failed');
          (err as any).code = envelope.err;
          pending.reject(err);
        }
      }
    } else if (envelope.t === 'evt' && envelope.m) {
      this.dispatchEvent(envelope.m, envelope.p);
    }
  }

  private handleTransportClosed(reason: string) {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Connection closed before response: ${reason}`));
    }
    this.pendingRequests.clear();
    this.dispatchEvent('connectionClosed', { reason });
  }

  // High-level API methods
  public ping(): Promise<{ serverTime: number }> {
    return this.sendCommand('ping');
  }

  public hello(token: string | null, clientName: string): Promise<HelloResponse> {
    return this.sendCommand('hello', { token, clientName, versions: [1] });
  }

  public pair(pin: string, clientName: string): Promise<PairResponse> {
    return this.sendCommand('pair', { pin, clientName });
  }

  public getState(): Promise<SystemStateSnapshot> {
    return this.sendCommand('getState');
  }

  public setVolume(level: number): Promise<{ level: number }> {
    return this.sendCommand('setVolume', { level: Math.max(0, Math.min(1, level)) });
  }

  public setMute(muted: boolean): Promise<{ muted: boolean }> {
    return this.sendCommand('setMute', { muted });
  }

  public adjustVolume(delta: number): Promise<{ level: number }> {
    return this.sendCommand('adjustVolume', { delta });
  }

  public transport(action: 'play' | 'pause' | 'toggle' | 'next' | 'previous'): Promise<{ playState: string }> {
    return this.sendCommand('transport', { action });
  }

  public getSessions(): Promise<{ sessions: AudioSessionInfo[] }> {
    return this.sendCommand('getSessions');
  }

  public setSessionVolume(sessionId: string, level: number): Promise<{ level: number }> {
    return this.sendCommand('setSessionVolume', { sessionId, level: Math.max(0, Math.min(1, level)) });
  }

  public setSessionMute(sessionId: string, muted: boolean): Promise<{ muted: boolean }> {
    return this.sendCommand('setSessionMute', { sessionId, muted });
  }

  public getAlbumArt(trackId: string, maxSize = 300): Promise<AlbumArtResponse> {
    return this.sendCommand('getAlbumArt', { trackId, maxSize });
  }
}
