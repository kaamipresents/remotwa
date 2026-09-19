// ForegroundService.ts — Android Foreground Service interface for keep-alive & lock-screen media controls
// Implements windows-audio-remote-spec.md Section 11 (Gotchas: Android Doze and background limits)

import { NativeModules, Platform } from 'react-native';
import { TrackMetadata } from '../api/protocol';
import { ConnectionService } from '../api/ConnectionService';

const { RemotvaMediaService } = NativeModules;

export class ForegroundService {
  private static isRunning = false;

  public static startService(track?: TrackMetadata | null) {
    if (Platform.OS !== 'android') return;
    if (this.isRunning) {
      this.updateNotification(track);
      return;
    }

    this.isRunning = true;
    try {
      if (RemotvaMediaService?.start) {
        RemotvaMediaService.start(
          track?.title || 'Connected to PC',
          track?.artist || 'Remotva Audio Remote',
          track?.playState === 'playing'
        );
      }
    } catch (e) {
      console.warn('[ForegroundService] Could not start native media service:', e);
    }
  }

  public static updateNotification(track?: TrackMetadata | null) {
    if (Platform.OS !== 'android' || !this.isRunning) return;

    try {
      if (RemotvaMediaService?.update) {
        RemotvaMediaService.update(
          track?.title || 'Connected to PC',
          track?.artist || 'Remotva Audio Remote',
          track?.playState === 'playing'
        );
      }
    } catch (e) {
      console.warn('[ForegroundService] Could not update native notification:', e);
    }
  }

  public static stopService() {
    if (Platform.OS !== 'android' || !this.isRunning) return;
    this.isRunning = false;

    try {
      if (RemotvaMediaService?.stop) {
        RemotvaMediaService.stop();
      }
    } catch (e) {
      console.warn('[ForegroundService] Could not stop native media service:', e);
    }
  }

  public static handleNotificationAction(action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') {
    ConnectionService.getInstance().transportAction(action).catch(console.error);
  }
}
