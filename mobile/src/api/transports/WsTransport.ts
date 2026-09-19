// WsTransport.ts — WebSocket transport with exponential backoff reconnect
// Implements windows-audio-remote-spec.md Section 6 & 7

import { ITransport } from '../protocol';

export type WsConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export class WsTransport implements ITransport {
  private ws: WebSocket | null = null;
  private currentUrl: string = '';
  private state: WsConnectionState = 'idle';
  private manualDisconnect = false;

  // Reconnection backoff
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private minBackoffMs = 500;
  private maxBackoffMs = 10000;
  private backoffMultiplier = 1.5;

  private messageCallbacks: ((raw: string) => void)[] = [];
  private closeCallbacks: ((reason: string) => void)[] = [];
  private errorCallbacks: ((err: any) => void)[] = [];
  private stateChangeCallbacks: ((state: WsConnectionState) => void)[] = [];

  constructor() {}

  public connect(url: string): Promise<void> {
    this.currentUrl = url;
    this.manualDisconnect = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    return this.initiateSocket();
  }

  private initiateSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

      try {
        if (this.ws) {
          this.ws.onclose = null;
          this.ws.onerror = null;
          this.ws.onmessage = null;
          this.ws.onopen = null;
          this.ws.close();
        }

        const socket = new WebSocket(this.currentUrl);
        let resolved = false;

        socket.onopen = () => {
          resolved = true;
          this.ws = socket;
          this.reconnectAttempts = 0;
          this.setState('connected');
          resolve();
        };

        socket.onmessage = (event) => {
          const data = typeof event.data === 'string' ? event.data : '';
          this.messageCallbacks.forEach((cb) => cb(data));
        };

        socket.onerror = (err) => {
          this.errorCallbacks.forEach((cb) => cb(err));
          if (!resolved) {
            resolved = true;
            reject(new Error(`WebSocket connection failed to ${this.currentUrl}`));
          }
        };

        socket.onclose = (event) => {
          this.ws = null;
          const reason = event.reason || `Code ${event.code}`;
          this.closeCallbacks.forEach((cb) => cb(reason));

          if (!this.manualDisconnect) {
            this.scheduleReconnect();
          } else {
            this.setState('disconnected');
          }
        };
      } catch (err) {
        this.setState('disconnected');
        reject(err);
      }
    });
  }

  private scheduleReconnect() {
    this.setState('reconnecting');
    this.clearReconnectTimer();

    const backoff = Math.min(
      this.minBackoffMs * Math.pow(this.backoffMultiplier, this.reconnectAttempts),
      this.maxBackoffMs
    );
    this.reconnectAttempts++;

    console.log(`[WsTransport] Reconnecting in ${Math.round(backoff)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.initiateSocket().catch((e) => {
        console.warn(`[WsTransport] Reconnect attempt ${this.reconnectAttempts} failed:`, e.message);
      });
    }, backoff);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  public send(message: string) {
    if (!this.isConnected()) {
      throw new Error('Cannot send message: WebSocket is not open');
    }
    this.ws!.send(message);
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getState(): WsConnectionState {
    return this.state;
  }

  private setState(newState: WsConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeCallbacks.forEach((cb) => cb(newState));
    }
  }

  public onMessage(callback: (raw: string) => void) {
    this.messageCallbacks.push(callback);
  }

  public onClose(callback: (reason: string) => void) {
    this.closeCallbacks.push(callback);
  }

  public onError(callback: (err: any) => void) {
    this.errorCallbacks.push(callback);
  }

  public onStateChange(callback: (state: WsConnectionState) => void) {
    this.stateChangeCallbacks.push(callback);
    callback(this.state);
  }
}
